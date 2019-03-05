import { StockManager } from './StockManager'
import { BalanceManager } from './BalanceManager'
import { OrderManager } from './OrderManager'
import { PayoutManager } from './PayoutManager'
import { OrderValidator } from './OrderValidator'
import {
    firestore,
    SKUProtocol,
    OrderItemProtocol,
    OrderProtocol,
    TradeTransactionProtocol,
    BalanceTransactionProtocol,
    AccountProtocol,
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
    TradeInformation,
    InventoryStockProtocol,
    PayoutProtocol,
    PayoutStatus,
    OrderItemType
} from "./index"
import { DocumentReference } from 'pring-admin/lib/base';


export type ReserveResult = {
    authorizeResult?: any
}

export type ReserveCancelResult = {
    authorizeCancelResult?: any
}

export type TradeResult<T extends TradeTransactionProtocol> = {
    tradeTransactions: T[][]
}

export type CaptureResult = {
    balanceTransaction?: BalanceTransactionProtocol
    paymentResult?: any
    refundResult?: any
}

export type CheckoutResult<T extends TradeTransactionProtocol> = {
    balanceTransaction?: BalanceTransactionProtocol
    tradeTransactions: T[][]
    paymentResult?: any
    refundResult?: any
}

export type CheckoutChangeResult<T extends TradeTransactionProtocol> = {
    balanceTransaction?: BalanceTransactionProtocol
    tradeTransactions: T[][]
    refundResult: any
}

