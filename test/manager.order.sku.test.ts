process.env.NODE_ENV = 'test'
import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from '../config'
import * as Stripe from 'stripe'
import { User } from './models/user'
import { Product } from './models/product'
import { SKUShard } from './models/skuShard'
import { SKU } from './models/sku'
import { Order } from './models/order'
import { OrderItem } from './models/orderItem'
import { Item } from './models/item'
import { TradeTransaction } from './models/tradeTransaction'
import { Account } from './models/account'
import { BalanceManager } from '../src/balanceManager'
import { BalanceTransaction } from './models/BalanceTransaction'
import { StripePaymentDelegate } from './stripePaymentDelegate'
import { StripeInvalidPaymentDelegate } from './stripeInvalidPaymentDelegate'
import * as firebase from '@firebase/testing'
import { TradeDelegate } from './tradeDelegate'


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Pring.initialize(app.firestore())
Tradable.initialize(app)

describe("Manager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})

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
            quantity: 5
        }
        sku.numberOfShards = 1
        for (let i = 0; i < 1; i++) {
            const shard: SKUShard = new SKUShard(`${i}`)
            sku.shards.insert(shard)
        }

        await Promise.all([product.save(), shop.save(), user.save()])
    })

    describe("order", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKUShard, SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKUShard, SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
            manager.delegate = new StripePaymentDelegate()
            manager.tradeDelegate = new TradeDelegate()

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.product = product.id
            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.purchasedBy = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.amount
            orderItem.quantity = 5

            order.amount = sku.amount * 5
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.append(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>

            const shopTradeTransaction = (await shop.tradeTransactions.get(TradeTransaction))[0]
            const userTradeTransaction = (await user.tradeTransactions.get(TradeTransaction))[0]
            const _sku: SKU = product.skus.doc(sku.id, SKU)
            const promiseResult = await Promise.all([_sku.fetch(), sku.shards.get(SKUShard)])
            const shards: SKUShard[] = promiseResult[1]
            const _item = (await user.items.get(Item))[0]
            let skuQuantity: number = 0
            shards.forEach((shard) => {
                skuQuantity += shard.quantity
            })

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
            expect(shopTradeTransaction.quantity).toEqual(5)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
            expect(userTradeTransaction.quantity).toEqual(5)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(5)
            expect(skuQuantity).toEqual(5)
            expect(_sku.isOutOfStock).toEqual(true)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(result.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(result.balanceTransaction!.id, BalanceTransaction).fetch() as BalanceTransaction

            // System Balance Transaction
            expect(systemBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.payment)
            expect(systemBalanceTransaction.currency).toEqual(order.currency)
            expect(systemBalanceTransaction.amount).toEqual(order.amount)
            expect(systemBalanceTransaction.from).toEqual(order.purchasedBy)
            expect(systemBalanceTransaction.to).toEqual(BalanceManager.platform)
            expect(systemBalanceTransaction.transfer).toBeUndefined()
            expect(systemBalanceTransaction.payout).toBeUndefined()
            expect(systemBalanceTransaction.transactionResults[0]['stripe']).toEqual(result.chargeResult)

            // Account Trade Transaction
            expect(accountBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.payment)
            expect(accountBalanceTransaction.currency).toEqual(order.currency)
            expect(accountBalanceTransaction.amount).toEqual(order.amount)
            expect(accountBalanceTransaction.from).toEqual(order.purchasedBy)
            expect(accountBalanceTransaction.to).toEqual(BalanceManager.platform)
            expect(accountBalanceTransaction.transfer).toBeUndefined()
            expect(accountBalanceTransaction.payout).toBeUndefined()
            expect(accountBalanceTransaction.transactionResults[0]['stripe']).toEqual(result.chargeResult)

            {
                const _order = await Order.get(order.id) as Order
                const cancelResult = await manager.orderCancel(_order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>

                const shopTradeTransaction = shop.tradeTransactions.doc(cancelResult.tradeTransactions[0].id, TradeTransaction)
                const userTradeTransaction = user.tradeTransactions.doc(cancelResult.tradeTransactions[0].id, TradeTransaction)
                const _sku = product.skus.doc(sku.id, SKU) as SKU
                const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
                const _item = user.items.doc(itemID, Item) as Item

                const shards: SKUShard[] = await sku.shards.get(SKUShard)
                let skuQuantity: number = 0
                shards.forEach((shard) => {
                    skuQuantity += shard.quantity
                })

                await Promise.all([shopTradeTransaction.fetch(), userTradeTransaction.fetch(), _sku.fetch(), _item.fetch()])

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
                expect(shopTradeTransaction.quantity).toEqual(5)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.id)
                expect(shopTradeTransaction.sku).toEqual(sku.id)

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
                expect(userTradeTransaction.quantity).toEqual(5)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.id)
                expect(userTradeTransaction.sku).toEqual(sku.id)

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(5)
                expect(skuQuantity).toEqual(0)
                expect(_sku.isOutOfStock).toEqual(false)

                // Item
                expect(_item.order).toEqual(order.id)
                expect(_item.selledBy).toEqual(shop.id)
                expect(_item.product).toEqual(product.id)
                expect(_item.sku).toEqual(sku.id)

                const account = new Account(user.id, {})
                const systemBalanceTransaction = await BalanceTransaction.get(cancelResult.balanceTransaction!.id) as BalanceTransaction
                const accountBalanceTransaction = await account.balanceTransactions.doc(cancelResult.balanceTransaction!.id, BalanceTransaction).fetch() as BalanceTransaction

                // System Balance Transaction
                expect(systemBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
                expect(systemBalanceTransaction.currency).toEqual(order.currency)
                expect(systemBalanceTransaction.amount).toEqual(order.amount)
                expect(systemBalanceTransaction.from).toEqual(BalanceManager.platform)
                expect(systemBalanceTransaction.to).toEqual(order.purchasedBy)
                expect(systemBalanceTransaction.transfer).toBeUndefined()
                expect(systemBalanceTransaction.payout).toBeUndefined()
                expect(systemBalanceTransaction.transactionResults[0]['stripe']).toEqual(cancelResult.refundResult)

                // Account Trade Transaction
                expect(accountBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
                expect(accountBalanceTransaction.currency).toEqual(order.currency)
                expect(accountBalanceTransaction.amount).toEqual(order.amount)
                expect(accountBalanceTransaction.from).toEqual(BalanceManager.platform)
                expect(accountBalanceTransaction.to).toEqual(order.purchasedBy)
                expect(accountBalanceTransaction.transfer).toBeUndefined()
                expect(accountBalanceTransaction.payout).toBeUndefined()
                expect(accountBalanceTransaction.transactionResults[0]['stripe']).toEqual(cancelResult.refundResult)
            }

        }, 15000)
    })

    afterAll(async () => {
        await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
