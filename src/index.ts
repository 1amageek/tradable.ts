import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as Pring from "pring"
import { Currency } from './currency'
import { Query } from '@google-cloud/firestore';
import { OrderItem } from '../test/orderItem';

const property = Pring.property

export { Currency }

export interface Tradable
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>
    > extends Pring.Base {
    isAvailabled: boolean
    products: Pring.ReferenceCollection<Product>
    skus: Pring.ReferenceCollection<SKU>
    orders: Pring.ReferenceCollection<Order>
}

export interface UserProtocol extends Pring.Base {
    orders: Query
}

export interface ProductProtocol<SKU extends SKUProtocol> extends Pring.Base {
    title: string
    selledBy: string
    createdBy: string
    skus: Pring.ReferenceCollection<SKU>
}

export enum StockType {
    unknown = 'unknown',
    finite = 'finite',
    infinite = 'infinite'
}

export enum StockValue {
    inStock = 'in_stock',
    limited = 'limited',
    outOfStock = 'out_of_stock'
}

export type Inventory = {
    type: StockType
    quantity?: number
    value?: StockValue
}

export interface SKUProtocol extends Pring.Base {
    selledBy: string
    createdBy: string
    currency: Currency
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
    unknown = 'unknown',
    created = 'created',
    received = 'received',
    paid = 'paid',
    canceled = 'canceled',
    waitingForPayment = 'waitingForPayment'
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
    currency: Currency
    amount: number
    items: Pring.NestedCollection<OrderItem>
    status: OrderStatus
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
                                return reject(`[Failure] ORDER/${order.id}, SKU/:${sku.name} has no stock.`)
                            }
                            transaction.update(sku.reference, { inventory: { quantity: newQty } })
                            break
                        }
                        case StockType.infinite: break
                        default: break
                    }
                }

                transaction.update(order.reference, { status: OrderStatus.received })
                resolve(`[Success] ORDER/${order.id}, USER/${order.selledBy}`)
            })
        })
    }

}