import * as FirebaseFirestore from '@google-cloud/firestore'
import { StockManager } from './stockManager'
import { BalanceManager } from './balanceManager'
import { OrderValidator } from './orderValidator'
import * as Pring from 'pring-admin'
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
    Currency,
    BalanceTransactionType,
    Balance,
    TransferOptions,
    TradableErrorCode,
    TradableError,
    ItemProtocol,
    UserProtocol,
    OrderTransferStatus,
    PayoutOptions
} from "./index"

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export type PaymentResult = {
    balanceTransaction: BalanceTransactionProtocol
    chargeResult: any
}

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

    private stockManager: StockManager<Order, OrderItem, User, Product, SKU, Item, TradeTransaction>

    private balanceManager: BalanceManager<BalanceTransaction, Account>

    public delegate?: TransactionDelegate

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

        this.stockManager = new StockManager(this._User, this._Product, this._SKU, this._Item, this._TradeTransaction)
        this.balanceManager = new BalanceManager(this._BalanceTransaction, this._Account)
    }

    async order(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
        try {

            if (!(order.paymentStatus === OrderPaymentStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order status is invalid.`)
            }

            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
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
                    const result = await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
                            // stock
                            try {
                                const tasks = []
                                for (const orderItem of orderItems) {
                                    const productID = orderItem.product
                                    const skuID = orderItem.sku
                                    const quantity = orderItem.quantity
                                    if (productID && skuID) {
                                        const task = this.stockManager.order(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                        tasks.push(task)
                                    }
                                }
                                await Promise.all(tasks)
                            } catch (error) {
                                reject(error)
                            }

                            transaction.set(order.reference, {
                                updateAt: timestamp,
                                paymentStatus: OrderPaymentStatus.completed
                            }, { merge: true })
                            resolve()
                        })
                    })
                    return result
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let chargeResult: { [key: string]: any } | undefined = undefined
                    const result = await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            // stock
                            try {
                                const tasks = []
                                for (const orderItem of orderItems) {
                                    const productID = orderItem.product
                                    const skuID = orderItem.sku
                                    const quantity = orderItem.quantity
                                    if (productID && skuID) {
                                        const task = this.stockManager.order(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                        tasks.push(task)
                                    }
                                }
                                await Promise.all(tasks)
                            } catch (error) {
                                reject(error)
                            }

                            try {
                                if (!chargeResult) {
                                    chargeResult = await delegate.payment(order.currency, order.amount, order, paymentOptions)
                                }
                                // payment
                                const balanceTransaction = await this.balanceManager.payment(order.purchasedBy,
                                    order.id,
                                    order.currency,
                                    order.amount,
                                    { [paymentOptions.vendorType]: chargeResult }
                                    , transaction)

                                transaction.set(order.reference, {
                                    updateAt: timestamp,
                                    transactionResults: [{
                                        [paymentOptions.vendorType]: chargeResult
                                    }],
                                    paymentStatus: OrderPaymentStatus.completed
                                }, { merge: true })
                                resolve({
                                    balanceTransaction: balanceTransaction,
                                    chargeResult: chargeResult
                                })
                            } catch (error) {
                                reject(error)
                            }
                        })
                    })
                    return result
                } catch (error) {
                    if (error instanceof TradableError) {
                        order.paymentStatus = OrderPaymentStatus.paymentFailure
                        try {
                            await order.update()
                        } catch (error) {
                            console.log(error)
                            throw error
                        }
                        throw error
                    }
                    try {
                        await delegate.refund(order.currency, order.amount, order, paymentOptions, `[Manager] Invalid order ORDER/${order.id}, transaction failure.`)
                        throw error
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

    async orderCancel(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required delegate.`)
            }

            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, This order status is invalid.`)
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

                            transaction.set(order.reference, {
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
                try {
                    let refundResult: { [key: string]: any } | undefined = undefined
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            try {
                                const amount = order.amount * (1 - paymentOptions.refundFeeRate)
                                if (!refundResult) {
                                    refundResult = await delegate.refund(order.currency, amount, order, paymentOptions)
                                }
                                // payment
                                this.balanceManager.refund(order.purchasedBy,
                                    order.id,
                                    order.currency,
                                    order.amount,
                                    { [paymentOptions.vendorType]: refundResult }
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

                                transaction.set(order.reference, {
                                    updateAt: timestamp,
                                    transactionResults: [{
                                        [paymentOptions.vendorType]: refundResult
                                    }],
                                    paymentStatus: OrderPaymentStatus.canceled
                                }, { merge: true })
                                resolve(`[Manager] Success orderCancel ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)

                            } catch (error) {
                                reject(error)
                            }
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

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount * (1 - transferOptions.platformFeeRate)
                const result = await delegate.transfer(order.currency, amount, order, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            // transfer
                            this.balanceManager.transfer(
                                BalanceManager.platform,
                                order.selledBy,
                                order.id,
                                order.currency,
                                amount,
                                { [transferOptions.vendorType]: result },
                                transaction)

                            transaction.set(order.reference, {
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
                    try {
                        await delegate.transferCancel(order.currency, amount, order, transferOptions, `[Manager] Invalid transfer ORDER/${order.id}, transaction failure.`)
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

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount * (1 - transferOptions.platformFeeRate)
                const result = await delegate.transferCancel(order.currency, amount, order, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            // transfer
                            this.balanceManager.transferRefund(
                                BalanceManager.platform,
                                order.selledBy,
                                order.id,
                                order.currency,
                                amount,
                                { [transferOptions.vendorType]: result },
                                transaction)

                            transaction.set(order.reference, {
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

    async payout(accountID: string, currency: Currency, amount: number, payoutOptions: PayoutOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${accountID}, Manager required delegate.`)
            }

            if (amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${accountID}, This order is zero amount.`)
            }

            const result = await delegate.payout(currency, amount, accountID, payoutOptions)
            try {
                await firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {

                        // payout
                        this.balanceManager.payout(accountID, currency, amount, result, transaction)
                        resolve(`[Manager] Success payout ACCOUNT/${accountID}, ${currency}: ${amount}`)
                    })
                })
            } catch (error) {
                try {
                    await delegate.payoutCancel(currency, amount, accountID, payoutOptions)
                } catch (error) {
                    console.log(error)
                    throw error
                }
                throw error
            }
        } catch (error) {
            throw error
        }
    }

    async payoutCancel(accountID: string, currency: Currency, amount: number, payoutOptions: PayoutOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payoutCancel ACCOUNT/${accountID}, Manager required delegate.`)
            }

            if (amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payoutCancel ACCOUNT/${accountID}, This order is zero amount.`)
            }

            const result = await delegate.payoutCancel(currency, amount, accountID, payoutOptions)
            try {
                await firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {

                        // payout
                        this.balanceManager.payoutCancel(accountID, currency, amount, result, transaction)
                        resolve(`[Manager] Success payoutCancel ACCOUNT/${accountID}, ${currency}: ${amount}`)
                    })
                })
            } catch (error) {
                throw error
            }
        } catch (error) {
            throw error
        }
    }
}