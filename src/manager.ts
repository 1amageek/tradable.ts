import * as Pring from "pring"
import { FieldValue } from "@google-cloud/firestore"
import {
    SKUProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    TransactionProtocol,
    AccountProtocol,
    StockType,
    StockValue,
    OrderStatus,
    PaymentDelegate,
    PaymentOptions,
    RefundOptions,
    Currency,
    TransactionType,
    Balance,
    TransferOptions
} from "./index"


const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>
}

// 在庫の増減
// StripeAPIに接続
export class Manager
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    Transaction extends TransactionProtocol,
    Account extends AccountProtocol<Transaction>
    > {

    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _Transaction: { new(id?: string, value?: { [key: string]: any }): Transaction }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        transaction: { new(id?: string, value?: { [key: string]: any }): Transaction },
        account: { new(id?: string, value?: { [key: string]: any }): Account },
    ) {
        this._SKU = sku
        this._Product = product
        this._OrderItem = orderItem
        this._Order = order
        this._Transaction = transaction
        this._Account = account
    }

    async execute(order: Order, process: Process) {
        try {
            // validation error
            const validationError =  await this.validate(order)
            if (validationError) {
                order.status = OrderStatus.rejected
                try {
                    await order.update()
                } catch (error) {
                    throw error
                }
                throw validationError
            }
            const _batch = Pring.batch()
            const batch = await process(order, _batch)
            if (batch) {
                await batch.commit()
            }
        } catch (error) {
            throw error
        }
    }

    private async validate(order: Order) {
        if (isUndefined(order.buyer)) return Error(`[Tradable] Error: validation error, buyer is required`)
        if (isUndefined(order.selledBy)) return Error(`[Tradable] Error: validation error, selledBy is required`)
        if (isUndefined(order.expirationDate)) return Error(`[Tradable] Error: validation error, expirationDate is required`)
        if (isUndefined(order.currency)) return Error(`[Tradable] Error: validation error, currency is required`)
        if (isUndefined(order.amount)) return Error(`[Tradable] Error: validation error, amount is required`)
        if (!this.validateMinimumAmount(order)) return Error(`[Tradable] Error: validation error, Amount is below the lower limit.`)
        try {
            const items: OrderItem[] = await order.items.get(this._OrderItem)
            if (!this.validateCurrency(order, items)) return Error(`[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`)
            if (!this.validateAmount(order, items)) return Error(`[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`)
        } catch (error) {
            return error
        }
    }

    private validateMinimumAmount(order: Order): boolean {
        const currency: Currency = order.currency
        const amount: number = order.amount
        if (0 < amount && amount < Currency.minimum(currency)) {
            return false
        }
        return true
    }

    // Returns true if there is no problem in the verification
    private validateCurrency(order: Order, orderItems: OrderItem[]): boolean {
        for (const item of orderItems) {
            if (item.currency !== order.currency) {
                return false
            }
        }
        return true
    }

    // Returns true if there is no problem in the verification
    private validateAmount(order: Order, orderItems: OrderItem[]) {
        let totalAmount: number = 0

        for (const item of orderItems) {
            totalAmount += (item.amount * item.quantity)
        }
        if (totalAmount !== order.amount) {
            return false
        }
        return true
    }

    public delegate?: PaymentDelegate

    async inventoryControl(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {
        // Skip
        if (order.status === OrderStatus.received ||
            order.status === OrderStatus.waitingForRefund ||
            order.status === OrderStatus.paid ||
            order.status === OrderStatus.waitingForPayment ||
            order.status === OrderStatus.canceled
        ) {
            return
        }

        try {
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
                                transaction.set(sku.reference, {
                                    updateAt: FieldValue.serverTimestamp(),
                                    unitSales: newUnitSales
                                }, { merge: true })
                                break
                            }
                            case StockType.bucket: {
                                switch (sku.inventory.value) {
                                    case StockValue.outOfStock: {
                                        reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                    }
                                    default: {
                                        const newUnitSales = sku.unitSales + quantity
                                        transaction.set(sku.reference, {
                                            updateAt: FieldValue.serverTimestamp(),
                                            unitSales: newUnitSales
                                        }, { merge: true })
                                        break
                                    }
                                }
                                break
                            }
                            case StockType.infinite: {
                                const newUnitSales = sku.unitSales + quantity
                                transaction.set(sku.reference, {
                                    updateAt: FieldValue.serverTimestamp(),
                                    unitSales: newUnitSales
                                }, { merge: true })
                                break
                            }
                        }
                    }

                    transaction.set(order.reference, {
                        updateAt: FieldValue.serverTimestamp(),
                        status: OrderStatus.received
                    }, { merge: true })
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

    async pay(order: Order, options: PaymentOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

        // Skip for paid, waitingForRefund, refunded
        if (order.status === OrderStatus.paid ||
            order.status === OrderStatus.waitingForRefund ||
            order.status === OrderStatus.refunded
        ) {
            return
        }
        if (!(order.status === OrderStatus.received || order.status === OrderStatus.waitingForPayment)) {
            throw new Error(`[Failure] pay ORDER/${order.id}, Order is not a payable status.`)
        }
        if (!options.customer && !options.source) {
            throw new Error(`[Failure] pay ORDER/${order.id}, PaymentOptions required customer or source`)
        }
        if (!options.vendorType) {
            throw new Error(`[Failure] pay ORDER/${order.id}, PaymentOptions required vendorType`)
        }
        if (!this.delegate) {
            throw new Error(`[Failure] pay ORDER/${order.id}, Manager required delegate`)
        }

        if (order.amount > 0) {
            try {
                const result = await this.delegate.pay(order, options)
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const account: Account = new this._Account(order.selledBy, {})
                            await account.fetch()
                            const amount: number = order.amount
                            const commissionRatio: number = account.commissionRatio
                            const fee: number = amount * commissionRatio
                            const net: number = amount - fee

                            const currency: Currency = order.currency
                            const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
                            const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
                            const amountOfAccountsReceivable: number = accountsReceivable[currency] || 0
                            const newAmount: number = amountOfAccountsReceivable + net

                            const revenue: { [currency: string]: number } = account.revenue || {}
                            const amountOfRevenue: number = revenue[currency] || 0
                            const newRevenue: number = amountOfRevenue + amount

                            // set account data
                            transaction.set(account.reference, {
                                updateAt: FieldValue.serverTimestamp(),
                                revenue: { [currency]: newRevenue },
                                balance: {
                                    accountsReceivable: { [currency]: newAmount }
                                }
                            }, { merge: true })

                            // set order data
                            transaction.set(order.reference, {
                                updateAt: FieldValue.serverTimestamp(),
                                paymentInformation: {
                                    [options.vendorType]: result
                                },
                                fee: fee,
                                net: net,
                                status: OrderStatus.paid
                            }, { merge: true })
                            resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`)
                        } catch (error) {
                            reject(`[Failure] pay ORDER/${order.id}, Account could not be fetched.`)
                        }
                    })
                })
            } catch (error) {
                order.status = OrderStatus.waitingForPayment
                try {
                    await order.update()
                } catch (error) {
                    throw error
                }
                throw error
            }
        } else {
            batch.set(order.reference, {
                updateAt: FieldValue.serverTimestamp(),
                status: OrderStatus.paid
            }, { merge: true })
            return batch
        }
    }

    private async transaction(order: Order, type: TransactionType, currency: Currency, amount: number, batch: FirebaseFirestore.WriteBatch) {
        const account: Account = new this._Account(order.selledBy, {})
        const transaction: Transaction = new this._Transaction()
        transaction.amount = amount
        transaction.currency = currency
        transaction.type = type
        transaction.setParent(account.transactions)
        transaction.order = order.id
        batch.set(transaction.reference, transaction.value())
        return batch
    }

    async refund(order: Order, options: RefundOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

        // Skip for refunded
        if (order.status === OrderStatus.refunded) {
            return
        }
        if (!(order.status === OrderStatus.paid || order.status === OrderStatus.completed)) {
            throw new Error(`[Failure] refund ORDER/${order.id}, Order is not a refundable status.`)
        }
        if (!options.vendorType) {
            throw new Error(`[Failure] refund ORDER/${order.id}, PaymentOptions required vendorType`)
        }
        if (!this.delegate) {
            throw new Error(`[Failure] refund ORDER/${order.id}, Manager required delegate`)
        }

        if (order.amount > 0) {
            try {
                const result = await this.delegate.refund(order, options)
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const account: Account = new this._Account(order.selledBy, {})
                            await account.fetch()
                            if (order.status === OrderStatus.completed) {
                                const currency: string = order.currency
                                const net: number = order.net
                                const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
                                const available: { [currency: string]: number } = balance.available
                                const amountOfAvailable: number = available[order.currency] || 0
                                const newAmount: number = amountOfAvailable - net

                                // set account data
                                transaction.set(account.reference, {
                                    balance: {
                                        available: { [currency]: newAmount }
                                    }
                                }, { merge: true })

                                // set order data
                                transaction.set(order.reference, {
                                    refundInformation: {
                                        [options.vendorType]: result
                                    },
                                    status: OrderStatus.refunded
                                }, { merge: true })

                            } else {
                                const currency: string = order.currency
                                const net: number = order.net
                                const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
                                const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
                                const amountAccountsReceivable: number = accountsReceivable[order.currency] || 0
                                const newAmount: number = amountAccountsReceivable - net

                                // set account data
                                transaction.set(account.reference, {
                                    accountsReceivable: {
                                        available: { [currency]: newAmount }
                                    }
                                }, { merge: true })

                                // set order data
                                transaction.set(order.reference, {
                                    refundInformation: {
                                        [options.vendorType]: result
                                    },
                                    status: OrderStatus.refunded
                                }, { merge: true })
                            }
                            resolve(`[Success] refund ORDER/${order.id}, USER/${order.selledBy}`)
                        } catch (error) {
                            reject(`[Failure] refund ORDER/${order.id}, Account could not be fetched.`)
                        }
                    })
                })
            } catch (error) {
                throw error
            }
        } else {
            batch.set(order.reference, {
                updateAt: FieldValue.serverTimestamp(),
                status: OrderStatus.refunded
            }, { merge: true })
            return batch
        }
    }

    async transfer(order: Order, options: TransferOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

        // Skip for 
        if (order.status === OrderStatus.completed) {
            return
        }
        if (!(order.status === OrderStatus.paid)) {
            throw new Error(`[Failure] transfer ORDER/${order.id}, Order is not a transferable status.`)
        }
        if (!options.vendorType) {
            throw new Error(`[Failure] transfer ORDER/${order.id}, PaymentOptions required vendorType`)
        }
        if (!this.delegate) {
            throw new Error(`[Failure] transfer ORDER/${order.id}, Manager required delegate`)
        }

        if (order.amount > 0) {
            try {
                const result = await this.delegate.transfer(order, options)
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const account: Account = new this._Account(order.selledBy, {})
                            await account.fetch()
                            const currency: string = order.currency
                            const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
                            const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
                            const available: { [currency: string]: number } = balance.available
                            const net: number = order.net
                            const accountsReceivableAmount: number = accountsReceivable[order.currency] || 0
                            const availableAmount: number = available[order.currency] || 0
                            const newAccountsReceivableAmount: number = accountsReceivableAmount - net
                            const newAvailableAmount: number = availableAmount + net

                            // set account data
                            transaction.set(account.reference, {
                                balance: {
                                    accountsReceivable: { [currency]: newAccountsReceivableAmount },
                                    available: { [currency]: newAvailableAmount }
                                }
                            }, { merge: true })

                            // set transaction data
                            const trans: Transaction = new this._Transaction()
                            trans.amount = order.amount
                            trans.fee = order.fee
                            trans.net = order.net
                            trans.currency = currency
                            trans.type = TransactionType.transfer
                            trans.setParent(account.transactions)
                            trans.order = order.id
                            trans.information = {
                                [options.vendorType]: result
                            }
                            transaction.set(trans.reference, trans.value())

                            // set order data
                            transaction.set(order.reference, {
                                transferInformation: {
                                    [options.vendorType]: result
                                },
                                transferredTo: { [trans.id]: true },
                                status: OrderStatus.completed
                            }, { merge: true })

                            resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}, TRANSACTION/${trans.id}`)
                        } catch (error) {
                            reject(`[Failure] transfer ORDER/${order.id}, Account could not be fetched.`)
                        }
                    })
                })
            } catch (error) {
                throw error
            }
        } else {
            batch.set(order.reference, {
                updateAt: FieldValue.serverTimestamp(),
                status: OrderStatus.completed
            }, { merge: true })
            return batch
        }
    }

    // async payout(account: Account, currency: Currency, batch?: FirebaseFirestore.WriteBatch) {

    //     if (!account.isSigned) {
    //         throw new Error(`[Failure] ACCOUNT/${account.id}, This account has not agreed to the terms of service.`)
    //     }
    //     const balance = account.balance
    //     const amount: number = balance[currency]

    //     try {
    //         const result = await this.delegate.payout(account, amount, currency)
    //     } catch (error) {
    //         throw error
    //     }

    // }
}