process.env.NODE_ENV = 'test'

import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from '../config'
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
import { BalanceTransaction } from './models/BalanceTransaction'
import { StripePaymentDelegate } from './stripePaymentDelegate'
import { StripeInvalidPaymentDelegate } from './stripeInvalidPaymentDelegate'
import * as firebase from '@firebase/testing'
import { TradeDelegate } from './tradeDelegate';


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

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

        await Promise.all([product.save(), shop.save(), user.save()])
    })

    describe("order", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>

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
            expect(_sku.inventory.quantity).toEqual(4)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(result.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(result.balanceTransaction!.id, BalanceTransaction) as BalanceTransaction

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

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 3

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            try {
                const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            } catch (error) {
                expect(error).not.toBeUndefined()
                const _sku = await product.skus.doc(sku.id, SKU) as SKU

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(4)

            }
        }, 15000)

        test("Invalid Order Status", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            order.paymentStatus = Tradable.OrderPaymentStatus.paid
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            try {
                const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            } catch (error) {
                expect(error).not.toBeUndefined()
                const _sku = await product.skus.doc(sku.id, SKU) as SKU

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(4)

            }
        }, 15000)

        test("Invalid Delegate", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)

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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            try {
                const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            } catch (error) {
                expect(error).not.toBeUndefined()
                const _sku = await product.skus.doc(sku.id, SKU) as SKU

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(4)

            }
        }, 15000)

        test("Invalid Stripe charge", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
            manager.delegate = new StripeInvalidPaymentDelegate()
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            order.paymentStatus = Tradable.OrderPaymentStatus.paid
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            try {
                const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            } catch (error) {
                expect(error).not.toBeUndefined()
                const _sku = await product.skus.doc(sku.id, SKU) as SKU

                // SKU
                expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
                expect(_sku.inventory.quantity).toEqual(4)

            }
        }, 15000)
    })

    describe("orderCancel", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>

            const _order = await Order.get(order.id) as Order
            const cancelResult = await manager.orderCancel(_order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>

            const shopTradeTransaction = await shop.tradeTransactions.doc(cancelResult.tradeTransactions[0].id, TradeTransaction) as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(cancelResult.tradeTransactions[0].id, TradeTransaction) as TradeTransaction
            const _sku = await product.skus.doc(sku.id, SKU) as SKU
            const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _item = await user.items.doc(itemID, Item) as Item

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderCancel)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(4)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(cancelResult.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(cancelResult.balanceTransaction!.id, BalanceTransaction) as BalanceTransaction

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

        }, 15000)

        test("Invalid Delegate", async () => {

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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            try {
                const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
                const cancelResult = await manager.orderCancel(order, [orderItem], paymentOptions) as Tradable.OrderCancelResult<TradeTransaction>
                expect(cancelResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Status", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            order.paymentStatus = Tradable.OrderPaymentStatus.none
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            try {
                const cancelResult = await manager.orderCancel(order, [orderItem], paymentOptions) as Tradable.OrderCancelResult<TradeTransaction>
                expect(cancelResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Stripe refund", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
            manager.delegate = new StripeInvalidPaymentDelegate()
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            order.paymentStatus = Tradable.OrderPaymentStatus.paid
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            try {
                const cancelResult = await manager.orderCancel(order, [orderItem], paymentOptions) as Tradable.OrderCancelResult<TradeTransaction>
                expect(cancelResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(false)
            }
        }, 15000)
    })

    describe("orderChange", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _order = await Order.get(order.id) as Order
            const changeResult = await manager.orderChange(_order, orderItem, itemID, paymentOptions) as Tradable.OrderChangeResult<TradeTransaction>

            const shopTradeTransaction = await shop.tradeTransactions.doc(changeResult.tradeTransactions[0].id, TradeTransaction) as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(changeResult.tradeTransactions[0].id, TradeTransaction) as TradeTransaction
            const _sku = await product.skus.doc(sku.id, SKU) as SKU
            
            const _item = await user.items.doc(itemID, Item) as Item

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.id)
            expect(shopTradeTransaction.sku).toEqual(sku.id)

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.id)
            expect(userTradeTransaction.sku).toEqual(sku.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(4)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.id)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(changeResult.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(changeResult.balanceTransaction!.id, BalanceTransaction) as BalanceTransaction

            // System Balance Transaction
            expect(systemBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
            expect(systemBalanceTransaction.currency).toEqual(order.currency)
            expect(systemBalanceTransaction.amount).toEqual(order.amount)
            expect(systemBalanceTransaction.from).toEqual(BalanceManager.platform)
            expect(systemBalanceTransaction.to).toEqual(order.purchasedBy)
            expect(systemBalanceTransaction.transfer).toBeUndefined()
            expect(systemBalanceTransaction.payout).toBeUndefined()
            expect(systemBalanceTransaction.transactionResults[0]['stripe']).toEqual(changeResult.refundResult)

            // Account Trade Transaction
            expect(accountBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
            expect(accountBalanceTransaction.currency).toEqual(order.currency)
            expect(accountBalanceTransaction.amount).toEqual(order.amount)
            expect(accountBalanceTransaction.from).toEqual(BalanceManager.platform)
            expect(accountBalanceTransaction.to).toEqual(order.purchasedBy)
            expect(accountBalanceTransaction.transfer).toBeUndefined()
            expect(accountBalanceTransaction.payout).toBeUndefined()
            expect(accountBalanceTransaction.transactionResults[0]['stripe']).toEqual(changeResult.refundResult)

        }, 15000)

        test("Invalid Delegate", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _order = await Order.get(order.id) as Order
            try {
                const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
                const changeResult = await manager.orderChange(_order, orderItem, itemID, paymentOptions) as Tradable.OrderChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Status", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _order = await Order.get(order.id) as Order
            _order.paymentStatus = Tradable.OrderPaymentStatus.none
            try {
                const changeResult = await manager.orderChange(_order, orderItem, itemID, paymentOptions) as Tradable.OrderChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Stripe refund", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult<TradeTransaction>
            const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _order = await Order.get(order.id) as Order
            try {
                const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
                manager.delegate = new StripeInvalidPaymentDelegate()
                manager.tradeDelegate = new TradeDelegate()
                const changeResult = await manager.orderChange(_order, orderItem, itemID, paymentOptions) as Tradable.OrderChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(false)
            }
        }, 15000)
    })

    /*
    describe("transfer", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, TradeTransaction, BalanceTransaction, User, Account)
            manager.delegate = new StripePaymentDelegate()

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
            orderItem.quantity = 1

            order.amount = sku.amount
            order.currency = sku.currency
            order.selledBy = shop.id
            order.purchasedBy = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }

            const transferOptions: Tradable.TransferOptions = {
                vendorType: "stripe",
                transferRate: 0.5 
            }

            const result = await manager.order(order, [orderItem], paymentOptions) as Tradable.OrderResult
            // const itemID = (result.tradeTransactions[0].value() as any)["items"][0]
            const _order = await Order.get(order.id) as Order
            const transferResult = await manager.transfer(_order, transferOptions) as Tradable.TransferResult

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(transferResult.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(transferResult.balanceTransaction!.id, BalanceTransaction) as BalanceTransaction

            // System Balance Transaction
            expect(systemBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
            expect(systemBalanceTransaction.currency).toEqual(order.currency)
            expect(systemBalanceTransaction.amount).toEqual(order.amount)
            expect(systemBalanceTransaction.from).toEqual(BalanceManager.platform)
            expect(systemBalanceTransaction.to).toEqual(order.purchasedBy)
            expect(systemBalanceTransaction.transfer).toBeUndefined()
            expect(systemBalanceTransaction.payout).toBeUndefined()
            expect(systemBalanceTransaction.transactionResults[0]['stripe']).toEqual(transferResult.transferResult)

            // Account Trade Transaction
            expect(accountBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.paymentRefund)
            expect(accountBalanceTransaction.currency).toEqual(order.currency)
            expect(accountBalanceTransaction.amount).toEqual(order.amount)
            expect(accountBalanceTransaction.from).toEqual(BalanceManager.platform)
            expect(accountBalanceTransaction.to).toEqual(order.purchasedBy)
            expect(accountBalanceTransaction.transfer).toBeUndefined()
            expect(accountBalanceTransaction.payout).toBeUndefined()
            expect(accountBalanceTransaction.transactionResults[0]['stripe']).toEqual(transferResult.transferResult)

        }, 15000)
    })
    */

    afterAll(async () => {
        await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
