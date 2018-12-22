import { StockManager } from './stockManager'
import { BalanceManager } from './balanceManager'
import { OrderManager } from './orderManager'
import { OrderValidator } from './orderValidator'
import {
    firestore,
    SKUProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    TradeTransactionProtocol,
    BalanceTransactionProtocol,
    AccountProtocol,
    OrderResult,
    OrderPaymentStatus,
    PaymentOptions,
    Currency,
    TransferOptions,
    TradableErrorCode,
    TradableError,
    OrderItemStatus,
    UserProtocol,
    OrderTransferStatus,
    PayoutOptions,
    TransactionDelegate,
    TradeDelegate,
    SKUShardProtocol
} from "./index"

export type OrderResult<T extends TradeTransactionProtocol> = {
    balanceTransaction?: BalanceTransactionProtocol
    tradeTransactions: T[]
    chargeResult?: any
    refundResult?: any
}

export type OrderChangeResult<T extends TradeTransactionProtocol> = {
    balanceTransaction?: BalanceTransactionProtocol
    tradeTransactions: T[]
    refundResult: any
}

export type OrderCancelResult<T extends TradeTransactionProtocol> = {
    balanceTransaction?: BalanceTransactionProtocol
    tradeTransactions: T[]
    refundResult: any
}

export type TransferResult = {
    balanceTransaction?: BalanceTransactionProtocol
    transferResult?: any
    transferCancelResult?: any
}

export type TransferCancelResult = {
    balanceTransaction?: BalanceTransactionProtocol
    transferCancelResult?: any
}

