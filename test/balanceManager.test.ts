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
import { Account } from './models/account'
import { BalanceManager } from '../src/balanceManager';
import { BalanceTransaction } from './models/BalanceTransaction';


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Tradable.initialize(app, admin.firestore.FieldValue.serverTimestamp())

describe("BalanceManager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    const balanceManager: BalanceManager<BalanceTransaction, Account> = new BalanceManager(BalanceTransaction, Account)

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
    })

    describe("payment", async () => {
        test("Success", async () => {
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const result = await balanceManager.payment(user.id, order.id, order.currency, order.amount, {"result": "result"}, transaction)
                    resolve(result)
                })
            }) as BalanceTransaction

            const account = new Account(user.id, {})
            const systemBalanceTransaction = await BalanceTransaction.get(result.id) as BalanceTransaction
            const accountBalanceTransaction = (await account.balanceTransactions.get(BalanceTransaction))[0]

            // System Balance Transaction
            expect(systemBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.payment)
            expect(systemBalanceTransaction.currency).toEqual(order.currency)
            expect(systemBalanceTransaction.amount).toEqual(order.amount)
            expect(systemBalanceTransaction.from).toEqual(order.purchasedBy)
            expect(systemBalanceTransaction.to).toEqual(BalanceManager.platform)
            expect(systemBalanceTransaction.transfer).toBeUndefined()
            expect(systemBalanceTransaction.payout).toBeUndefined()
            expect(systemBalanceTransaction.transactionResults[0]).toEqual({"result": "result"})


            // Account Trade Transaction
            expect(accountBalanceTransaction.type).toEqual(Tradable.BalanceTransactionType.payment)
            expect(accountBalanceTransaction.currency).toEqual(order.currency)
            expect(accountBalanceTransaction.amount).toEqual(order.amount)
            expect(accountBalanceTransaction.from).toEqual(order.purchasedBy)
            expect(accountBalanceTransaction.to).toEqual(BalanceManager.platform)
            expect(accountBalanceTransaction.transfer).toBeUndefined()
            expect(accountBalanceTransaction.payout).toBeUndefined()
            expect(accountBalanceTransaction.transactionResults[0]).toEqual({"result": "result"})

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
