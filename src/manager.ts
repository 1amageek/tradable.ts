import * as FirebaseFirestore from '@google-cloud/firestore'
import { StockManager } from './stockManager'
import { BalanceManager } from './balanceManager'
import { OrderValidator } from './orderValidator'
import * as Pring from 'pring'
import {
    firestore,
    timestamp,
    SKUProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    TradeTransactionProtocol,
    BalanceTransactionProtocol,
    AccountProtocol,
    StockType,
    StockValue,
    OrderPaymentStatus,
    TransactionDelegate,
    PaymentOptions,
    RefundOptions,
    CancelOptions,
    Currency,
    BalanceTransactionType,
    Balance,
    TransferOptions,
    TradableErrorCode,
    TradableError,
    ItemProtocol,
    UserProtocol,
    OrderTransferStatus
} from "./index"

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export interface OrderProcess {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>
}

// export interface TransactionProcess {
//     <T extends OrderItemProtocol, U extends OrderProtocol<T>>(amount:transaction: FirebaseFirestore.Transaction): Promise<void>
// }

enum InventoryControlType {
    increase = 'increase',
    decrease = 'decrease'
}

// 在庫の増減
// StripeAPIに接続
export class Manager
    <
    SKU extends SKUProtocol,
    Product extends ProductProtocol<SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    Item extends ItemProtocol,
    TradeTransaction extends TradeTransactionProtocol,
    BalanceTransaction extends BalanceTransactionProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction, Item>,
    Account extends AccountProtocol<BalanceTransaction>
    > {

    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _Item: { new(id?: string, value?: { [key: string]: any }): Item }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    private _BalanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction }
    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        item: { new(id?: string, value?: { [key: string]: any }): Item },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction },
        balanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction },
        user: { new(id?: string, value?: { [key: string]: any }): User },
        account: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._SKU = sku
        this._Product = product
        this._OrderItem = orderItem
        this._Order = order
        this._Item = item
        this._TradeTransaction = tradeTransaction
        this._BalanceTransaction = balanceTransaction
        this._User = user
        this._Account = account
    }

    stockManager: StockManager<Order, OrderItem, User, Product, SKU, Item, TradeTransaction> = new StockManager(this._User, this._Product, this._SKU, this._Item, this._TradeTransaction)

    balanceManager: BalanceManager<BalanceTransaction, Account> = new BalanceManager(this._BalanceTransaction, this._Account)

    public delegate?: TransactionDelegate

    public paymentOptions?: PaymentOptions

    public cancelOptions?: CancelOptions

    public transferOptions?: TransferOptions

    async order(order: Order, orderItems: OrderItem[]) {
        try {
            // const order: Order = new this._Order(orderID, {})
            // const results = await Promise.all([order.fetch(), order.items.get(this._OrderItem)])
            // const items: OrderItem[] = results[1] as OrderItem[]

            if (!(order.paymentStatus === OrderPaymentStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order status is invalid.`)
            }

            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
            }

            const paymentOptions: PaymentOptions | undefined = this.paymentOptions
            if (!paymentOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required payment options.`)
            }

            const validator = new OrderValidator(this._Order, this._OrderItem)
            const validationError = validator.validate(order, orderItems)
            if (validationError) {
                order.paymentStatus = OrderPaymentStatus.rejected
                try {
                    await order.update()
                } catch (error) {
                    throw error
                }
                throw validationError
            }

            if (order.amount === 0) {
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {    
                            // stock
                            for (const orderItem of orderItems) {
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                const quantity = orderItem.quantity
                                if (productID && skuID) {
                                    this.stockManager.order(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                }
                            }
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                paymentStatus: OrderPaymentStatus.completed
                            }, { merge: true })
                            resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                const chargeResult = await delegate.payment(order, paymentOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
        
                            // payment
                            this.balanceManager.payment(order.purchasedBy, 
                                order.id, 
                                order.currency, 
                                order.amount, 
                                { [paymentOptions.vendorType]: chargeResult }
                                , transaction)
        
                            // stock
                            for (const orderItem of orderItems) {
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                const quantity = orderItem.quantity
                                if (productID && skuID) {
                                    this.stockManager.order(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                }
                            }
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                transactionResults: [{
                                    [paymentOptions.vendorType]: chargeResult
                                }],
                                paymentStatus: OrderPaymentStatus.completed
                            }, { merge: true })
                            resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    try {
                        await delegate.refund(order, paymentOptions, `[Manager] Invalid order ORDER/${order.id}, transaction failure.`)
                    } catch (error) {
                        order.paymentStatus = OrderPaymentStatus.paymentFailure
                        try {
                            await order.update()
                        } catch (error) {
                            console.log(error)
                            throw error
                        }
                        throw error
                    }
                }
            }
        } catch (error) {
            throw error
        }
    }

    async orderCancel(order: Order, orderItems: OrderItem[]) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required delegate.`)
            }
    
            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, This order status is invalid.`)
            }

            const cancelOptions: CancelOptions | undefined = this.cancelOptions
            if (!cancelOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required cancel options.`)
            }

            if (order.amount === 0) {
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {    
                            // stock
                            for (const orderItem of orderItems) {
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                const quantity = orderItem.quantity
                                if (productID && skuID) {
                                    this.stockManager.orderCancel(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                }
                            }
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                paymentStatus: OrderPaymentStatus.canceled
                            }, { merge: true })
                            resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                const amount = order.amount *  (1 - cancelOptions.cancelFeeRate)
                const result = await delegate.cancel(order, amount, cancelOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
        
                            // payment
                            this.balanceManager.refund(order.purchasedBy, 
                                order.id, 
                                order.currency, 
                                order.amount, 
                                { [cancelOptions.vendorType]: result }
                                , transaction)
        
                            // stock
                            for (const orderItem of orderItems) {
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                const quantity = orderItem.quantity
                                if (productID && skuID) {
                                    this.stockManager.orderCancel(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                }
                            }
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                transactionResults: [{
                                    [cancelOptions.vendorType]: result
                                }],
                                paymentStatus: OrderPaymentStatus.canceled
                            }, { merge: true })
                            resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    order.paymentStatus = OrderPaymentStatus.cancelFailure
                    try {
                        await order.update()
                    } catch (error) {
                        console.log(error)
                        throw error
                    }
                    throw error
                }
            }
        } catch (error) {
            throw error
        }
    }

    async transfer(order: Order, transferOptions: TransferOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, Manager required delegate.`)
            }

            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order paymentStatus is invalid.`)
            }
    
            if (!(order.transferStatus === OrderTransferStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order transferStatus is invalid.`)
            }

            const transferOptions: TransferOptions | undefined = this.transferOptions
            if (!transferOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, Manager required transfer options.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount *  (1 - transferOptions.platformFeeRate)
                const result = await delegate.transfer(order, amount, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
        
                            // transfer
                            this.balanceManager.transfer(
                                this.balanceManager.platform, 
                                order.selledBy,
                                order.id,
                                order.currency, 
                                amount, 
                                { [transferOptions.vendorType]: result },
                                transaction)
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                transactionResults: [{
                                    [transferOptions.vendorType]: result
                                }],
                                transferStatus: OrderTransferStatus.completed
                            }, { merge: true })
                            resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    order.transferStatus = OrderTransferStatus.transferFailure
                    try {
                        await order.update()
                    } catch (error) {
                        console.log(error)
                        throw error
                    }
                    throw error
                }
            }
        } catch (error) {
            throw error
        }
    }

    async transferCancel(order: Order, transferOptions: TransferOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, Manager required delegate.`)
            }

            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order paymentStatus is invalid.`)
            }
    
            if (!(order.transferStatus === OrderTransferStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order transferStatus is invalid.`)
            }

            const transferOptions: TransferOptions | undefined = this.transferOptions
            if (!transferOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, Manager required transfer options.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount *  (1 - transferOptions.platformFeeRate)
                const result = await delegate.transfer(order, amount, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
        
                            // transfer
                            this.balanceManager.transferRefund(
                                this.balanceManager.platform, 
                                order.selledBy,
                                order.id,
                                order.currency, 
                                amount, 
                                { [transferOptions.vendorType]: result },
                                transaction)
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                transactionResults: [{
                                    [transferOptions.vendorType]: result
                                }],
                                transferStatus: OrderTransferStatus.completed
                            }, { merge: true })
                            resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    order.transferStatus = OrderTransferStatus.transferFailure
                    try {
                        await order.update()
                    } catch (error) {
                        console.log(error)
                        throw error
                    }
                    throw error
                }
            }
        } catch (error) {
            throw error
        }
    }

    async payout(accountID: string, transferOptions: TransferOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${accountID}, Manager required delegate.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount *  (1 - transferOptions.platformFeeRate)
                const result = await delegate.transfer(order, amount, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
        
                            // payout
                            this.balanceManager.payout()
                            this.balanceManager.transfer(
                                this.balanceManager.platform, 
                                order.selledBy,
                                order.id,
                                order.currency, 
                                amount, 
                                { [transferOptions.vendorType]: result },
                                transaction)
        
                            transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
                                updateAt: timestamp,
                                transactionResults: [{
                                    [transferOptions.vendorType]: result
                                }],
                                transferStatus: OrderTransferStatus.completed
                            }, { merge: true })
                            resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                        })
                    })
                } catch (error) {
                    order.transferStatus = OrderTransferStatus.transferFailure
                    try {
                        await order.update()
                    } catch (error) {
                        console.log(error)
                        throw error
                    }
                    throw error
                }
            }
        } catch (error) {
            throw error
        }
    }
}