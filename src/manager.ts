import * as Pring from "pring"
import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, Tradable, StockType, StockValue, OrderStatus } from "./index"


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

    async execute(order: Order) {
        try {
            await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {

                    const items: OrderItem[] = await order.items.get(this._OrderItem)

                    // Stock control
                    for (const item of items) {
                        const skuID: string = item.sku
                        const quantity: number = item.quantity
                        const sku: SKU = new this._SKU(skuID, {})

                        await sku.fetch()
                        switch (sku.inventory.type) {
                            case StockType.finite: {
                                const newQty: number = sku.inventory.quantity - quantity
                                if (newQty < 0) {
                                    reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
                                }
                                transaction.update(sku.reference, { inventory: { quantity: newQty } })
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
}