process.env.NODE_ENV = 'test'
import * as Pring from 'pring-admin'
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
import { BalanceManager } from '../src/BalanceManager'
import { StockManager } from '../src/StockManager'
import { BalanceTransaction } from './models/BalanceTransaction'
import { StripePaymentDelegate } from './stripePaymentDelegate'
import { StripeInvalidPaymentDelegate } from './stripeInvalidPaymentDelegate'
import * as firebase from '@firebase/testing'


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Pring.initialize(app.firestore())
Tradable.initialize(app)

describe("OrderManager", () => {
    /*
    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    beforeAll(async () => {

        const stripeShop: Stripe.accounts.IAccount = await stripe.accounts.create({
            type: 'custom',
            country: 'jp',
            metadata: { id: shop.id }
        })
        const shopAccount: Account = new Account(shop.id)
        shopAccount.country = 'jp'
        shopAccount.accountInformation = { 'stripe': stripeShop.id }
        shopAccount.isRejected = false
        shopAccount.isSigned = false
        shopAccount.balance = { accountsReceivable: {}, available: {} }

        const stripeUser: Stripe.accounts.IAccount = await stripe.accounts.create({
            type: 'custom',
            country: 'jp',
            metadata: { id: shop.id }
        })

        const userAccount: Account = new Account(user.id)
        userAccount.country = 'jp'
        userAccount.accountInformation = { 'stripe': stripeUser.id }
        userAccount.isRejected = false
        userAccount.isSigned = false
        userAccount.balance = { accountsReceivable: {}, available: {} }

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

        await Promise.all([product.save(), shop.save(), user.save(), shopAccount.save(), userAccount.save()])
    })

    describe("transfer", async () => {
        test("Success", async () => {

            const manager: Tradable.Manager<SKU, Product, OrderItem, Order, Item, TradeTransaction, BalanceTransaction, User, Account> = new Tradable.Manager(SKU, Product, OrderItem, Order, Item, TradeTransaction, BalanceTransaction, User, Account)
            manager.delegate = new StripePaymentDelegate()

            const shopAccount = new Account(shop.id, {})
            const userAccount = new Account(user.id, {})

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

    afterAll(async () => {
        await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
    */
})
