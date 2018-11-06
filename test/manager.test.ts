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
import { BalanceManager } from '../src/balanceManager'
import { StockManager } from '../src/stockManager'
import { BalanceTransaction } from './models/BalanceTransaction'
import { StripePaymentDelegate } from './stripePaymentDelegate'
import * as firebase from '@firebase/testing'


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Tradable.initialize(app, admin.firestore.FieldValue.serverTimestamp())

describe("Manager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    const manager: Tradable.Manager<SKU, Product, OrderItem, Order, Item, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, Item, TradeTransaction, BalanceTransaction, User, Account)

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

        await product.save()
        await shop.save()
        await user.save()

        orderItem.product = product.id
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
        await order.save()

        manager.delegate = new StripePaymentDelegate()

    })

    describe("Order", async () => {
        test("Success", async () => {

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.PaymentResult

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

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(0)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(result.balanceTransaction.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(result.balanceTransaction.id, BalanceTransaction) as BalanceTransaction

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

        }, 15000)

        test("Out of stock", async () => {

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            try {
                const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.PaymentResult
            } catch (error) {
                expect(error).not.toBeUndefined()
                const shopTradeTransaction = (await shop.tradeTransactions.get(TradeTransaction))[0]
                const userTradeTransaction = (await user.tradeTransactions.get(TradeTransaction))[0]
                const _sku = await product.skus.doc(sku.id, SKU) as SKU

                // Shop Trade Transaction
                expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(shopTradeTransaction.quantity).toEqual(1)
                expect(shopTradeTransaction.selledBy).toEqual(shop.id)
                expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
                expect(shopTradeTransaction.order).toEqual(order.id)
                expect(shopTradeTransaction.product).toEqual(product.id)
                expect(shopTradeTransaction.sku).toEqual(sku.id)

                // User Trade Transaction
                expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.order)
                expect(userTradeTransaction.quantity).toEqual(1)
                expect(userTradeTransaction.selledBy).toEqual(shop.id)
                expect(userTradeTransaction.purchasedBy).toEqual(user.id)
                expect(userTradeTransaction.order).toEqual(order.id)
                expect(userTradeTransaction.product).toEqual(product.id)
                expect(userTradeTransaction.sku).toEqual(sku.id)

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(0)

            }
        }, 15000)

    })

    afterAll(async () => {
        await account.delete()
        await shop.delete()
        await user.delete()
        await product.delete()
        await sku.delete()
    })
})
