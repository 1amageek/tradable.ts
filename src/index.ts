import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as FirebaseFirestore from '@google-cloud/firestore'
import { Manager, OrderResult, OrderChangeResult, OrderCancelResult, TransferResult, TransferCancelResult } from './manager'
import { Currency } from './currency'
export { Currency, Manager, OrderResult, OrderChangeResult, OrderCancelResult, TransferResult, TransferCancelResult }

export let firestore: FirebaseFirestore.Firestore

export let timestamp: admin.firestore.FieldValue

export const initialize = (app: admin.app.App, serverTimestamp: admin.firestore.FieldValue) => {
    Pring.initialize(app.firestore(), serverTimestamp)
    firestore = app.firestore()
    timestamp = serverTimestamp
}

/// UserProtocol is a protocol that the user must retain to make it tradeable.
export interface UserProtocol
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    TradeTransaction extends TradeTransactionProtocol,
    Item extends ItemProtocol
    > extends Pring.Base {
    isAvailabled: boolean
    country: string
    orders: Pring.NestedCollection<Order>
    receivedOrders: Pring.NestedCollection<Order>
    items: Pring.NestedCollection<Item>
    tradeTransactions: Pring.NestedCollection<TradeTransaction>
}

export enum TradeTransactionType {
    unknown = 'unknown',
    order = 'order',
    orderChange = 'order_change',
    orderCancel = 'order_cancel',
    storage = 'storage',
    retrieval = 'retrieval'
}

export interface TradeTransactionProtocol extends Pring.Base {
    type: TradeTransactionType
    quantity: number
    selledBy: string
    purchasedBy: string
    order: string
    product: string
    sku: string
    items: string[]
}

export enum BalanceTransactionType {
    unknown = 'unknown',
    payment = 'payment',
    paymentRefund = 'payment_refund',
    transfer = 'transfer',
    transferRefund = 'transfer_refund',
    payout = 'payout',
    payoutCancel = 'payout_cancel'
}

export type TransactionResult = {
    [key: string]: any
}

/// Transaction is the history that changed Balance. Tranasaction is made from the ID of the event.
export interface BalanceTransactionProtocol extends Pring.Base {
    type: BalanceTransactionType
    currency: Currency
    amount: number
    from?: string
    to?: string
    order?: string
    transfer?: string
    payout?: string
    transactionResults: TransactionResult[]
}

export type Balance = {

    /// Represents accounts receivable. The sale was done, but the amount has not been distributed to the account.
    accountsReceivable: { [currency: string]: number }

    /// It is the amount that the user can withdraw.
    available: { [currency: string]: number }
}

/// AccountProtocol must have the same ID as UserProtocol.
/// AccountPtotocol holds information that can not be accessed except for principals with a protocol with a high security level.
export interface AccountProtocol<Transaction extends BalanceTransactionProtocol> extends Pring.Base {
    country: string
    isRejected: boolean
    isSigned: boolean
    commissionRate: number // 0 ~ 1
    revenue: { [currency: string]: number }
    sales: { [currency: string]: number }
    balance: Balance
    balanceTransactions: Pring.NestedCollection<Transaction>
    accountInformation: { [key: string]: any }
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
}

export enum OrderItemType {
    sku = 'sku',
    tax = 'tax',
    shipping = 'shipping',
    discount = 'discount'
}

export enum OrderItemStatus {
    none = 'none',
    ordered = 'ordered',
    changed = 'changed',
    canceled = 'canceld'
}

export enum OrderTransferStatus {

    none = 'none',

    rejected = 'rejected',

    completed = 'completed',

    canceled = 'canceled',

    transferFailure = 'failure',

    cancelFailure = 'cancel_failure'
}

export enum OrderPaymentStatus {

    none = 'none',

    rejected = 'rejected',

    completed = 'completed',

    canceled = 'canceled',

    paymentFailure = 'failure',

    cancelFailure = 'cancel_failure'
}

export interface OrderItemProtocol extends Pring.Base {
    order: string
    purchasedBy: string
    selledBy: string
    type: OrderItemType
    product?: string
    sku?: string
    quantity: number
    currency: Currency
    amount: number
    status: OrderItemStatus
}

export interface OrderProtocol<OrderItem extends OrderItemProtocol> extends Pring.Base {
    parentID?: string
    purchasedBy: string
    selledBy: string
    shippingTo: { [key: string]: string }
    transferredTo: { [key: string]: true }
    paidAt?: Date
    expirationDate?: Date
    currency: Currency
    amount: number
    items: Pring.NestedCollection<OrderItem>
    paymentStatus: OrderPaymentStatus
    transferStatus: OrderTransferStatus
    transactionResults: TransactionResult[]
}

export interface ItemProtocol extends Pring.Base {
    selledBy: string
    order: string
    product: string
    sku: string
    isCanceled: boolean
}

export type PaymentOptions = {
    source?: string
    customer?: string
    vendorType: string
    refundFeeRate: number   // 0 ~ 1 
    reason?: RefundReason
}

export enum RefundReason {
    duplicate = 'duplicate',
    fraudulent = 'fraudulent',
    requestedByCustomer = 'requested_by_customer'
}

export type TransferOptions = {
    vendorType: string
    transferRate: number // 0 ~ 1
}

export type PayoutOptions = {
    vendorType: string
}

export interface TransactionDelegate {

    /// This function will make payment. The payment result is saved in the VendorType set in ChargeOptions.
    payment<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions): Promise<any>

    /// This function will make payment. The payment result is saved in the VendorType set in ChargeOptions.
    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions, reason?: string): Promise<any>

    /// This function will make payment. The payment result is saved in the VendorType set in ChargeOptions.
    partRefund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, orderItem: U, options: PaymentOptions, reason?: string): Promise<any>

    ///
    transfer<U extends OrderItemProtocol, T extends OrderProtocol<U>, 
    V extends BalanceTransactionProtocol, W extends AccountProtocol<V>>(currency: Currency, amount: number, order: T, toAccount: W, options: TransferOptions): Promise<any>

    transferCancel<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: TransferOptions, reason?: string): Promise<any>

    payout(currency: Currency, amount: number, accountID: string, options: PayoutOptions): Promise<any>

    payoutCancel(currency: Currency, amount: number, accountID: string, options: PayoutOptions): Promise<any>

}

export enum TradableErrorCode {
    invalidArgument = 'invalidArgument',
    lessMinimumAmount = 'lessMinimumAmount',
    invalidCurrency = 'invalidCurrency',
    invalidAmount = 'invalidAmount',
    outOfStock = 'outOfStock',
    invalidStatus = 'invalidStatus',
    internal = 'internal'
}

export class TradableError implements Error {
    name: string
    message: string
    stack?: string
    info: { [key: string]: any }

    constructor(code: TradableErrorCode, message: string, stack?: string) {
        this.name = 'tradable.error'
        this.info = {
            code: code,
        }
        this.message = message
        // this.stack = stack || new Error().stack
    }
}
