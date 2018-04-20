import * as Pring from 'pring'
import * as admin from 'firebase-admin'
import * as FirebaseFirestore from '@google-cloud/firestore'
import { Manager } from './manager'
import { Currency } from './currency'
export { Currency, Manager }

export let firestore: FirebaseFirestore.Firestore

export let timestamp: admin.firestore.FieldValue

export const initialize = (app: admin.app.App, serverTimestamp: admin.firestore.FieldValue) => {
    Pring.initialize(app, serverTimestamp)
    firestore = app.firestore()
    timestamp = serverTimestamp
}

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
    products: FirebaseFirestore.Query
    skus: FirebaseFirestore.Query
    orders: FirebaseFirestore.Query
    orderings: FirebaseFirestore.Query
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
    currency: Currency
    amount: number
    fee: number
    net: number // net = amount - fee
    order?: string
    transfer?: string
    payout?: string
    information: { [key: string]: any }
}

export type Balance = {

    /// Represents accounts receivable. The sale was done, but the amount has not been distributed to the account.
    accountsReceivable: { [currency: string]: number }

    /// It is the amount that the user can withdraw.
    available: { [currency: string]: number }
}

/// AccountProtocol must have the same ID as UserProtocol.
/// AccountPtotocol holds information that can not be accessed except for principals with a protocol with a high security level.
export interface AccountProtocol<Transaction extends TransactionProtocol> extends Pring.Base {
    country: string
    isRejected: boolean
    isSigned: boolean
    commissionRatio: number // 0 ~ 1
    revenue: { [currency: string]: number }
    balance: Balance
    transactions: Pring.NestedCollection<Transaction>
    fundInformation: { [key: string]: any }
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
    amount: number
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

    /// Customer payment succeeded, but we do not transfer funds to the account.
    paid = 'paid',

    /// Successful inventory processing but payment failed.
    waitingForPayment = 'waitingForPayment',

    /// Payment has been refunded.
    refunded = 'refunded',

    /// If payment was made, I failed in refunding.
    waitingForRefund = 'waitingForRefund',

    /// Everything including refunds was canceled. Inventory processing is not canceled
    canceled = 'canceled',

    /// It means that a payout has been made to the Account.
    transferd = 'transferd',

    /// It means that the transfer failed.
    waitingForTransferrd = 'waitingForTransferrd'
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
    shippingTo: { [key: string]: string }
    transferredTo: { [key: string]: true }
    paidAt?: Date
    expirationDate: Date
    currency: Currency
    amount: number
    fee: number
    net: number // net = amount - fee
    items: Pring.NestedCollection<OrderItem>
    status: OrderStatus
    paymentInformation: { [key: string]: any }
    transferInformation: { [key: string]: any }
    refundInformation: { [key: string]: any }
}

export type PaymentOptions = {
    source?: string
    customer?: string
    vendorType: string
}

export enum RefundReason {
    duplicate = 'duplicate',
    fraudulent = 'fraudulent',
    requestedByCustomer = 'requested_by_customer'
}

export type RefundOptions = {
    vendorType: string
    reason?: RefundReason
}

export type TransferOptions = {
    vendorType: string
}

export interface PaymentDelegate {

    /// This function will make payment. The payment result is saved in the VendorType set in PaymentOptions.
    pay<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: PaymentOptions): Promise<any>

    /// This functioin will make a refund. The refund result is saved in the VendorType set in RefundOptions.
    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: RefundOptions): Promise<any>

    ///
    transfer<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: TransferOptions): Promise<any>
    // payout<U extends TransactionProtocol, T extends AccountProtocol<U>>(account: T, amount: number, currency: Currency): Promise<any>

}
