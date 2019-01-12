process.env.NODE_ENV = 'test'
import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from '../config'
import * as Stripe from 'stripe'
import { User } from './models/user'
import { Product } from './models/product'
import { InventoryStock } from './models/inventoryStock'
import { SKU } from './models/sku'
import { Order } from './models/order'
import { OrderItem } from './models/orderItem'
import { Item } from './models/item'
import { TradeTransaction } from './models/tradeTransaction'
import { Account } from './models/account'
import { StockManager } from '../src/stockManager'
import * as firebase from '@firebase/testing'
import { TradeDelegate } from './tradeDelegate';


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Pring.initialize(app.firestore())
Tradable.initialize(app)

describe("StockManager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    let transactionID: string

    const stockManager: StockManager<Order, OrderItem, User, Product, InventoryStock, SKU, TradeTransaction> = new StockManager(User, Product, InventoryStock, SKU, TradeTransaction)

    beforeAll(async () => {

        product.name = "PRODUCT"
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
            quantity: 2
        }
        product.SKUs.insert(sku)
        for (let i = 0; i < sku.inventory.quantity!; i++) {
            const inventoryStock: InventoryStock = new InventoryStock(`${i}`)
            sku.inventoryStocks.insert(inventoryStock)
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
        order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
        order.items.append(orderItem)

        user.orders.insert(order)
        await Promise.all([user.save(), product.save(), shop.save()])

        stockManager.delegate = new TradeDelegate()
    })

    describe("Order", async () => {
        test("Success", async () => {
            try {
                const result = await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        const tradeInformation = {
                            selledBy: shop.id,
                            purchasedBy: user.id,
                            order: order.id,
                            sku: sku.id,
                            product: product.id
                        }
                        const result = await stockManager.order(tradeInformation, 1, transaction)
                        resolve(result)
                    })
                }) as TradeTransaction

                transactionID = result.id

                const shopTradeTransaction = shop.tradeTransactions.doc(result.id, TradeTransaction)
                const userTradeTransaction = user.tradeTransactions.doc(result.id, TradeTransaction)
                const _product: Product = new Product(product.id, {})
                const _sku = _product.SKUs.doc(sku.id, SKU)
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("order", "==", result.order).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]

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
                expect(_sku.inventory.quantity).toEqual(2)
                expect(inventoryStocks.length).toEqual(1)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)

            } catch (error) {
                console.log(error)
            }
        }, 15000)

        test("Failure", async () => {
            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const tradeInformation = {
                                selledBy: shop.id,
                                purchasedBy: user.id,
                                order: order.id,
                                sku: sku.id,
                                product: product.id
                            }
                            const result = await stockManager.order(tradeInformation, 2, transaction)
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
                const _product: Product = new Product(product.id, {})
                const _sku = _product.SKUs.doc(sku.id, SKU)
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]
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
                expect(_sku.inventory.quantity).toEqual(2)
                expect(inventoryStocks).toEqual(1)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)
            }
        }, 15000)

        test("Failure SKU is not availabled", async () => {

            const product: Product = new Product()
            const sku: SKU = new SKU()
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            product.name = "PRODUCT"
            product.createdBy = shop.id
            product.selledBy = shop.id

            sku.title = "sku"
            sku.isAvailabled = false
            sku.selledBy = shop.id
            sku.createdBy = shop.id
            sku.product = product.id
            sku.amount = 100
            sku.currency = Tradable.Currency.JPY
            sku.inventory = {
                type: Tradable.StockType.finite,
                quantity: 5
            }
            product.SKUs.insert(sku)
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
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.append(orderItem)

            user.orders.insert(order)
            await Promise.all([user.save(), product.save(), shop.save()])

            try {
                await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const tradeInformation = {
                                selledBy: shop.id,
                                purchasedBy: user.id,
                                order: order.id,
                                sku: sku.id,
                                product: product.id
                            }
                            const result = await stockManager.order(tradeInformation, 1, transaction)
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
                const _product: Product = new Product(product.id, {})
                const _sku = _product.SKUs.doc(sku.id, SKU)
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]
                const _item = (await user.items.get(Item))[0]

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.items).toEqual([_item.id])

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.items).toEqual([_item.id])

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(5)
                expect(inventoryStocks.length).toEqual(5)

                // Item
                expect(_item.selledBy).toEqual(shop.id)
            }
        }, 15000)
    })

    describe("OrderCancel", async () => {
        test("Success", async () => {
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const tradeInformation = {
                        selledBy: shop.id,
                        purchasedBy: user.id,
                        order: order.id,
                        sku: sku.id,
                        product: product.id
                    }
                    const result = await stockManager.orderCancel(tradeInformation, transaction)
                    resolve(result)
                })
            }) as TradeTransaction

            const shopTradeTransaction = shop.tradeTransactions.doc(result.id, TradeTransaction)
            const userTradeTransaction = user.tradeTransactions.doc(result.id, TradeTransaction)
            const _product: Product = new Product(product.id, {})
            const _sku = _product.SKUs.doc(sku.id, SKU)
            const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
            const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
            const inventoryStocks: InventoryStock[] = promiseResult[1]
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
            expect(_sku.inventory.quantity).toEqual(2)
            expect(inventoryStocks.length).toEqual(2)

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
                            const tradeInformation = {
                                selledBy: shop.id,
                                purchasedBy: user.id,
                                order: order.id,
                                sku: "sku.id",
                                product: product.id
                            }
                            await stockManager.orderCancel(tradeInformation, transaction)
                        } catch (error) {
                            reject(error)
                        }
                        resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                    })
                })
            } catch (error) {
                expect(error).not.toBeUndefined()

                const shopTradeTransaction = shop.tradeTransactions.doc(transactionID, TradeTransaction)
                const userTradeTransaction = user.tradeTransactions.doc(transactionID, TradeTransaction)
                const _product: Product = new Product(product.id, {})
                const _sku = _product.SKUs.doc(sku.id, SKU)
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]
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
                expect(_sku.inventory.quantity).toEqual(2)
                expect(inventoryStocks.length).toEqual(2)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)
                expect(_item.isCanceled).toEqual(true)
            }
        }, 15000)
    })

    describe("orderChange", async () => {
        test("Success", async () => {
            await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const tradeInformation = {
                        selledBy: shop.id,
                        purchasedBy: user.id,
                        order: order.id,
                        sku: sku.id,
                        product: product.id
                    }
                    await stockManager.order(tradeInformation, 1, transaction)
                    resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                })
            })

            const item = (await user.items.get(Item))[0]

            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const tradeInformation = {
                        selledBy: shop.id,
                        purchasedBy: user.id,
                        order: order.id,
                        sku: sku.id,
                        product: product.id
                    }
                    const result = await stockManager.itemCancel(tradeInformation, item.id, transaction)
                    resolve(result)
                })
            }) as TradeTransaction

            const shopTradeTransaction = shop.tradeTransactions.doc(result.id, TradeTransaction)
            const userTradeTransaction = user.tradeTransactions.doc(result.id, TradeTransaction)
            const _product: Product = new Product(product.id, {})
            const _sku = _product.SKUs.doc(sku.id, SKU)
            const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
            const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
            const inventoryStocks: InventoryStock[] = promiseResult[1]
            const _item = (await user.items.get(Item))[0]

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)
            expect(shopTradeTransaction.items).toEqual([_item.id])

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)
            expect(userTradeTransaction.items).toEqual([_item.id])

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(2)
            expect(inventoryStocks.length).toEqual(2)

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
                            const tradeInformation = {
                                selledBy: shop.id,
                                purchasedBy: user.id,
                                order: order.id,
                                sku: sku.id,
                                product: product.id
                            }
                            await stockManager.itemCancel(tradeInformation, "item.id", transaction)
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
                const _product: Product = new Product(product.id, {})
                const _sku = _product.SKUs.doc(sku.id, SKU)
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]
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
                expect(_sku.inventory.quantity).toEqual(2)
                expect(inventoryStocks.length).toEqual(2)

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
        await Promise.all([shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
