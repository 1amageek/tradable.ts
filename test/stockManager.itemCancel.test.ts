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
import { StockManager } from '../src/StockManager'
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

    const stockManager: StockManager<Order, OrderItem, User, InventoryStock, SKU, TradeTransaction> = new StockManager(User, InventoryStock, SKU, TradeTransaction)

    beforeAll(async () => {

        product.name = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        sku.title = "sku"
        sku.selledBy = shop.id
        sku.createdBy = shop.id
        sku.product = product.reference
        sku.amount = 100
        sku.currency = Tradable.Currency.JPY
        sku.inventory = {
            type: Tradable.StockType.finite,
            quantity: 2
        }
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
        await Promise.all([user.save(), sku.save(), product.save(), shop.save()])

        stockManager.delegate = new TradeDelegate()
    })

    describe("OrderItemCancel", async () => {

        let orderResult: TradeTransaction | undefined = undefined

        test("Success", async () => {
            try {
                const result = await Pring.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        const tradeInformation = {
                            selledBy: shop.id,
                            purchasedBy: user.id,
                            order: order.id,
                            sku: sku.id,
                            product: product.reference
                        }
                        const stockTransaction = await stockManager.trade(tradeInformation, 1, transaction)
                        const result = await stockTransaction.commit()
                        resolve(result)
                    })
				}) as TradeTransaction[]
				
				orderResult = result[0]

                transactionID = result[0].id

                const shopTradeTransaction = (await shop.tradeTransactions.query(TradeTransaction).orderBy("createdAt").dataSource().get())[0]
                const userTradeTransaction = (await user.tradeTransactions.query(TradeTransaction).orderBy("createdAt").dataSource().get())[0]
                const _product: Product = new Product(product.id, {})
                const _sku = new SKU(sku.id, {})
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("order", "==", result[0].order).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]

                const _item = (await user.items.get(Item))[0]

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.reference)
                expect(shopTradeTransaction.sku).toEqual(sku.id)
                expect(shopTradeTransaction.item.id).toEqual(_item.id)


                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.reference)
                expect(userTradeTransaction.sku).toEqual(sku.id)
                expect(userTradeTransaction.item.id).toEqual(_item.id)

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(inventoryStocks.length).toEqual(1)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.reference)
                expect(_item.sku).toEqual(sku.id)

            } catch (error) {
                console.log(error)
            }
        }, 15000)

        test("Success", async () => {			
            const item = orderResult!.item
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const tradeInformation = {
                        selledBy: shop.id,
                        purchasedBy: user.id,
                        order: order.id,
                        sku: sku.id,
                        product: product.reference
                    }
                    const result = await stockManager.itemCancel(tradeInformation, item, transaction)
                    resolve(result)
                })
			}) as TradeTransaction
			
			orderResult = result

            const shopTradeTransaction = (await shop.tradeTransactions.doc(result.id, TradeTransaction).fetch())
            const userTradeTransaction = (await user.tradeTransactions.doc(result.id, TradeTransaction).fetch())

            const _product: Product = new Product(product.id, {})
            const _sku = new SKU(sku.id, {})
            const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
            const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
            const inventoryStocks: InventoryStock[] = promiseResult[1]
            const _item = await user.items.doc(result!.item.id, Item).fetch()

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.reference)
            expect(shopTradeTransaction.sku).toEqual(sku.id)
            expect(shopTradeTransaction.item.id).toEqual(item.id)

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.reference)
            expect(userTradeTransaction.sku).toEqual(sku.id)
            expect(userTradeTransaction.item.id).toEqual(item.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(2)
            expect(inventoryStocks.length).toEqual(2)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.reference)
            expect(_item.sku).toEqual(sku.id)
            expect(_item.isCancelled).toEqual(true)

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
                                product: product.reference
                            }
                            await stockManager.itemCancel(tradeInformation, (new Item()).reference, transaction)
                        } catch (error) {
                            reject(error)
                        }
                        resolve(`[Manager] Success order ORDER/${order.id}, USER/${order.selledBy} USER/${order.purchasedBy}`)
                    })
                })
            } catch (error) {
                expect(error).not.toBeUndefined()
                const shopTradeTransaction = (await shop.tradeTransactions.doc(orderResult!.id, TradeTransaction).fetch())
                const userTradeTransaction = (await user.tradeTransactions.doc(orderResult!.id, TradeTransaction).fetch())
                const _product: Product = new Product(product.id, {})
                const _sku = new SKU(sku.id, {})
                const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
                const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get(), shopTradeTransaction.fetch(), userTradeTransaction.fetch()])
                const inventoryStocks: InventoryStock[] = promiseResult[1]
                const _item = await user.items.doc(orderResult!.item.id, Item).fetch()

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.reference)
                expect(shopTradeTransaction.sku).toEqual(sku.id)
                expect(shopTradeTransaction.item.id).toEqual(_item.id)

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.reference)
                expect(userTradeTransaction.sku).toEqual(sku.id)
                expect(userTradeTransaction.item.id).toEqual(_item.id)

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(2)
                expect(inventoryStocks.length).toEqual(2)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.reference)
                expect(_item.sku).toEqual(sku.id)
                expect(_item.isCancelled).toEqual(true)
            }
        }, 15000)
    })

    afterAll(async () => {
        await Promise.all([shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