export type CheckoutCancelResult<T extends TradeTransactionProtocol> = {
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

export type PayoutResult = {
    balanceTransaction?: BalanceTransactionProtocol
    payoutResult?: any
}

export class Manager
    <
    InventoryStock extends InventoryStockProtocol,
    SKU extends SKUProtocol<InventoryStock>,
    OrderItem extends OrderItemProtocol,
    Order extends OrderProtocol<OrderItem>,
    TradeTransaction extends TradeTransactionProtocol,
    BalanceTransaction extends BalanceTransactionProtocol,
    Payout extends PayoutProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    Account extends AccountProtocol<BalanceTransaction, Payout>
    > {

    private _InventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    private _BalanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction }
    private _Payout: { new(id?: string, value?: { [key: string]: any }): Payout }
    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    public stockManager: StockManager<Order, OrderItem, User, InventoryStock, SKU, TradeTransaction>

    public balanceManager: BalanceManager<BalanceTransaction, Payout, Account>

    public orderManager: OrderManager<Order, OrderItem, User, TradeTransaction>

    public payoutManager: PayoutManager<BalanceTransaction, Payout, Account>

    public delegate?: TransactionDelegate

    public tradeDelegate?: TradeDelegate

    constructor(
        inventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem },
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction },
        balanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction },
        payout: { new(id?: string, value?: { [key: string]: any }): Payout },
        user: { new(id?: string, value?: { [key: string]: any }): User },
        account: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._InventoryStock = inventoryStock
        this._SKU = sku
        this._OrderItem = orderItem
        this._Order = order
        this._TradeTransaction = tradeTransaction
        this._BalanceTransaction = balanceTransaction
        this._Payout = payout
        this._User = user
        this._Account = account

        this.stockManager = new StockManager(this._User, this._InventoryStock, this._SKU, this._TradeTransaction)
        this.balanceManager = new BalanceManager(this._BalanceTransaction, this._Account)
        this.orderManager = new OrderManager(this._User, this._Order)
        this.payoutManager = new PayoutManager(this._BalanceTransaction, this._Payout, this._Account)
    }

    public async runTransaction(orderReference: DocumentReference, option: any, block: (order: Order, option: any, transaction: FirebaseFirestore.Transaction) => Promise<any>) {
        const delegate: TransactionDelegate | undefined = this.delegate
        if (!delegate) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ${orderReference.path}, Manager required delegate.`)
        }
        const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
        if (!tradeDelegate) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ${orderReference.path}, Manager required trade delegate.`)
        }
        this.stockManager.delegate = tradeDelegate
        try {
            return await firestore.runTransaction(async (transaction) => {
                const orderSnapshot = await transaction.get(orderReference)
                const order: Order = new this._Order(orderSnapshot.id, orderSnapshot.data()).setData(orderSnapshot.data()!)
                return await block(order, option, transaction)
            })
        } catch (error) {
            throw error
        }
    }

    // /**
    //  * オーダーをSellerに渡して、オーソリを作る
    //  * 
    //  * @param order 
    //  * @param orderItems 
    //  * @param paymentOptions 
    //  */
    // async reserve(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
    //     try {

    //         if (!(order.paymentStatus === OrderPaymentStatus.none)) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
    //         }

    //         const delegate: TransactionDelegate | undefined = this.delegate
    //         if (!delegate) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
    //         }

    //         const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
    //         if (!tradeDelegate) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required trade delegate.`)
    //         }
    //         this.stockManager.delegate = tradeDelegate

    //         const validator = new OrderValidator(this._Order, this._OrderItem)
    //         const validationError = validator.validate(order, orderItems)
    //         if (validationError) {
    //             throw validationError
    //         }

    //         if (order.amount === 0) {
    //             try {
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         try {
    //                             const tasks = []
    //                             for (const orderItem of orderItems) {
    //                                 const skuID = orderItem.sku
    //                                 if (orderItem.type === OrderItemType.sku) {
    //                                     if (!skuID) {
    //                                         throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
    //                                     }
    //                                     const task = this.stockManager.reserve(order, orderItem, transaction)
    //                                     tasks.push(task)
    //                                 }
    //                             }
    //                             await Promise.all(tasks)
    //                             order.paymentStatus = OrderPaymentStatus.authorized
    //                             this.orderManager.update(order, {}, {}, transaction)
    //                             const reuslt: ReserveResult = {}
    //                             resolve(reuslt)
    //                         } catch (error) {
    //                             reject(error)
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 throw error
    //             }
    //         } else {
    //             try {
    //                 let authorizeResult: { [key: string]: any } | undefined = undefined
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         try {
    //                             const tasks = []
    //                             for (const orderItem of orderItems) {
    //                                 const skuID = orderItem.sku
    //                                 if (orderItem.type === OrderItemType.sku) {
    //                                     if (!skuID) {
    //                                         throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
    //                                     }
    //                                     const task = this.stockManager.reserve(order, orderItem, transaction)
    //                                     tasks.push(task)
    //                                 }
    //                             }
    //                             await Promise.all(tasks)
    //                             if (!authorizeResult) {
    //                                 authorizeResult = await delegate.authorize(order.currency, order.amount, order, paymentOptions)
    //                             }
    //                             order.paymentStatus = OrderPaymentStatus.authorized
    //                             this.orderManager.update(order, {},
    //                                 { [paymentOptions.vendorType]: authorizeResult }
    //                                 , transaction)
    //                             const result: ReserveResult = {
    //                                 authorizeResult: authorizeResult
    //                             }
    //                             resolve(result)
    //                         } catch (error) {
    //                             reject(error)
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 throw error
    //             }
    //         }
    //     } catch (error) {
    //         throw error
    //     }
    // }

    // /**
    //  * オーダーをSellerに渡して、オーソリを作る
    //  * 
    //  * @param order 
    //  * @param orderItems 
    //  * @param paymentOptions 
    //  */
    // async reserveCancel(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
    //     try {

    //         if (!(order.paymentStatus === OrderPaymentStatus.authorized)) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
    //         }

    //         const delegate: TransactionDelegate | undefined = this.delegate
    //         if (!delegate) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
    //         }

    //         const validator = new OrderValidator(this._Order, this._OrderItem)
    //         const validationError = validator.validate(order, orderItems)
    //         if (validationError) {
    //             throw validationError
    //         }

    //         if (order.amount === 0) {
    //             try {
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         try {
    //                             order.paymentStatus = OrderPaymentStatus.cancelled
    //                             order.isCancelled = true
    //                             this.orderManager.update(order, {}, {}, transaction)
    //                             resolve({})
    //                         } catch (error) {
    //                             reject(error)
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 throw error
    //             }
    //         } else {
    //             try {
    //                 let authorizeCancelResult: { [key: string]: any } | undefined = undefined
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         try {
    //                             if (!authorizeCancelResult) {
    //                                 authorizeCancelResult = await delegate.authorizeCancel(order.currency, order.amount, order, paymentOptions)
    //                             }
    //                             order.paymentStatus = OrderPaymentStatus.cancelled
    //                             order.isCancelled = true
    //                             this.orderManager.update(order, {},
    //                                 { [paymentOptions.vendorType]: authorizeCancelResult }
    //                                 , transaction)
    //                             const result: ReserveCancelResult = {
    //                                 authorizeCancelResult: authorizeCancelResult
    //                             }
    //                             resolve(result)
    //                         } catch (error) {
    //                             reject(error)
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 throw error
    //             }
    //         }
    //     } catch (error) {
    //         throw error
    //     }
    // }

    // /**
    //  * 在庫を減らす
    //  * 
    //  * @param order 
    //  * @param orderItems 
    //  * @param paymentOptions 
    //  */
    // async trade(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
    //     try {

    //         if (!(order.paymentStatus === OrderPaymentStatus.authorized)) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
    //         }

    //         const validator = new OrderValidator(this._Order, this._OrderItem)
    //         const validationError = validator.validate(order, orderItems)
    //         if (validationError) {
    //             throw validationError
    //         }

    //         const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
    //         if (!tradeDelegate) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required trade delegate.`)
    //         }
    //         this.stockManager.delegate = tradeDelegate

    //         try {
    //             return await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {
    //                         const tasks = []
    //                         for (const orderItem of orderItems) {
    //                             const productID = orderItem.product
    //                             const skuID = orderItem.sku
    //                             const quantity = orderItem.quantity
    //                             if (orderItem.type === OrderItemType.sku) {
    //                                 if (!skuID) {
    //                                     throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
    //                                 }
    //                                 const tradeInformation: TradeInformation = {
    //                                     type: TradeType.normal,
    //                                     selledBy: order.selledBy,
    //                                     purchasedBy: order.purchasedBy,
    //                                     order: order.id,
    //                                     sku: skuID,
    //                                     product: productID
    //                                 }
    //                                 const task = this.stockManager.trade(tradeInformation, quantity, transaction)
    //                                 tasks.push(task)
    //                             }
    //                         }
    //                         const stockTransactions = await Promise.all(tasks)
    //                         const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))
    //                         this.orderManager.update(order, {}, {}, transaction)
    //                         const reuslt: TradeResult<TradeTransaction> = {
    //                             tradeTransactions: tradeTransactions
    //                         }
    //                         resolve(reuslt)
    //                     } catch (error) {
    //                         reject(error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             throw error
    //         }
    //     } catch (error) {
    //         throw error
    //     }
    // }

    // /**
    //  * 予約したオーダーの決済処理
    //  * 
    //  * @param order 
    //  * @param orderItems 
    //  * @param paymentOptions 
    //  */
    // async capture(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
    //     try {

    //         if (!(order.paymentStatus === OrderPaymentStatus.authorized)) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
    //         }

    //         const delegate: TransactionDelegate | undefined = this.delegate
    //         if (!delegate) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
    //         }

    //         const validator = new OrderValidator(this._Order, this._OrderItem)
    //         const validationError = validator.validate(order, orderItems)
    //         if (validationError) {
    //             throw validationError
    //         }

    //         if (order.amount === 0) {
    //             try {
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         // stock
    //                         try {
    //                             // payment
    //                             order.paymentStatus = OrderPaymentStatus.paid
    //                             this.orderManager.update(order, {}, {}, transaction)
    //                             const reuslt: CaptureResult = {
    //                                 paymentResult: {}
    //                             }
    //                             resolve(reuslt)
    //                         } catch (error) {
    //                             reject(error)
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 throw error
    //             }
    //         } else {
    //             try {
    //                 let paymentResult: { [key: string]: any } | undefined = undefined
    //                 return await firestore.runTransaction(async (transaction) => {
    //                     return new Promise(async (resolve, reject) => {
    //                         try {
    //                             if (!paymentResult) {
    //                                 paymentResult = await delegate.pay(order.currency, order.amount, order, paymentOptions)
    //                             }
    //                             // payment
    //                             const balanceTransaction = this.balanceManager.pay(order.purchasedBy,
    //                                 order.id,
    //                                 order.currency,
    //                                 order.amount,
    //                                 { [paymentOptions.vendorType]: paymentResult }
    //                                 , transaction)

    //                             order.paymentStatus = OrderPaymentStatus.paid
    //                             this.orderManager.update(order, {},
    //                                 { [paymentOptions.vendorType]: paymentResult }
    //                                 , transaction)
    //                             resolve({
    //                                 balanceTransaction: balanceTransaction,
    //                                 paymentResult: paymentResult
    //                             })
    //                         } catch (error) {
    //                             if (paymentResult) {
    //                                 reject({
    //                                     paymentResult: paymentResult
    //                                 })
    //                             } else {
    //                                 reject(error)
    //                             }
    //                         }
    //                     })
    //                 })
    //             } catch (error) {
    //                 if (error instanceof TradableError) {
    //                     order.paymentStatus = OrderPaymentStatus.paymentFailure
    //                     try {
    //                         await order.update()
    //                     } catch (error) {
    //                         throw error
    //                     }
    //                     throw error
    //                 }
    //                 let captureResult = error
    //                 try {
    //                     if (captureResult.paymentResult) {
    //                         const refundResult = await delegate.refund(order.currency, order.amount, order, paymentOptions, `[Manager] Invalid order ORDER/${order.id}, transaction failure.`)
    //                         captureResult.refundResult = refundResult
    //                     }
    //                     throw captureResult
    //                 } catch (error) {
    //                     order.paymentStatus = OrderPaymentStatus.paymentFailure
    //                     try {
    //                         await order.update()
    //                     } catch (error) {
    //                         throw error
    //                     }
    //                     throw error
    //                 }
    //             }
    //         }
    //     } catch (error) {
    //         throw error
    //     }
    // }

    /**
     * 決済処理、在庫処理を同時に行う
     * @param order 
     * @param orderItems 
     * @param paymentOptions 
     */
    async checkout(orderReference: DocumentReference, paymentOptions: PaymentOptions) {

        const delegate: TransactionDelegate | undefined = this.delegate
        if (!delegate) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ${orderReference.path}, Manager required delegate.`)
        }

        const tradeDelegate: TradeDelegate | undefined = this.tradeDelegate
        if (!tradeDelegate) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ${orderReference.path}, Manager required trade delegate.`)
        }

        this.stockManager.delegate = tradeDelegate

        let paymentResult: { [key: string]: any } | undefined = undefined

        try {
            return await firestore.runTransaction(async (transaction) => {

                const orderSnapshot = await transaction.get(orderReference)
                const order: Order = new this._Order(orderSnapshot.id, orderSnapshot.data()).setData(orderSnapshot.data()!)
                if (!(order.paymentStatus === OrderPaymentStatus.none)) {
                    throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order paymentStatus is invalid.`)
                }

                if (order.amount < 0) {
                    throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order amount is invalid.`)
                }

                const orderItems: OrderItem[] = order.items.objects()
                const tasks = []
                for (const orderItem of orderItems) {
                    const product = orderItem.product
                    const skuID = orderItem.sku
                    const quantity = orderItem.quantity
                    if (orderItem.type === OrderItemType.sku) {
                        if (!skuID) {
                            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
                        }
                        const tradeInformation: TradeInformation = {
                            selledBy: order.selledBy,
                            purchasedBy: order.purchasedBy,
                            order: order.id,
                            sku: skuID,
                            product: product,
                            metadata: paymentOptions.metadata,
                            numberOfShards: paymentOptions.numberOfShards
                        }
                        const task = this.stockManager.trade(tradeInformation, orderItem, transaction)
                        tasks.push(task)
                    }
                }
                const stockTransactions = await Promise.all(tasks)
                const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))
                if (order.amount === 0) {
                    order.paymentStatus = OrderPaymentStatus.paid
                    this.orderManager.update(order, {}, {}, transaction)
                    const reuslt: CheckoutResult<TradeTransaction> = {
                        tradeTransactions: tradeTransactions
                    }
                    return reuslt
                } else {
                    if (!paymentResult) {
                        paymentResult = await delegate.pay(order.currency, order.amount, order, paymentOptions)
                    }

                    // payment
                    const balanceTransaction = this.balanceManager.charge(order.purchasedBy,
                        order.id,
                        order.currency,
                        order.amount,
                        { [paymentOptions.vendorType]: paymentResult }
                        , transaction)

                    order.paymentStatus = OrderPaymentStatus.paid
                    this.orderManager.update(order, {},
                        { [paymentOptions.vendorType]: paymentResult }
                        , transaction)
                    return {
                        tradeTransactions: tradeTransactions,
                        balanceTransaction: balanceTransaction,
                        paymentResult: paymentResult
                    }
                }
            })
        } catch (error) {
            if (paymentResult) {
                // TODO: refund
                // try {
                //     const refundResult = await delegate.refund(order.currency, order.amount, order, paymentOptions, `[Manager] Invalid order ORDER/${order.id}, transaction failure.`)
                // } catch (error) {
                //     order.paymentStatus = OrderPaymentStatus.paymentFailure
                //     try {
                //         await order.update()
                //     } catch (error) {
                //         throw error
                //     }
                //     throw error
                // }
                throw error
            }
            throw error
        }
    }

    /**
     * 支払い後、支払いをキャンセルする
     * 
     * @param order 
     * @param orderItems 
     * @param paymentOptions 
     */
    async checkoutCancel(order: Order, orderItems: OrderItem[], paymentOptions: PaymentOptions) {
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
                        // stock
                        const tasks = []
                        for (const orderItem of orderItems) {
                            const productID = orderItem.product
                            const skuID = orderItem.sku
                            if (orderItem.type === OrderItemType.sku) {
                                if (!skuID) {
                                    throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
                                }
                                const tradeInformation: TradeInformation = {
                                    selledBy: order.selledBy,
                                    purchasedBy: order.purchasedBy,
                                    order: order.id,
                                    sku: skuID,
                                    product: productID,
                                    metadata: paymentOptions.metadata
                                }
                                orderItem.status = OrderItemStatus.cancelled
                                const task = this.stockManager.cancel(tradeInformation, transaction)
                                tasks.push(task)
                            }
                        }
                        const stockTransactions = await Promise.all(tasks)
                        const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))

                        order.isCancelled = true
                        order.paymentStatus = OrderPaymentStatus.cancelled
                        this.orderManager.update(order, {},
                            {}
                            , transaction)
                        return ({
                            tradeTransactions: tradeTransactions
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let refundResult: { [key: string]: any } | undefined = undefined
                    return await firestore.runTransaction(async (transaction) => {
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
                                if (orderItem.type === OrderItemType.sku) {
                                    if (!skuID) {
                                        throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
                                    }
                                    const tradeInformation: TradeInformation = {
                                        selledBy: order.selledBy,
                                        purchasedBy: order.purchasedBy,
                                        order: order.id,
                                        sku: skuID,
                                        product: productID,
                                        metadata: paymentOptions.metadata
                                    }
                                    orderItem.status = OrderItemStatus.cancelled
                                    const task = this.stockManager.cancel(tradeInformation, transaction)
                                    tasks.push(task)
                                }
                            }
                            const stockTransactions = await Promise.all(tasks)
                            const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))
                            // payment
                            const balanceTransaction = this.balanceManager.refund(order.purchasedBy,
                                order.id,
                                order.currency,
                                amount,
                                { [paymentOptions.vendorType]: refundResult }
                                , transaction)
                            order.isCancelled = true
                            order.paymentStatus = OrderPaymentStatus.cancelled
                            this.orderManager.update(order, {},
                                { [paymentOptions.vendorType]: refundResult }
                                , transaction)
                            return ({
                                tradeTransactions: tradeTransactions,
                                balanceTransaction: balanceTransaction,
                                refundResult: refundResult
                            })
                        } catch (error) {
                            if (refundResult) {
                                throw ({
                                    refundResult: refundResult
                                })
                            } else {
                                throw error
                            }
                        }
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
                    let CheckoutCancelResult = error
                    return CheckoutCancelResult
                }
            }
        } catch (error) {
            throw error
        }
    }

    /**
     * 支払い後、支払いの内容を変更する
     * 
     * @param order 
     * @param orderItem 
     * @param itemID 
     * @param paymentOptions 
     */
    async checkoutChange(order: Order, orderItem: OrderItem, item: FirebaseFirestore.DocumentReference, paymentOptions: PaymentOptions) {
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
                        // stock
                        const tasks = []
                        const productID = orderItem.product
                        const skuID = orderItem.sku
                        if (orderItem.type === OrderItemType.sku) {
                            if (!skuID) {
                                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
                            }
                            const tradeInformation: TradeInformation = {
                                selledBy: order.selledBy,
                                purchasedBy: order.purchasedBy,
                                order: order.id,
                                sku: skuID,
                                product: productID,
                                metadata: paymentOptions.metadata
                            }
                            orderItem.status = OrderItemStatus.changed
                            const task = this.stockManager.itemCancel(tradeInformation, item, transaction)
                            tasks.push(task)
                        }

                        const stockTransactions = await Promise.all(tasks)
                        const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))

                        this.orderManager.update(order, {},
                            {}
                            , transaction)
                        return ({
                            tradeTransactions: tradeTransactions
                        })
                    })
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    let refundResult: { [key: string]: any } | undefined = undefined
                    return await firestore.runTransaction(async (transaction) => {
                        try {
                            const amount = orderItem.amount * (1 - paymentOptions.refundFeeRate)
                            if (!refundResult) {
                                refundResult = await delegate.partRefund(order.currency, amount, order, orderItem, paymentOptions)
                            }

                            // stock
                            const tasks = []
                            const productID = orderItem.product
                            const skuID = orderItem.sku
                            if (orderItem.type === OrderItemType.sku) {
                                if (!skuID) {
                                    throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${order.id}, This order item is sku required.`)
                                }
                                const tradeInformation: TradeInformation = {
                                    selledBy: order.selledBy,
                                    purchasedBy: order.purchasedBy,
                                    order: order.id,
                                    sku: skuID,
                                    product: productID,
                                    metadata: paymentOptions.metadata
                                }
                                orderItem.status = OrderItemStatus.changed
                                const task = this.stockManager.itemCancel(tradeInformation, item, transaction)
                                tasks.push(task)
                            }

                            const stockTransactions = await Promise.all(tasks)
                            const tradeTransactions = await Promise.all(stockTransactions.map(stockTransaction => stockTransaction.commit()))

                            // payment
                            const balanceTransaction = this.balanceManager.refund(order.purchasedBy,
                                order.id,
                                order.currency,
                                amount,
                                { [paymentOptions.vendorType]: refundResult }
                                , transaction)

                            this.orderManager.update(order, {},
                                { [paymentOptions.vendorType]: refundResult }
                                , transaction)

                            return ({
                                tradeTransactions: tradeTransactions,
                                balanceTransaction: balanceTransaction,
                                refundResult: refundResult
                            })
                        } catch (error) {
                            if (refundResult) {
                                throw ({
                                    refundResult: refundResult
                                })
                            } else {
                                throw error
                            }
                        }
                    })
                } catch (error) {
                    if (error instanceof TradableError) {
                        throw error
                    }
                    let CheckoutCancelResult = error
                    return CheckoutCancelResult
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

            if (order.isCancelled) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid transfer ORDER/${order.id}, This order is Cancelled`)
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

                            order.transferStatus = OrderTransferStatus.cancelled
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

    async request(payout: Payout, payoutOptions?: PayoutOptions) {
        try {
            if (payout.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${payout.account}, This payout is zero amount.`)
            }
            try {
                await firestore.runTransaction(async (transaction) => {
                    payout.status = PayoutStatus.requested
                    this.payoutManager.update(payout, {}, transaction)
                    return
                })
            } catch (error) {
                throw error
            }
        } catch (error) {
            throw error
        }
    }

    async payout(payout: Payout, payoutOptions: PayoutOptions) {
        try {

            if (!(payout.status === PayoutStatus.requested)) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout Payout/${payout.id}, This payout status is invalid.`)
            }
            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${payout.account}, Manager required delegate.`)
            }

            if (payout.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid payout ACCOUNT/${payout.account}, This order is zero amount.`)
            }
            const currency = payout.currency
            const amount = payout.amount
            const accountID = payout.account
            const result = await delegate.payout(currency, amount, accountID, payoutOptions)
            try {
                await firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {

                        // payout
                        const balanceTransaction = await this.balanceManager.payout(accountID, currency, amount, result, transaction)
                        payout.status = PayoutStatus.completed
                        this.payoutManager.update(payout, { [payoutOptions.vendorType]: result }, transaction)
                        const payoutResult: PayoutResult = {
                            balanceTransaction: balanceTransaction,
                            payoutResult: result
                        }
                        resolve(payoutResult)
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