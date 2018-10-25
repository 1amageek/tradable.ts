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
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid order ORDER/${order.id}, This order status is invalid.`)
            }

            const delegate: TransactionDelegate | undefined = this.delegate
            if (!delegate) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid order ORDER/${order.id}, Manager required delegate.`)
            }

            const paymentOptions: PaymentOptions | undefined = this.paymentOptions
            if (!paymentOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid order ORDER/${order.id}, Manager required payment options.`)
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
                                paymentInformation: {
                                    [paymentOptions.vendorType]: chargeResult
                                },
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
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required delegate.`)
            }
    
            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid orderCancel ORDER/${order.id}, This order status is invalid.`)
            }

            const cancelOptions: CancelOptions | undefined = this.cancelOptions
            if (!cancelOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid orderCancel ORDER/${order.id}, Manager required cancel options.`)
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
                                refundInformation: {
                                    [cancelOptions.vendorType]: result
                                },
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
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid transfer ORDER/${order.id}, Manager required delegate.`)
            }

            if (!(order.paymentStatus === OrderPaymentStatus.completed)) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid transfer ORDER/${order.id}, This order paymentStatus is invalid.`)
            }
    
            if (!(order.transferStatus === OrderTransferStatus.none)) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid transfer ORDER/${order.id}, This order transferStatus is invalid.`)
            }

            const transferOptions: TransferOptions | undefined = this.transferOptions
            if (!transferOptions) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid transfer ORDER/${order.id}, Manager required transfer options.`)
            }

            if (order.amount === 0) {
                throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] Invalid transfer ORDER/${order.id}, This order is zero amount.`)
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
                                transferInformation: {
                                    [transferOptions.vendorType]: result
                                },
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

    // async execute(order: Order, process: OrderProcess, batch?: FirebaseFirestore.WriteBatch) {
    //     try {
    //         // validation error
    //         const validator = new OrderValidator(this._Order, this._OrderItem)
    //         const validationError = validator.validate(order)
    //         if (validationError) {
    //             order.status = OrderStatus.rejected
    //             try {
    //                 await order.update()
    //             } catch (error) {
    //                 throw error
    //             }
    //             throw validationError
    //         }
    //         const _batch = batch || firestore.batch()
    //         const __batch = await process(order, _batch)
    //         if (__batch) {
    //             await __batch.commit()
    //         }
    //     } catch (error) {
    //         throw error
    //     }
    // }
    

    // private async inventory<T>(type: InventoryControlType, order: Order, item: OrderItem, transaction: FirebaseFirestore.Transaction, resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any | PromiseLike<T>) => void) {
    //     const productID: string | undefined = item.product
    //     const skuID: string | undefined = item.sku

    //     if (!productID) {
    //         const error = new TradableError(TradableErrorCode.internal, order, `[Manager] ORDER/${order.id} Order requires productID..`)
    //         reject(error)
    //         return
    //     }

    //     if (!skuID) {
    //         const error = new TradableError(TradableErrorCode.internal, order, `[Manager] ORDER/${order.id} Order requires skuID.`)
    //         reject(error)
    //         return
    //     }

    //     let quantity: number = 0
    //     switch (type) {
    //         case InventoryControlType.increase:
    //             quantity = item.quantity
    //             break
    //         case InventoryControlType.decrease:
    //             quantity = -item.quantity
    //             break
    //     }
    //     const product = new this._Product()
    //     const sku: SKU | undefined = await product.skus.doc(skuID, this._SKU, transaction)
    //     if (!sku) {
    //         const error = new TradableError(TradableErrorCode.internal, order, `[Manager] ORDER/${order.id} PRODUCT/${product.id} invalid sku.`)
    //         reject(error)
    //         return
    //     }
    //     const unitSales: number = sku.unitSales || 0
    //     switch (sku.inventory.type) {
    //         case StockType.finite: {
    //             const skuQuantity: number | undefined = sku.inventory.quantity
    //             if (!skuQuantity) {
    //                 const error = new TradableError(TradableErrorCode.outOfStock, order, `[Manager] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
    //                 reject(error)
    //                 return
    //             }
    //             const newUnitSales: number = unitSales + quantity
    //             const remaining: number = skuQuantity - quantity
    //             if (remaining < 0) {
    //                 const error = new TradableError(TradableErrorCode.outOfStock, order, `[Manager] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
    //                 reject(error)
    //             }
    //             transaction.set(sku.reference as FirebaseFirestore.DocumentReference, {
    //                 updateAt: timestamp,
    //                 unitSales: newUnitSales,
    //                 inventory: {
    //                     quantity: remaining
    //                 }
    //             }, { merge: true })
    //             break
    //         }
    //         case StockType.bucket: {
    //             switch (sku.inventory.value) {
    //                 case StockValue.outOfStock: {
    //                     if (quantity > 0) {
    //                         const error = new TradableError(TradableErrorCode.outOfStock, order, `[Manager] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`)
    //                         reject(error)
    //                     }
    //                     break
    //                 }
    //                 default: {
    //                     const newUnitSales: number = unitSales + quantity
    //                     transaction.set(sku.reference as FirebaseFirestore.DocumentReference, {
    //                         updateAt: timestamp,
    //                         unitSales: newUnitSales
    //                     }, { merge: true })
    //                     break
    //                 }
    //             }
    //             break
    //         }
    //         case StockType.infinite: {
    //             const newUnitSales: number = unitSales + quantity
    //             transaction.set(sku.reference as FirebaseFirestore.DocumentReference, {
    //                 updateAt: timestamp,
    //                 unitSales: newUnitSales
    //             }, { merge: true })
    //             break
    //         }
    //     }
    // }

    // async inventoryControl(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {
    //     // Skip
    //     if (order.status === OrderStatus.received ||
    //         order.status === OrderStatus.paid ||
    //         order.status === OrderStatus.waitingForPayment ||
    //         order.status === OrderStatus.transferred ||
    //         order.status === OrderStatus.waitingForTransferrd ||
    //         order.status === OrderStatus.refunded ||
    //         order.status === OrderStatus.waitingForRefund ||
    //         order.status === OrderStatus.canceled
    //     ) {
    //         return
    //     }

    //     try {
    //         order.status = OrderStatus.received
    //         await firestore.runTransaction(async (transaction) => {
    //             return new Promise(async (resolve, reject) => {

    //                 const items: OrderItem[] = await order.items.get(this._OrderItem, transaction)
    //                 for (const item of items) {
    //                     await this.inventory(InventoryControlType.increase, order, item, transaction, resolve, reject)
    //                 }

    //                 transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                     updateAt: timestamp,
    //                     status: OrderStatus.received
    //                 }, { merge: true })
    //                 resolve(`[Success] ORDER/${order.id}, USER/${order.selledBy}`)
    //             })
    //         })
    //     } catch (error) {
    //         order.status = OrderStatus.rejected
    //         try {
    //             await order.update()
    //         } catch (error) {
    //             throw error
    //         }
    //         throw error
    //     }
    // }

    // async charge(order: Order,
    //     options: ChargeOptions,
    //     batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

    //     // Skip for paid, waitingForRefund, refunded
    //     if (order.status === OrderStatus.paid ||
    //         order.status === OrderStatus.waitingForRefund ||
    //         order.status === OrderStatus.refunded ||
    //         order.status === OrderStatus.transferred ||
    //         order.status === OrderStatus.waitingForTransferrd
    //     ) {
    //         return
    //     }
    //     if (!(order.status === OrderStatus.received || order.status === OrderStatus.waitingForPayment)) {
    //         throw new TradableError(TradableErrorCode.invalidStatus, order, `[Manager] pay ORDER/${order.id}, Order is not a payable status.`)
    //     }
    //     if (!options.vendorType) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] pay ORDER/${order.id}, ChargeOptions required vendorType`)
    //     }
    //     const delegate: TransactionDelegate | undefined = this.delegate

    //     if (!delegate) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] cancel ORDER/${order.id}, Manager required delegate`)
    //     }

    //     if (order.amount === 0) {
    //         order.status = OrderStatus.paid
    //         batch.set(order.reference as FirebaseFirestore.DocumentReference, {
    //             updateAt: timestamp,
    //             status: OrderStatus.paid
    //         }, { merge: true })
    //         return batch
    //     } else {
    //         if (!options.customer && !options.source) {
    //             throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] pay ORDER/${order.id}, ChargeOptions required customer or source`)
    //         }
    //         try {
    //             order.status = OrderStatus.paid
    //             const result = await delegate.charge(order, options)

    //             await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {
    //                         const targetOrder: Order = new this._Order(order.id, {})
    //                         await targetOrder.fetch(transaction)

    //                         if (targetOrder.status === OrderStatus.paid ||
    //                             targetOrder.status === OrderStatus.waitingForRefund ||
    //                             targetOrder.status === OrderStatus.refunded ||
    //                             targetOrder.status === OrderStatus.transferred ||
    //                             targetOrder.status === OrderStatus.waitingForTransferrd
    //                         ) {
    //                             resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`)
    //                             return
    //                         }

    //                         const account: Account = new this._Account(targetOrder.selledBy, {})
    //                         await account.fetch(transaction)
    //                         const amount: number = targetOrder.amount
    //                         const commissionRate: number = account.commissionRate
    //                         const fee: number = amount * commissionRate
    //                         const transfer: number = amount - fee

    //                         console.log(`[Tradable] pay currency: ${Currency} amount: ${amount} commissionRate: ${commissionRate} fee: ${fee} transfer: ${transfer}`)

    //                         const currency: Currency = targetOrder.currency
    //                         const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
    //                         const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
    //                         const amountOfAccountsReceivable: number = accountsReceivable[currency] || 0
    //                         const newAmount: number = amountOfAccountsReceivable + transfer

    //                         const revenue: { [currency: string]: number } = account.revenue || {}
    //                         const amountOfRevenue: number = revenue[currency] || 0
    //                         const newRevenue: number = amountOfRevenue + transfer

    //                         const sales: { [currency: string]: number } = account.sales || {}
    //                         const amountOfSales: number = sales[currency] || 0
    //                         const newSales: number = amountOfSales + amount

    //                         const trans: Transaction = new this._Transaction(order.id, {})
    //                         trans.type = TransactionType.payment
    //                         trans.amount = transfer
    //                         trans.currency = currency
    //                         trans.order = order.id

    //                         transaction.set(trans.reference as FirebaseFirestore.DocumentReference, trans.value, { merge: true })

    //                         // set account data
    //                         transaction.set(account.reference as FirebaseFirestore.DocumentReference, {
    //                             updateAt: timestamp,
    //                             revenue: { [currency]: newRevenue },
    //                             sales: { [currency]: newSales },
    //                             balance: {
    //                                 accountsReceivable: { [currency]: newAmount }
    //                             }
    //                         }, { merge: true })

    //                         // set order data
    //                         transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                             updateAt: timestamp,
    //                             paymentInformation: {
    //                                 [options.vendorType]: result
    //                             },
    //                             status: OrderStatus.paid
    //                         }, { merge: true })

    //                         resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`)
    //                     } catch (error) {
    //                         let _error = new TradableError(TradableErrorCode.internal, order, error.message, error.stack)
    //                         reject(_error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             order.status = OrderStatus.waitingForPayment
    //             try {
    //                 await order.update()
    //             } catch (error) {
    //                 throw error
    //             }
    //             throw error
    //         }
    //     }
    // }

    // async order(order: Order, options: ChargeOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {
    //     try {
    //         await this.inventoryControl(order, batch)
    //         return await this.charge(order, options, batch)
    //     } catch (error) {
    //         throw error
    //     }
    // }

    // async cancel(order: Order, options: CancelOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {
    //     // Skip for refunded
    //     if (order.status === OrderStatus.refunded) {
    //         return
    //     }
    //     if (!(order.status === OrderStatus.paid)) {
    //         throw new TradableError(TradableErrorCode.invalidStatus, order, `[Manager] cancel ORDER/${order.id}, Order is not a changeable status.`)
    //     }
    //     if (!options.vendorType) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] cancel ORDER/${order.id}, PaymentOptions required vendorType`)
    //     }

    //     const delegate: TransactionDelegate | undefined = this.delegate

    //     if (!delegate) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] cancel ORDER/${order.id}, Manager required delegate`)
    //     }

    //     if (order.amount === 0) {
    //         try {
    //             await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {
    //                         const items: OrderItem[] = await order.items.get(this._OrderItem, transaction)
    //                         for (const item of items) {
    //                             await this.inventory(InventoryControlType.decrease, order, item, transaction, resolve, reject)
    //                         }
    //                         transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                             status: OrderStatus.canceled
    //                         }, { merge: true })
    //                         resolve(`[Success] cancel ORDER/${order.id}, USER/${order.selledBy}`)
    //                     } catch (error) {
    //                         let _error = new TradableError(TradableErrorCode.internal, order, error.message, error.stack)
    //                         reject(_error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             throw error
    //         }
    //     } else {
    //         try {
    //             await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {

    //                         const items: OrderItem[] = await order.items.get(this._OrderItem, transaction)
    //                         const paymentTransaction = new this._Transaction()
    //                         for (const item of items) {
    //                             this.inventory(InventoryControlType.decrease, order, item, transaction, resolve, reject)
    //                         }

    //                         const account: Account = new this._Account(order.selledBy, {})
    //                         await account.fetch(transaction)
    //                         const currency: string = order.currency
    //                         const amount: number = order.amount
    //                         const commissionRate: number = account.commissionRate
    //                         const fee: number = amount * commissionRate
    //                         const transfer: number = amount - fee

    //                         const revenueWithCurrency: number = account.revenue[order.currency] || 0
    //                         const newRevenueWithCurrency: number = revenueWithCurrency - transfer
    //                         const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }

    //                         const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
    //                         const accountsReceivableWithCurrency: number = accountsReceivable[order.currency] || 0
    //                         const newAccountsReceivable: number = accountsReceivableWithCurrency - transfer

    //                         const sales: { [currency: string]: number } = account.sales || {}
    //                         const amountOfSales: number = sales[currency] || 0
    //                         const newSales: number = amountOfSales - amount

    //                         const result = await delegate.cancel(order, options)

    //                         // set account data
    //                         transaction.set(account.reference as FirebaseFirestore.DocumentReference, {
    //                             updateAt: timestamp,
    //                             revenue: { [currency]: newRevenueWithCurrency },
    //                             sales: { [currency]: newSales },
    //                             balance: {
    //                                 accountsReceivable: { [currency]: newAccountsReceivable }
    //                             }
    //                         }, { merge: true })

    //                         // set order data
    //                         transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                             status: OrderStatus.canceled,
    //                             refundInformation: {
    //                                 [options.vendorType]: result
    //                             }
    //                         }, { merge: true })
    //                         resolve(`[Success] cancel ORDER/${order.id}, USER/${order.selledBy}`)
    //                     } catch (error) {
    //                         let _error = new TradableError(TradableErrorCode.internal, order, error.message, error.stack)
    //                         reject(_error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             throw error
    //         }
    //     }
    // }

    // async refund(order: Order, options: RefundOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

    //     // Skip for refunded
    //     if (order.status === OrderStatus.refunded) {
    //         return
    //     }
    //     if (!(order.status === OrderStatus.paid || order.status === OrderStatus.transferred || order.status === OrderStatus.waitingForTransferrd)) {
    //         throw new TradableError(TradableErrorCode.invalidStatus, order, `[Manager] refund ORDER/${order.id}, Order is not a refundable status.`)
    //     }
    //     if (!options.vendorType) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] refund ORDER/${order.id}, PaymentOptions required vendorType`)
    //     }

    //     const delegate: TransactionDelegate | undefined = this.delegate

    //     if (!delegate) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] refund ORDER/${order.id}, Manager required delegate`)
    //     }

    //     if (order.amount === 0) {
    //         order.status = OrderStatus.refunded
    //         batch.set(order.reference as FirebaseFirestore.DocumentReference, {
    //             updateAt: timestamp,
    //             status: OrderStatus.refunded
    //         }, { merge: true })
    //         return batch
    //     } else {
    //         try {
    //             order.status = OrderStatus.refunded
    //             const result = await delegate.refund(order, options)
    //             await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {
    //                         const account: Account = new this._Account(order.selledBy, {})
    //                         await account.fetch(transaction)
    //                         if (order.status === OrderStatus.transferred) {
    //                             const currency: string = order.currency
    //                             const net: number = order.net
    //                             const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
    //                             const available: { [currency: string]: number } = balance.available
    //                             const amountOfAvailable: number = available[order.currency] || 0
    //                             const newAmount: number = amountOfAvailable - net

    //                             // set account data
    //                             transaction.set(account.reference as FirebaseFirestore.DocumentReference, {
    //                                 balance: {
    //                                     available: { [currency]: newAmount }
    //                                 }
    //                             }, { merge: true })

    //                             // set order data
    //                             transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                                 refundInformation: {
    //                                     [options.vendorType]: result
    //                                 },
    //                                 status: OrderStatus.refunded
    //                             }, { merge: true })

    //                         } else {
    //                             const currency: string = order.currency
    //                             const net: number = order.net
    //                             const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
    //                             const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
    //                             const amountAccountsReceivable: number = accountsReceivable[order.currency] || 0
    //                             const newAmount: number = amountAccountsReceivable - net

    //                             // set account data
    //                             transaction.set(account.reference as FirebaseFirestore.DocumentReference, {
    //                                 accountsReceivable: {
    //                                     available: { [currency]: newAmount }
    //                                 }
    //                             }, { merge: true })

    //                             // set order data
    //                             transaction.set(order.reference as FirebaseFirestore.DocumentReference, {
    //                                 refundInformation: {
    //                                     [options.vendorType]: result
    //                                 },
    //                                 status: OrderStatus.refunded
    //                             }, { merge: true })
    //                         }
    //                         resolve(`[Success] refund ORDER/${order.id}, USER/${order.selledBy}`)
    //                     } catch (error) {
    //                         let _error = new TradableError(TradableErrorCode.internal, order, error.message, error.stack)
    //                         reject(_error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             order.status = OrderStatus.waitingForRefund
    //             try {
    //                 await order.update()
    //             } catch (error) {
    //                 throw error
    //             }
    //             throw error
    //         }
    //     }
    // }

    // async transfer(order: Order, options: TransferOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {

    //     // Skip for 
    //     if (order.status === OrderStatus.transferred) {
    //         return
    //     }
    //     if (!(order.status === OrderStatus.paid || order.status === OrderStatus.waitingForTransferrd)) {
    //         throw new TradableError(TradableErrorCode.invalidStatus, order, `[Manager] transfer ORDER/${order.id}, Order is not a transferable status.`)
    //     }
    //     if (!options.vendorType) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] transfer ORDER/${order.id}, PaymentOptions required vendorType`)
    //     }
    //     if (!this.delegate) {
    //         throw new TradableError(TradableErrorCode.invalidArgument, order, `[Manager] transfer ORDER/${order.id}, Manager required delegate`)
    //     }

    //     if (order.amount === 0) {
    //         order.status = OrderStatus.transferred
    //         batch.set(order.reference as FirebaseFirestore.DocumentReference, {
    //             updateAt: timestamp,
    //             status: OrderStatus.transferred
    //         }, { merge: true })
    //         return batch
    //     } else {
    //         try {
    //             order.status = OrderStatus.transferred
    //             const result = await this.delegate.transfer(order, options)
    //             await firestore.runTransaction(async (transaction) => {
    //                 return new Promise(async (resolve, reject) => {
    //                     try {

    //                         const targetOrder: Order = new this._Order(order.id, {})
    //                         await targetOrder.fetch(transaction)

    //                         if (targetOrder.status === OrderStatus.transferred) {
    //                             resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}`)
    //                             return
    //                         }

    //                         const account: Account = new this._Account(targetOrder.selledBy, {})
    //                         await account.fetch(transaction)
    //                         const currency: Currency = targetOrder.currency
    //                         const balance: Balance = account.balance || { accountsReceivable: {}, available: {} }
    //                         const accountsReceivable: { [currency: string]: number } = balance.accountsReceivable
    //                         const available: { [currency: string]: number } = balance.available
    //                         const net: number = targetOrder.net
    //                         const accountsReceivableAmount: number = accountsReceivable[targetOrder.currency] || 0
    //                         const availableAmount: number = available[targetOrder.currency] || 0
    //                         const newAccountsReceivableAmount: number = accountsReceivableAmount - net
    //                         const newAvailableAmount: number = availableAmount + net

    //                         // set account data
    //                         transaction.set(account.reference as FirebaseFirestore.DocumentReference, {
    //                             balance: {
    //                                 accountsReceivable: { [currency]: newAccountsReceivableAmount },
    //                                 available: { [currency]: newAvailableAmount }
    //                             }
    //                         }, { merge: true })

    //                         // set transaction data
    //                         const trans: Transaction = new this._Transaction()
    //                         trans.amount = targetOrder.amount
    //                         trans.fee = targetOrder.fee
    //                         trans.net = targetOrder.net
    //                         trans.currency = currency
    //                         trans.type = TransactionType.transfer
    //                         trans.setParent(account.transactions)
    //                         trans.order = targetOrder.id
    //                         trans.information = {
    //                             [options.vendorType]: result
    //                         }
    //                         transaction.set(trans.reference as FirebaseFirestore.DocumentReference, trans.value())

    //                         // set order data
    //                         transaction.set(targetOrder.reference as FirebaseFirestore.DocumentReference, {
    //                             transferInformation: {
    //                                 [options.vendorType]: result
    //                             },
    //                             transferredTo: { [trans.id]: true },
    //                             status: OrderStatus.transferred
    //                         }, { merge: true })

    //                         resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}, TRANSACTION/${trans.id}`)
    //                     } catch (error) {
    //                         let _error = new TradableError(TradableErrorCode.internal, order, error.message, error.stack)
    //                         reject(_error)
    //                     }
    //                 })
    //             })
    //         } catch (error) {
    //             order.status = OrderStatus.waitingForTransferrd
    //             try {
    //                 await order.update()
    //             } catch (error) {
    //                 throw error
    //             }
    //             throw error
    //         }
    //     }
    // }

    // // async payout(account: Account, currency: Currency, batch?: FirebaseFirestore.WriteBatch) {

    // //     if (!account.isSigned) {
    // //         throw new TradableError(order, `[Manager] ACCOUNT/${account.id}, This account has not agreed to the terms of service.`)
    // //     }
    // //     const balance = account.balance
    // //     const amount: number = balance[currency]

    // //     try {
    // //         const result = await this.delegate.payout(account, amount, currency)
    // //     } catch (error) {
    // //         throw error
    // //     }

    // // }

    // async complete(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void> {
    //     if (order.status === OrderStatus.completed) {
    //         return
    //     }
    //     batch.set(order.reference as FirebaseFirestore.DocumentReference, {
    //         updateAt: timestamp,
    //         status: OrderStatus.completed
    //     }, { merge: true })
    //     return batch
    // }
}