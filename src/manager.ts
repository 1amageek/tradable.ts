import * as Pring from "pring"
import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, BalanceProtocol, AccountProtocol, StockType, StockValue, OrderStatus, PaymentDelegate, PaymentOptions, TransferOptions, Currency } from "./index"

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U): Promise<FirebaseFirestore.WriteBatch | void>
}

// 在庫の増減
// StripeAPIに接続
export class Manager
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    Balance extends BalanceProtocol,
    Account extends AccountProtocol<Balance>
    > {

    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _Balance: { new(id?: string, value?: { [key: string]: any }): Balance }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        balance: { new(id?: string, value?: { [key: string]: any }): Balance },
        account: { new(id?: string, value?: { [key: string]: any }): Account },
    ) {
        this._SKU = sku
        this._Product = product
        this._OrderItem = orderItem
        this._Order = order
        this._Balance = balance
        this._Account = account
    }

    async execute(order: Order, process: Process) {
        try {
            if (isUndefined(order.buyer)) throw Error(`[Tradable] Error: validation error, buyer is required`)
            if (isUndefined(order.selledBy)) throw Error(`[Tradable] Error: validation error, selledBy is required`)
            if (isUndefined(order.expirationDate)) throw Error(`[Tradable] Error: validation error, expirationDate is required`)
            if (isUndefined(order.currency)) throw Error(`[Tradable] Error: validation error, currency is required`)
            if (isUndefined(order.amount)) throw Error(`[Tradable] Error: validation error, amount is required`)

            // validation error
            const validationError = this.validate(order)
            if (validationError) {
                order.status = OrderStatus.rejected
                try {
                    await order.update()
                } catch (error) {
                    throw error
                }
                throw validationError
            }
            const batch = await process(order)
            if (batch) {
                await batch.commit()
            }
        } catch (error) {
            throw error
        }
    }

    private validate(order: Order): Error | void {
        if (!this.validateCurrency(order)) return Error(`[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`)
        if (!this.validateAmount(order)) return Error(`[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`)
        if (!this.validateMinimumAmount(order)) return Error(`[Tradable] Error: validation error, Amount is below the lower limit.`)
    }

    // Returns true if there is no problem in the verification
    private validateCurrency(order: Order): boolean {
        for (const item of order.items.objects) {
            if (item.currency !== order.currency) {
                return false
            }
        }
        return true
    }

    // Returns true if there is no problem in the verification
    private validateAmount(order: Order): boolean {
        let totalAmount: number = 0
        for (const item of order.items.objects) {
            totalAmount += item.amount
        }
        if (totalAmount !== order.amount) {
            return false
        }
        return true
    }

    private validateMinimumAmount(order: Order): boolean {
        const currency: Currency = order.currency
        const amount: number = order.amount
        if (0 < amount && amount < Currency.minimum(currency)) {
            return false
        }
        return true
    }

    public delegate?: PaymentDelegate

    async inventoryControl(order: Order) {
        try {

            // Skip
            if (order.status === OrderStatus.received ||
                order.status === OrderStatus.waitingForRefund ||
                order.status === OrderStatus.paid ||
                order.status === OrderStatus.waitingForPayment ||
                order.status === OrderStatus.canceled
            ) {
                return
            }

            order.status = OrderStatus.received
            await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {

                    const items: OrderItem[] = await order.items.get(this._OrderItem)

                    // Stock control
                    for (const item of items) {
                        const productID: string = item.product
                        const skuID: string = item.sku
                        const quantity: number = item.quantity
                        const product: Product = new this._Product(productID, {})
                        const sku: SKU = await product.skus.doc(skuID, this._SKU)
                        switch (sku.inventory.type) {
                            case StockType.finite: {
                                const remaining: number = sku.inventory.quantity - (sku.unitSales + quantity)
                                if (remaining < 0) {
                                    reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                }
                                const newUnitSales = sku.unitSales + quantity
                                transaction.update(sku.reference, { unitSales: newUnitSales })
                                break
                            }
                            case StockType.bucket: {
                                switch (sku.inventory.value) {
                                    case StockValue.outOfStock: {
                                        reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                    }
                                    default: {
                                        const newUnitSales = sku.unitSales + quantity
                                        transaction.update(sku.reference, { unitSales: newUnitSales })
                                    }
                                }
                            }
                            case StockType.infinite: {
                                const newUnitSales = sku.unitSales + quantity
                                transaction.update(sku.reference, { unitSales: newUnitSales })
                            }
                        }
                    }

                    transaction.update(order.reference, { status: OrderStatus.received })
                    resolve(`[Success] ORDER/${order.id}, USER/${order.selledBy}`)
                })
            })
        } catch (error) {
            order.status = OrderStatus.rejected
            try {
                await order.update()
            } catch (error) {
                throw error
            }
            throw error
        }
    }

    async pay(order: Order, options: PaymentOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

        // Skip for paid, waitingForRefund, refunded
        if (order.status === OrderStatus.paid ||
            order.status === OrderStatus.waitingForRefund ||
            order.status === OrderStatus.refunded
        ) {
            return
        }
        if (!(order.status === OrderStatus.received || order.status === OrderStatus.waitingForPayment)) {
            throw new Error(`[Failure] ORDER/${order.id}, Order is not a payable status.`)
        }
        if (!options.customer && !options.source) {
            throw new Error(`[Failure] ORDER/${order.id}, PaymentOptions required customer or source`)
        }
        if (!options.vendorType) {
            throw new Error(`[Failure] ORDER/${order.id}, PaymentOptions required vendorType`)
        }
        if (!this.delegate) {
            throw new Error(`[Failure] ORDER/${order.id}, Manager required delegate`)
        }

        if (order.amount > 0) {
            try {
                const result = await this.delegate.pay(order, options)
                order.paymentInformation = {
                    [options.vendorType]: result
                }                      
            } catch (error) {
                order.status = OrderStatus.waitingForPayment
                try {
                    await order.update()
                } catch (error) {
                    throw error
                }
                throw error
            }
    
            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        const account: Account = new this._Account(order.selledBy, {})
                        try {
                            await account.fetch()
                        } catch (error) {
                            reject(`[Failure] pay ORDER/${order.id}, Account could not be fetched.`)
                        }
    
                        const currency: string = order.currency
                        const balance: { [currency: string]: number } = account.balance || {}
                        const amount: number = balance[order.currency] || 0
                        const newAmount: number = amount + order.amount
                        transaction.set(account.reference, { balance: { [currency]: newAmount } }, { merge: true })
    
                        resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`)
                    })
                })
            } catch (error) {
                throw error
            }
        }

        order.status = OrderStatus.paid  
        return order.pack(Pring.BatchType.update, null, batch)
    }

    // async recode(order: Order, batch: FirebaseFirestore.WriteBatch) {
    //     const account: Account = new this._Account(order.selledBy, {})
    //     const balance: Balance = new this._Balance()
    //     balance.amount = order.amount
    //     balance.currency = order.currency
    //     balance.setParent(account.balance)
    //     batch.set(balance.reference, balance.value())
    //     return batch
    // }

    async transfer(order: Order, options: TransferOptions) {
        // Skip for paid, waitingForRefund, refunded
        if (order.status === OrderStatus.paid ||
            order.status === OrderStatus.waitingForRefund ||
            order.status === OrderStatus.refunded
        ) {
            return
        }
    }
}