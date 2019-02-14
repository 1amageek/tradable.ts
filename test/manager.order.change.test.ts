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
import { BalanceManager } from '../src/BalanceManager'
import { Payout } from './models/payout';
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
            quantity: 5
        }

        for (let i = 0; i < sku.inventory.quantity!; i++) {
            const shard: InventoryStock = new InventoryStock(`${i}`)
            sku.inventoryStocks.insert(shard)
        }

        await Promise.all([product.save(), sku.save(), shop.save(), user.save()])
    })

    describe("orderChange", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
            manager.delegate = new StripePaymentDelegate()
            manager.tradeDelegate = new TradeDelegate()

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.product = product.reference
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
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.checkout(order.id, paymentOptions) as Tradable.CheckoutResult<TradeTransaction>
            const item = (result.tradeTransactions[0].value() as any)["item"]
            const _order = await Order.get(order.id) as Order
            const changeResult = await manager.checkoutChange(_order, orderItem, item, paymentOptions) as Tradable.CheckoutChangeResult<TradeTransaction>

            const shopTradeTransaction = await shop.tradeTransactions.doc(changeResult.tradeTransactions[0].id, TradeTransaction).fetch() as TradeTransaction
            const userTradeTransaction = await user.tradeTransactions.doc(changeResult.tradeTransactions[0].id, TradeTransaction).fetch() as TradeTransaction
            const _product: Product = new Product(product.id, {})
            const _sku = await new SKU(sku.id, {}).fetch()
            const _item = await user.items.doc(item.id, Item).fetch() as Item
            const inventoryStocksDataSource = _sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).dataSource()
            const promiseResult = await Promise.all([_sku.fetch(), inventoryStocksDataSource.get()])
            const inventoryStocks: InventoryStock[] = promiseResult[1]

            // Shop Trade Transaction
            expect(shopTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(shopTradeTransaction.quantity).toEqual(1)
            expect(shopTradeTransaction.selledBy).toEqual(shop.id)
            expect(shopTradeTransaction.purchasedBy).toEqual(user.id)
            expect(shopTradeTransaction.order).toEqual(order.id)
            expect(shopTradeTransaction.product).toEqual(product.reference)
            expect(shopTradeTransaction.sku).toEqual(sku.id)

            // User Trade Transaction
            expect(userTradeTransaction.type).toEqual(Tradable.TradeTransactionType.orderChange)
            expect(userTradeTransaction.quantity).toEqual(1)
            expect(userTradeTransaction.selledBy).toEqual(shop.id)
            expect(userTradeTransaction.purchasedBy).toEqual(user.id)
            expect(userTradeTransaction.order).toEqual(order.id)
            expect(userTradeTransaction.product).toEqual(product.reference)
            expect(userTradeTransaction.sku).toEqual(sku.id)

            // SKU
            expect(_sku.inventory.type).toEqual(Tradable.StockType.finite)
            expect(_sku.inventory.quantity).toEqual(5)
            expect(inventoryStocks.length).toEqual(5)

            // Item
            expect(_item.order).toEqual(order.id)
            expect(_item.selledBy).toEqual(shop.id)
            expect(_item.product).toEqual(product.reference)
            expect(_item.sku).toEqual(sku.id)

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(changeResult.balanceTransaction!.id) as BalanceTransaction
            const accountBalanceTransaction = await account.balanceTransactions.doc(changeResult.balanceTransaction!.id, BalanceTransaction).fetch() as BalanceTransaction

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

            const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
            manager.delegate = new StripePaymentDelegate()
            manager.tradeDelegate = new TradeDelegate()

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.product = product.reference
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
            await order.save()

            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.checkout(order.id, paymentOptions) as Tradable.CheckoutResult<TradeTransaction>
            const item = (result.tradeTransactions[0].value() as any)["item"]
            const _order = await Order.get(order.id) as Order
            try {
                const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
                const changeResult = await manager.checkoutChange(_order, orderItem, item, paymentOptions) as Tradable.CheckoutChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Status", async () => {

            const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
            manager.delegate = new StripePaymentDelegate()
            manager.tradeDelegate = new TradeDelegate()

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.product = product.reference
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
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.checkout(order.id, paymentOptions) as Tradable.CheckoutResult<TradeTransaction>
            const item = (result.tradeTransactions[0].value() as any)["item"]
            const _order = await Order.get(order.id) as Order
            _order.paymentStatus = Tradable.OrderPaymentStatus.none
            try {
                const changeResult = await manager.checkoutChange(_order, orderItem, item, paymentOptions) as Tradable.CheckoutChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(true)
            }
        }, 15000)

        test("Invalid Stripe refund", async () => {

            const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
            manager.delegate = new StripePaymentDelegate()
            manager.tradeDelegate = new TradeDelegate()

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.product = product.reference
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
            await order.save()


            const paymentOptions: Tradable.PaymentOptions = {
                vendorType: "stripe",
                refundFeeRate: 0
            }
            const result = await manager.checkout(order.id, paymentOptions) as Tradable.CheckoutResult<TradeTransaction>
            const item = (result.tradeTransactions[0].value() as any)["item"]
            const _order = await Order.get(order.id) as Order
            try {
                const manager: Tradable.Manager<InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account> = new Tradable.Manager(InventoryStock, SKU, OrderItem, Order, TradeTransaction, BalanceTransaction, Payout, User, Account)
                manager.delegate = new StripeInvalidPaymentDelegate()
                manager.tradeDelegate = new TradeDelegate()
                const changeResult = await manager.checkoutChange(_order, orderItem, item, paymentOptions) as Tradable.CheckoutChangeResult<TradeTransaction>
                expect(changeResult).toBeUndefined()
            } catch (error) {
                expect(error).not.toBeUndefined()
                expect(error instanceof Tradable.TradableError).toEqual(false)
            }
        }, 15000)
    })

    afterAll(async () => {
        await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
