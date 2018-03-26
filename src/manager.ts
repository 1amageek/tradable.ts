import * as Pring from "pring"
import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, Tradable, StockType, StockValue, OrderStatus, PaymentDelegate, PaymentOptions, Inventory } from "./index"

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U): Promise<void>
}

// 在庫の増減
// StripeAPIに接続
export class Manager
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    User extends Tradable<SKU, Product, OrderItem, Order>
    > {

    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }

    constructor(
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order }
    ) {
        this._SKU = sku
        this._Product = product
        this._OrderItem = orderItem
        this._Order = order
    }

    async execute(order: Order, process: Process) {
        try {
            if (isUndefined(order.buyer)) throw Error(`[Tradable] Error: validation error, buyer is required`)
            if (isUndefined(order.selledBy)) throw Error(`[Tradable] Error: validation error, selledBy is required`)
            if (isUndefined(order.expirationDate)) throw Error(`[Tradable] Error: validation error, expirationDate is required`)
            if (isUndefined(order.currency)) throw Error(`[Tradable] Error: validation error, currency is required`)
            if (isUndefined(order.amount)) throw Error(`[Tradable] Error: validation error, amount is required`)
            await process(order)
            await order.update()
        } catch (error) {
            throw error
        }
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
                                const newQty: number = sku.inventory.quantity - quantity
                                if (newQty < 0) {
                                    reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                }
                                const inventory: Inventory = {
                                    type: StockType.finite,
                                    quantity: newQty
                                }
                                transaction.update(sku.reference, { inventory: inventory })
                                break
                            }
                            case StockType.bucket: {
                                switch (sku.inventory.value) {
                                    case StockValue.outOfStock: {
                                        reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                    }
                                    default: break
                                }
                            }
                            case StockType.infinite: break
                            default: break
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

    async payment(order: Order, options: PaymentOptions) {

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

        try {
            const result = await this.delegate.payment(order, options)
            order.paymentInformation = {
                [options.vendorType]: result
            }
            order.status = OrderStatus.paid
        } catch (error) {
            order.status = OrderStatus.waitingForPayment
            try {
                await order.update()
            } catch (error) {
                throw error
            }
            throw error
        }
    }
}