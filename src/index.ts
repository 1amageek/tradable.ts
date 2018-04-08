import * as Pring from "pring"
import { Manager } from './manager'
import { Currency } from './currency'
import { Query } from '@google-cloud/firestore'

export { Currency, Manager }

/// UserProtocol is a protocol that the user must retain to make it tradeable.
export interface UserProtocol
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>
    > extends Pring.Base {
    isAvailabled: boolean
    country: string
    products: Pring.ReferenceCollection<Product>
    skus: Query
    orders: Query
    orderings: Query
}

export enum TransactionType {
    payment = 'payment',
    paymentRefund = 'payment_refund',
    transfer = 'transfer',
    transferRefund = 'transfer_refund',
    payout = 'payout',
    payoutCancel = 'payout_cancel'
}

/// Transaction is the history that changed Balance. Tranasaction is made from the ID of the event.
export interface TransactionProtocol extends Pring.Base {
    type: TransactionType
    currency: string
    amount: number
    order?: string
    transfer?: string
    payout?: string
}

/// AccountProtocol must have the same ID as UserProtocol.
/// AccountPtotocol holds information that can not be accessed except for principals with a protocol with a high security level.
export interface AccountProtocol<Transaction extends TransactionProtocol> extends Pring.Base {
    country: string
    isRejected: boolean
    isSigned: boolean
    balance: { [currency: string]: number }
    transactions: Pring.NestedCollection<Transaction>
}

export interface ProductProtocol<SKU extends SKUProtocol> extends Pring.Base {
    title: string
    selledBy: string
    createdBy: string
    skus: Pring.NestedCollection<SKU>
}

export enum StockType {
    bucket = 'bucket',
    finite = 'finite',
    infinite = 'infinite'
}

/// StockValue is used when StockType is Bucket.
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
    unitSales: number
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
    /// Immediately after the order made
    created = 'created',

    /// Inventory processing was done, but it was rejected
    rejected = 'rejected',

    /// Inventory processing was successful
    received = 'received',

    /// Payment was successful
    paid = 'paid',

    /// Successful inventory processing but payment failed.
    waitingForPayment = 'waitingForPayment',

    /// If payment was made, I failed in refunding.
    waitingForRefund = 'waitingForRefund',

    /// Payment has been refunded.
    refunded = 'refunded',

    /// Everything including refunds was canceled. Inventory processing is not canceled
    canceled = 'canceled'
}

export enum TransferStatus {

}

export interface OrderItemProtocol extends Pring.Base {
    order: string
    buyer: string
    selledBy: string
    type: OrderItemType
    product?: string
    sku?: string
    quantity: number
    currency: Currency
    amount: number
}

export interface OrderProtocol<OrderItem extends OrderItemProtocol> extends Pring.Base {
    parentID?: string
    buyer: string
    selledBy: string
    shippingTo?: { [key: string]: string }
    paidAt?: Date
    expirationDate: Date
    currency: Currency
    amount: number
    items: Pring.NestedCollection<OrderItem>
    status: OrderStatus
    paymentInformation: { [key: string]: any }
    refundInformation: { [key: string]: any }
}

export type PaymentOptions = {
    source?: string
    customer?: string
    vendorType: string
}

export type RefundOptions = {
    source?: string
    customer?: string
    vendorType: string
}

export type TransferOptions = {
    source?: string
    customer?: string
    vendorType: string
}

export interface PaymentDelegate {

    /// This function will make payment. The payment result is saved in the VendorType set in PaymentOptions.
    pay<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: PaymentOptions): Promise<any>

    /// This function will make payment. The payment result is saved in the VendorType set in PaymentOptions.
    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: PaymentOptions): Promise<any>

    /// This function performs Transfer. The transfer record is kept by the Account. You also need to specify VendorType.
    transfer<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options?: TransferOptions): Promise<any>
}
