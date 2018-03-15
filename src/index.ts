import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as Pring from "pring"
import { OrderItem } from '../test/orderItem';

const property = Pring.property

export interface UserProtocol
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>
    > extends Pring.Base {
    name: string
    isAvailabled: boolean
    products: Pring.ReferenceCollection<Product>
    skus: Pring.ReferenceCollection<SKU>
    orders: Pring.ReferenceCollection<Order>
}

export interface ProductProtocol<SKU extends SKUProtocol> extends Pring.Base {
    title: string
    selledBy: string
    createdBy: string
    skus: Pring.ReferenceCollection<SKU>
}

export enum StockType {
    Unknown = 'unknown',
    Finite = 'finite',
    Infinite = 'infinite'
}

export enum StockValue {
    InStock = 'in_stock',
    Limited = 'limited',
    OutOfStock = 'out_of_stock'
}

export class Inventory {
    type: StockType
    quantity?: number
    value?: StockValue
}

export interface SKUProtocol extends Pring.Base {
    selledBy: string
    createdBy: string
    currency: string
    product: string
    name: string
    price: number
    inventory: Inventory
    // stockType: StockType
    // stockQuantity: number
    // stockValue: StockValue
    isPublished: boolean
    isActive: boolean
}

export enum OrderItemType {
    sku = 'sku',
    tax = 'tax',
    shipping = 'shipping',
    discount = 'discount'
}

export enum OrderStatus {
    Unknown = 0,
    Created = 1,
    PaymentRequested = 2,
    WaitingForPayment = 3,
    Paid = 4
}

export interface OrderItemProtocol extends Pring.Base {
    order: string
    buyer: string
    selledBy: string
    type: OrderItemType
    sku: string
    quantity: number
    amount: number
}

export interface OrderProtocol<OrderItem extends OrderItemProtocol> extends Pring.Base {
    parentID?: string
    buyer: string
    selledBy: string
    shippingTo: { [key: string]: string }
    paidAt?: Date
    expirationDate: Date
    currency: string
    amount: number
    items: Pring.NestedCollection<OrderItem>
}

export type Options = {

}

/// PassKit initialize
export const initialize = (options?: Options) => {

}

// 在庫の増減
// StripeAPIに接続
export class Manager
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    User extends UserProtocol<SKU, Product, OrderItem, Order>
    > {

    private _SKU: { new(id: string, value: { [key: string]: any }): SKU }
    private _Product: { new(): Product }
    private _OrderItem: { new(): OrderItem }
    private _Order: { new(): Order }


    async execute(order: Order) {
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
                        case StockType.Finite: {
                            const newQty: number = sku.inventory.quantity - quantity
                            if (newQty < 0) {
                                return reject(`[Failure] ORDER/${order.id}, SKU/:${sku.name} has no stock.`)
                            }
                            transaction.update(sku.reference, { inventory: { quantity: newQty } })
                            break
                        }
                        case StockType.Infinite: break
                        default: break
                    }
                }

                return resolve(`[Success] ORDER/${order.id}, USER/${order.buyer}`)
            })
        })
    }

}