export class Manager
    <
    SKUShard extends SKUShardProtocol,
    SKU extends SKUProtocol<SKUShard>,
    Product extends ProductProtocol<SKUShard, SKU>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    TradeTransaction extends TradeTransactionProtocol,
    BalanceTransaction extends BalanceTransactionProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    Account extends AccountProtocol<BalanceTransaction>
    > {

    private _SKUShard: { new(id?: string, value?: { [key: string]: any }): SKUShard }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    private _BalanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction }
    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    private stockManager: StockManager<Order, OrderItem, User, Product, SKUShard, SKU, TradeTransaction>

    private balanceManager: BalanceManager<BalanceTransaction, Account>

    private orderManager: OrderManager<Order, OrderItem, User, TradeTransaction>

    public delegate?: TransactionDelegate

    public tradeDelegate?: TradeDelegate

    constructor(
        skuShard: { new(id?: string, value?: { [key: string]: any }): SKUShard },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction },
        balanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction },
        user: { new(id?: string, value?: { [key: string]: any }): User },
        account: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._SKUShard = skuShard
        this._SKU = sku
        this._Product = product
        this._OrderItem = orderItem
        this._Order = order
        this._TradeTransaction = tradeTransaction
        this._BalanceTransaction = balanceTransaction
        this._User = user
        this._Account = account

        this.stockManager = new StockManager(this._User, this._Product, this._SKUShard, this._SKU, this._TradeTransaction)
        this.balanceManager = new BalanceManager(this._BalanceTransaction, this._Account)
        this.orderManager = new OrderManager(this._User)
    }

    async order(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
        try {

            if (!(order.paymentStatus === OrderPaymentStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
            }

            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
            }

            const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
            if (!tradeDelegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required trade delegate.`)
            }

            this.stockManager.delegate = tradeDelegate

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
                    return await firestore.runTransaction(async (transaction) => {
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
                                const tradeTransactions = await Promise.all(tasks)
                                order.paymentStatus = OrderPaymentStatus.paid
                                this.orderManager.update(order, orderItems, {}, transaction)
                                const reuslt: OrderResult<TradeTransaction> = {
                                    tradeTransactions: tradeTransactions
                                }
                                resolve(reuslt)
                            } catch (error) {
                                reject(error)
                            }
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let chargeResult: { [key: string]: any } | undefined = undefined
                    return await firestore.runTransaction(async (transaction) => {
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
                                const tradeTransactions = await Promise.all(tasks)
                                try {
                                    if (!chargeResult) {
                                        chargeResult = await delegate.payment(order.currency, order.amount, order, paymentOptions)
                                    }
                                    // payment
                                    const balanceTransaction = this.balanceManager.payment(order.purchasedBy,
                                        order.id,
                                        order.currency,
                                        order.amount,
                                        { [paymentOptions.vendorType]: chargeResult }
                                        , transaction)

                                    order.paymentStatus = OrderPaymentStatus.paid
                                    this.orderManager.update(order, orderItems,
                                        { [paymentOptions.vendorType]: chargeResult }
                                        , transaction)
                                    resolve({
                                        tradeTransactions: tradeTransactions,
                                        balanceTransaction: balanceTransaction,
                                        chargeResult: chargeResult
                                    })
                                } catch (error) {
                                    if (chargeResult) {
                                        reject({
                                            chargeResult: chargeResult
                                        })
                                    } else {
                                        reject(error)
                                    }
                                }
                            } catch (error) {
                                reject(error)
                            }
                        })
                    })
                } catch (error) {
                    if (error instanceof TradableError) {
                        order.paymentStatus = OrderPaymentStatus.paymentFailure
                        try {
                            await order.update()
                        } catch (error) {
                            throw error
                        }
                        throw error
                    }
                    let orderReuslt = error
                    try {
                        if (orderReuslt.chargeResult) {
                            const refundResult = await delegate.refund(order.currency, order.amount, order, paymentOptions, `[Manager] Invalid order ORDER/${order.id}, transaction failure.`)
                            orderReuslt.refundResult = refundResult
                        }
                        throw orderReuslt
                    } catch (error) {
                        order.paymentStatus = OrderPaymentStatus.paymentFailure
                        try {
                            await order.update()
                        } catch (error) {
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

    async orderChange(order: Order, orderItem: OrderItem, itemID: string, paymentOptions: PaymentOptions) {
        try {
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required delegate.`)
            }

            if (!(order.paymentStatus === OrderPaymentStatus.paid)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, This order status is invalid.`)
            }

            const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
            if (!tradeDelegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required trade delegate.`)
            }

            this.stockManager.delegate = tradeDelegate

            if (orderItem.amount === 0) {
                try {
                    return await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
                            // stock
                            const tradeTransactions = []
                            const productID = orderItem.product
                            const skuID = orderItem.sku
                            if (productID && skuID) {
                                orderItem.status = OrderItemStatus.changed
                                const tradeTransaction = await this.stockManager.orderChange(order.selledBy, order.purchasedBy, order.id, productID, skuID, itemID, transaction)
                                tradeTransactions.push(tradeTransaction)
                            }

                            this.orderManager.update(order, [orderItem],
                                {}
                                , transaction)
                            resolve({
                                tradeTransactions: tradeTransactions
                            })
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let refundResult: { [key: string]: any } | undefined = undefined
                    return await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            try {
                                const amount = orderItem.amount * (1 - paymentOptions.refundFeeRate)
                                if (!refundResult) {
                                    refundResult = await delegate.partRefund(order.currency, amount, order, orderItem, paymentOptions)
                                }

                                // stock
                                const tradeTransactions = []
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                if (productID && skuID) {
                                    orderItem.status = OrderItemStatus.changed
                                    const tradeTransaction = await this.stockManager.orderChange(order.selledBy, order.purchasedBy, order.id, productID, skuID, itemID, transaction)
                                    tradeTransactions.push(tradeTransaction)
                                }

                                // payment
                                const balanceTransaction = this.balanceManager.refund(order.purchasedBy,
                                    order.id,
                                    order.currency,
                                    amount,
                                    { [paymentOptions.vendorType]: refundResult }
                                    , transaction)

                                this.orderManager.update(order, [orderItem],
                                    { [paymentOptions.vendorType]: refundResult }
                                    , transaction)

                                resolve({
                                    tradeTransactions: tradeTransactions,
                                    balanceTransaction: balanceTransaction,
                                    refundResult: refundResult
                                })
                            } catch (error) {
                                if (refundResult) {
                                    reject({
                                        refundResult: refundResult
                                    })
                                } else {
                                    reject(error)
                                }
                            }
                        })
                    })
                } catch (error) {
                    if (error instanceof TradableError) {
                        throw error
                    }
                    let orderCancelResult = error
                    return orderCancelResult
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

            if (!(order.paymentStatus === OrderPaymentStatus.paid)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid orderCancel ORDER/${order.id}, This order status is invalid.`)
            }

            const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
            if (!tradeDelegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required trade delegate.`)
            }

            this.stockManager.delegate = tradeDelegate

            if (order.amount === 0) {
                try {
                    return await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
                            // stock
                            const tasks = []
                            for (const orderItem of orderItems) {
                                const productID = orderItem.product
                                const skuID = orderItem.sku
                                const quantity = orderItem.quantity
                                if (productID && skuID) {
                                    orderItem.status = OrderItemStatus.canceled
                                    const task = this.stockManager.orderCancel(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                    tasks.push(task)
                                }
                            }
                            const tradeTransactions = await Promise.all(tasks)

                            order.paymentStatus = OrderPaymentStatus.canceled
                            this.orderManager.update(order, orderItems,
                                {}
                                , transaction)
                            resolve({
                                tradeTransactions: tradeTransactions
                            })
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let refundResult: { [key: string]: any } | undefined = undefined
                    return await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            try {
                                const amount = order.amount * (1 - paymentOptions.refundFeeRate)
                                if (!refundResult) {
                                    refundResult = await delegate.refund(order.currency, amount, order, paymentOptions)
                                }

                                // stock
                                const tasks = []
                                for (const orderItem of orderItems) {
                                    const productID = orderItem.product
                                    const skuID = orderItem.sku
                                    const quantity = orderItem.quantity
                                    if (productID && skuID) {
                                        orderItem.status = OrderItemStatus.canceled
                                        const task = this.stockManager.orderCancel(order.selledBy, order.purchasedBy, order.id, productID, skuID, quantity, transaction)
                                        tasks.push(task)
                                    }
                                }
                                const tradeTransactions = await Promise.all(tasks)

                                // payment
                                const balanceTransaction = this.balanceManager.refund(order.purchasedBy,
                                    order.id,
                                    order.currency,
                                    amount,
                                    { [paymentOptions.vendorType]: refundResult }
                                    , transaction)

                                order.paymentStatus = OrderPaymentStatus.canceled
                                this.orderManager.update(order, orderItems,
                                    { [paymentOptions.vendorType]: refundResult }
                                    , transaction)

                                resolve({
                                    tradeTransactions: tradeTransactions,
                                    balanceTransaction: balanceTransaction,
                                    refundResult: refundResult
                                })
                            } catch (error) {
                                if (refundResult) {
                                    reject({
                                        refundResult: refundResult
                                    })
                                } else {
                                    reject(error)
                                }
                            }
                        })
                    })
                } catch (error) {
                    if (error instanceof TradableError) {
                        order.paymentStatus = OrderPaymentStatus.cancelFailure
                        try {
                            await order.update()
                        } catch (error) {
                            throw error
                        }
                        throw error
                    }
                    let orderCancelResult = error
                    return orderCancelResult
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

            if (!(order.paymentStatus === OrderPaymentStatus.paid)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order paymentStatus is invalid.`)
            }

            if (!(order.transferStatus === OrderTransferStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order transferStatus is invalid.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                let transferResult: { [key: string]: any } | undefined = undefined
                const amount = order.amount * (1 - transferOptions.transferRate)
                try {
                    return await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                if (!transferResult) {
                                    const to: Account = new this._Account(order.selledBy, {})
                                    await to.fetch(transaction)
                                    transferResult = await delegate.transfer(order.currency, amount, order, to, transferOptions)
                                    console.log(transferResult)
                                }
                                // transfer
                                const balanceTransaction = await this.balanceManager.transfer(
                                    BalanceManager.platform,
                                    order.selledBy,
                                    order.id,
                                    order.currency,
                                    amount,
                                    { [transferOptions.vendorType]: transferResult },
                                    transaction)

                                order.transferStatus = OrderTransferStatus.transferred
                                this.orderManager.update(order, [],
                                    { [transferOptions.vendorType]: transferResult }
                                    , transaction)
                                const result: TransferResult = {
                                    balanceTransaction: balanceTransaction,
                                    transferResult: transferResult
                                }
                                resolve(result)
                            } catch (error) {
                                if (transferResult) {
                                    reject({
                                        transferResult: transferResult
                                    })
                                } else {
                                    reject(error)
                                }
                            }
                        })
                    })
                } catch (error) {
                    if (error instanceof TradableError) {
                        order.transferStatus = OrderTransferStatus.transferFailure
                        try {
                            await order.update()
                        } catch (error) {
                            throw error
                        }
                        throw error
                    }
                    let transferResult: TransferResult = error as TransferResult
                    try {
                        if (transferResult.transferResult) {
                            const transferCancelResult = await delegate.transferCancel(order.currency, amount, order, transferOptions, `[Manager] Invalid transfer ORDER/${order.id}, transaction failure.`)
                            transferResult.transferCancelResult = transferCancelResult
                        }
                        throw transferResult
                    } catch (error) {
                        order.transferStatus = OrderTransferStatus.transferFailure
                        try {
                            await order.update()
                        } catch (error) {
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

            if (!(order.paymentStatus === OrderPaymentStatus.paid)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order paymentStatus is invalid.`)
            }

            if (!(order.transferStatus === OrderTransferStatus.transferred)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order transferStatus is invalid.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
            } else {
                const amount = order.amount * (1 - transferOptions.transferRate)
                const transferCancelResult = await delegate.transferCancel(order.currency, amount, order, transferOptions)
                try {
                    await firestore.runTransaction(async (transaction) => {
                        return new Promise(async (resolve, reject) => {

                            // transfer
                            const balanceTransaction = await this.balanceManager.transferRefund(
                                BalanceManager.platform,
                                order.selledBy,
                                order.id,
                                order.currency,
                                amount,
                                { [transferOptions.vendorType]: transferCancelResult },
                                transaction)

                            order.transferStatus = OrderTransferStatus.canceled
                            this.orderManager.update(order, [],
                                { [transferOptions.vendorType]: transferCancelResult }
                                , transaction)
                            const result: TransferCancelResult = {
                                balanceTransaction: balanceTransaction,
                                transferCancelResult: transferCancelResult
                            }
                            resolve(result)
                        })
                    })
                } catch (error) {
                    order.transferStatus = OrderTransferStatus.transferFailure
                    try {
                        await order.update()
                    } catch (error) {
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