import * as functions from 'firebase-functions'
import * as Pring from "pring"

const property = Pring.property

export interface Tradable extends Pring.Base {
    name: string
    isAvailabled: boolean
    products: Pring.ReferenceCollection<ProductProtocol>
    skus: Pring.ReferenceCollection<SKUProtocol>
    orders: Pring.ReferenceCollection<OrderProtocol>
}

export interface ProductProtocol extends Pring.Base {
    title: string
    selledBy: string
    createdBy: string
    skus: Pring.ReferenceCollection<SKUProtocol>
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


export interface OrderProtocol extends Pring.Base {
    parentID?: string
    buyer: string
    selledBy: string
    shippingTo: { [key: string]: string }
    paidAt?: Date
    expirationDate: Date
    currency: string
    amount: number
    items: Pring.ReferenceCollection<ProductProtocol>
}
