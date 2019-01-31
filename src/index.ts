import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as FirebaseFirestore from '@google-cloud/firestore'
import { Manager, ReserveResult, CheckoutResult, CheckoutChangeResult, CheckoutCancelResult, TransferResult, TransferCancelResult } from './Manager'
import { Currency } from './Currency'
export { Currency, Manager, ReserveResult, CheckoutResult, CheckoutChangeResult, CheckoutCancelResult, TransferResult, TransferCancelResult }

export let firestore: FirebaseFirestore.Firestore

export const initialize = (app: admin.app.App) => {
    firestore = app.firestore()
}

/// UserProtocol is a protocol that the user must retain to make it tradeable.
export interface UserProtocol
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    TradeTransaction extends TradeTransactionProtocol
    > extends Pring.Base {
    isAvailabled: boolean
    country: string
    orders: Pring.NestedCollection<Order>
    receivedOrders: Pring.NestedCollection<Order>
    tradeTransactions: Pring.NestedCollection<TradeTransaction>
}

export type Balance = {

    pending: { [currency: string]: number }

    /// It is the amount that the user can withdraw.
    available: { [currency: string]: number }
}

/// AccountProtocol must have the same ID as UserProtocol.
/// AccountPtotocol holds information that can not be accessed except for principals with a protocol with a high security level.
export interface AccountProtocol<Transaction extends BalanceTransactionProtocol, Payout extends PayoutProtocol> extends Pring.Base {
    country: string
    isRejected: boolean
    isSigned: boolean
    balance: Balance
    balanceTransactions: Pring.NestedCollection<Transaction>
    payoutRequests: Pring.NestedCollection<Payout>
    accountInformation: { [key: string]: any }
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
    product?: FirebaseFirestore.DocumentReference
    sku: string
    inventoryStocks: string[]
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

export type AccountOrDestination = string | "platform" | "bank_account"

/// Transaction is the history that changed Balance. Tranasaction is made from the ID of the event.
export interface BalanceTransactionProtocol extends Pring.Base {
    type: BalanceTransactionType
    currency: Currency
    amount: number
    from: AccountOrDestination
    to: AccountOrDestination
    order?: string
    transfer?: string
    payout?: string
    transactionResults: TransactionResult[]
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

export interface InventoryStockProtocol extends Pring.Base {
    isAvailabled: boolean
    SKU: string
    order?: string
    item?: string
}

// SKU

export interface SKUProtocol <InventoryStock extends InventoryStockProtocol> extends Pring.Base {
    selledBy: string
    createdBy: string
    currency: Currency
    product?: FirebaseFirestore.DocumentReference
    amount: number
    inventory: Inventory
    isAvailabled: boolean

    /// Maximum number of fetches to acquire at one time
    numberOfFetchCount: number
    inventoryStocks: Pring.NestedCollection<InventoryStock>
}

// Order

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
    cancelled = 'cancelled'
}

export enum OrderTransferStatus {

    none = 'none',

    rejected = 'rejected',

    transferred = 'transferred',

    cancelled = 'cancelled',

    transferFailure = 'failure',

    cancelFailure = 'cancel_failure'
}

export enum OrderPaymentStatus {

    none = 'none',

    rejected = 'rejected',

    authorized = 'authorized',

    paid = 'paid',

    cancelled = 'cancelled',

    paymentFailure = 'failure',

    cancelFailure = 'cancel_failure'
}

export interface OrderItemProtocol extends Pring.Base {
    order: string
    purchasedBy: string
    selledBy: string
    type: OrderItemType
    product?: FirebaseFirestore.DocumentReference
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
    paidAt?: Pring.Timestamp
    cancelableDate?: Pring.Timestamp
    expirationDate?: Pring.Timestamp
    currency: Currency
    amount: number
    items: Pring.List<OrderItem>
    paymentStatus: OrderPaymentStatus
    transferStatus: OrderTransferStatus
    transactionResults: TransactionResult[]
    isCancelled: boolean
}

export interface ItemProtocol extends Pring.Base {
    selledBy: string
    order: string
    product?: FirebaseFirestore.DocumentReference
    sku: string
    inventoryStock?: string
    isCancelled: boolean
}

export enum PayoutStatus {

    none = 'none',

    requested = 'requested',

    rejected = 'rejected',

    completed = 'completed',

    cancelled = 'cancelled'
}

export interface PayoutProtocol extends Pring.Base {
    account: string
    currency: Currency
    amount: number
    status: PayoutStatus
    transactionResults: TransactionResult[]
    isCancelled: boolean
}

export type PaymentOptions = {
    source?: string
    customer?: string
    vendorType: string
    refundFeeRate: number   // 0 ~ 1 
    reason?: RefundReason
    metadata?: any
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

export type TradeInformation = {
    selledBy: string
    purchasedBy: string
    order: string
    product?: FirebaseFirestore.DocumentReference
    sku: string
    metadata?: any
}

export interface TradeDelegate {

    reserve<OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>>(order: Order, orderItem: OrderItem, transaction: FirebaseFirestore.Transaction): void

    createItem(information: TradeInformation, invetoryStock: string, transaction: FirebaseFirestore.Transaction): string

    getItems(information: TradeInformation, transaction: FirebaseFirestore.Transaction): Promise<string[]>

    cancelItem(information: TradeInformation, itemID: string, transaction: FirebaseFirestore.Transaction): void
}

export interface TransactionDelegate {

    authorize<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions): Promise<any>

    authorizeCancel<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions): Promise<any>

    pay<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions): Promise<any>

    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, options: PaymentOptions, reason?: string): Promise<any>

    partRefund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(currency: Currency, amount: number, order: T, orderItem: U, options: PaymentOptions, reason?: string): Promise<any>

    transfer<OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>, 
    BalanceTransaction extends BalanceTransactionProtocol,
    Payout extends PayoutProtocol,
    Account extends AccountProtocol<BalanceTransaction, Payout>>(currency: Currency, amount: number, order: Order, toAccount: Account, options: TransferOptions): Promise<any>

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
