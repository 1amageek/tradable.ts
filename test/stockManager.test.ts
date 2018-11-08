process.env.NODE_ENV = 'test'
import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from './config'
import * as Stripe from 'stripe'
import { User } from './models/user'
import { Product } from './models/product'
import { SKU } from './models/sku'
import { Order } from './models/order'
import { OrderItem } from './models/orderItem'
import { Item } from './models/item'
import { TradeTransaction } from './models/tradeTransaction'
import { Account } from './models/account'
import { StockManager } from '../src/stockManager'
import * as firebase from '@firebase/testing'


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Tradable.initialize(app, admin.firestore.FieldValue.serverTimestamp())

describe("StockManager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    let transactionID: string

    const stockManager: StockManager<Order, OrderItem, User, Product, SKU, Item, TradeTransaction> = new StockManager(User, Product, SKU, Item, TradeTransaction)

    beforeAll(async () => {
        product.skus.insert(sku)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        sku.title = "sku"
        sku.selledBy = shop.id
        sku.createdBy = shop.id
        sku.product = product.id
        sku.amount = 100
        sku.currency = Tradable.Currency.JPY
        sku.inventory = {
            type: Tradable.StockType.finite,
            quantity: 1
        }

        orderItem.order = order.id
        orderItem.selledBy = shop.id
        orderItem.purchasedBy = user.id
        orderItem.sku = sku.id
        orderItem.currency = sku.currency
        orderItem.amount = sku.amount
        orderItem.quantity = 1

        order.amount = sku.amount
        order.currency = sku.currency
        order.selledBy = shop.id
        order.purchasedBy = user.id
        order.shippingTo = { address: "address" }
        order.expirationDate = new Date(date.setDate(date.getDate() + 14))
        order.items.insert(orderItem)

        user.orders.insert(order)
        await Promise.all([user.save(), product.save(), shop.save()])
    })

    describe("Order", async () => {
        test("Success", async () => {
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const result = await stockManager.order(shop.id, user.id, order.id, product.id, sku.id, 1, transaction)
                    resolve(result)
                })
            }) as TradeTransaction

            transactionID = result.id

            const shopTradeTransaction = await shop.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const _sku = await product.skus.doc(sku.id, SKU) as SKU
            const _item = (await user.items.get(Item))[0]

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)
            expect(shopTradeTransaction.items).toEqual([_item.id])


            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)
            expect(userTradeTransaction.items).toEqual([_item.id])

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(0)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

        }, 15000)

        test("Failure", async () => {
            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            await stockManager.order(shop.id, user.id, order.id, product.id, sku.id, 1, transaction)
                        } catch (error) {
                            reject(error)
                        }
                        resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                    })
                })
            } catch (error) {
                expect(error).not.toBeUndefined()
                const shopTradeTransaction = (await shop.tradeTransactions.get(TradeTransaction))[0]
                const userTradeTransaction = (await user.tradeTransactions.get(TradeTransaction))[0]
                const _sku = await product.skus.doc(sku.id, SKU) as SKU
                const _item = (await user.items.get(Item))[0]

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.id)
                expect(shopTradeTransaction.sku).toEqual(sku.id)
                expect(shopTradeTransaction.items).toEqual([_item.id])

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.id)
                expect(userTradeTransaction.sku).toEqual(sku.id)
                expect(userTradeTransaction.items).toEqual([_item.id])
                
                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(0)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)
            }
        }, 15000)
    })

    describe("OrderCancel", async () => {
        test("Success", async () => {
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const result = await stockManager.orderCancel(shop.id, user.id, order.id, product.id, sku.id, 1, transaction)
                    resolve(result)
                })
            }) as TradeTransaction

            const shopTradeTransaction = await shop.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const _sku = await product.skus.doc(sku.id, SKU) as SKU
            const _item = (await user.items.get(Item))[0]

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)
            expect(shopTradeTransaction.items).toEqual([_item.id])

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)
            expect(userTradeTransaction.items).toEqual([_item.id])

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(1)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)
            expect(_item.isCanceled).toEqual(true)

        }, 15000)

        test("Failure", async () => {
            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            await stockManager.orderCancel(shop.id, user.id, order.id, product.id, "sku.id", 1, transaction)
                        } catch (error) {
                            reject(error)
                        }
                        resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                    })
                })
            } catch (error) {
                expect(error).not.toBeUndefined()

                const shopTradeTransaction = await shop.tradeTransactions.doc(transactionID, TradeTransaction) as TradeTransaction
                const userTradeTransaction = await user.tradeTransactions.doc(transactionID, TradeTransaction) as TradeTransaction
                const _sku = await product.skus.doc(sku.id, SKU) as SKU
                const _item = (await user.items.get(Item))[0]

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.id)
                expect(shopTradeTransaction.sku).toEqual(sku.id)
                expect(shopTradeTransaction.items).toEqual([_item.id])

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.id)
                expect(userTradeTransaction.sku).toEqual(sku.id)
                expect(userTradeTransaction.items).toEqual([_item.id])

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(1)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)
                expect(_item.isCanceled).toEqual(true)
            }
        }, 15000)
    })

    describe("itemCancel", async () => {
        test("Success", async () => {
            await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    await stockManager.order(shop.id, user.id, order.id, product.id, sku.id, 1, transaction)
                    resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                })
            })

            const item = (await user.items.get(Item))[0]

            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const result = await stockManager.itemCancel(shop.id, user.id, order.id, product.id, sku.id, item.id, transaction)
                    resolve(result)
                })
            }) as TradeTransaction

            const shopTradeTransaction = await shop.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(result.id, TradeTransaction) as TradeTransaction
            const _sku = await product.skus.doc(sku.id, SKU) as SKU
            const _item = (await user.items.get(Item))[0]

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderItemCancel)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)
            expect(shopTradeTransaction.items).toEqual([_item.id])

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderItemCancel)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)
            expect(userTradeTransaction.items).toEqual([_item.id])

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(1)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)
            expect(_item.isCanceled).toEqual(true)

        }, 15000)

        test("Failure", async () => {
            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            await stockManager.itemCancel(shop.id, user.id, order.id, product.id, sku.id, "item.id", transaction)
                        } catch (error) {
                            reject(error)
                        }
                        resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                    })
                })
            } catch (error) {
                expect(error).not.toBeUndefined()
                const shopTradeTransaction = (await shop.tradeTransactions.get(TradeTransaction))[0]
                const userTradeTransaction = (await user.tradeTransactions.get(TradeTransaction))[0]
                const _sku = await product.skus.doc(sku.id, SKU) as SKU
                const _item = (await user.items.get(Item))[0]

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.id)
                expect(shopTradeTransaction.sku).toEqual(sku.id)
                expect(shopTradeTransaction.items).toEqual([_item.id])

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.id)
                expect(userTradeTransaction.sku).toEqual(sku.id)
                expect(userTradeTransaction.items).toEqual([_item.id])

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(1)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)
                expect(_item.isCanceled).toEqual(true)
            }
        }, 15000)
    })

    afterAll(async () => {
        // await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
