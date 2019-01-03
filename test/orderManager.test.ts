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
import { OrderManager } from '../src/orderManager'
import { BalanceTransaction } from './models/BalanceTransaction'


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})

Pring.initialize(app.firestore())
Tradable.initialize(app)

describe("OrderManager", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    const orderManager: OrderManager<Order, OrderItem, User, TradeTransaction> = new OrderManager(User)

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
            quantity: 1
        }
        sku.numberOfShards = 1
        product.SKUs.insert(sku)
        for (let i = 0; i < 1; i++) {
            const shard: SKUShard = new SKUShard(`${i}`)
            sku.shards.insert(shard)
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
    })

    describe("update", async () => {
        test("Success", async () => {
            const result = await Pring.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    orderManager.update(order, [orderItem], {}, transaction)
                    resolve()
                })
            }) as BalanceTransaction

            const userOrder = await user.orders.doc(order.id, Order).fetch() as Order
            const shopOrder = await shop.receivedOrders.doc(order.id, Order).fetch() as Order

            expect(userOrder.parentID).toEqual(order.parentID)
            expect(userOrder.purchasedBy).toEqual(order.purchasedBy)
            expect(userOrder.selledBy).toEqual(order.selledBy)
            expect(userOrder.shippingTo).toEqual(order.shippingTo)
            expect(userOrder.transferredTo).toEqual(order.transferredTo)
            expect(userOrder.paidAt).toEqual(order.paidAt)
            expect(userOrder.expirationDate).toEqual(order.expirationDate)
            expect(userOrder.currency).toEqual(order.currency)
            expect(userOrder.amount).toEqual(order.amount)
            expect(userOrder.paymentStatus).toEqual(order.paymentStatus)
            expect(userOrder.transferStatus).toEqual(order.transferStatus)
            expect(userOrder.transactionResults).toEqual(order.transactionResults)

            expect(shopOrder.parentID).toEqual(order.parentID)
            expect(shopOrder.purchasedBy).toEqual(order.purchasedBy)
            expect(shopOrder.selledBy).toEqual(order.selledBy)
            expect(shopOrder.shippingTo).toEqual(order.shippingTo)
            expect(shopOrder.transferredTo).toEqual(order.transferredTo)
            expect(shopOrder.paidAt).toEqual(order.paidAt)
            expect(shopOrder.expirationDate).toEqual(order.expirationDate)
            expect(shopOrder.currency).toEqual(order.currency)
            expect(shopOrder.amount).toEqual(order.amount)
            expect(shopOrder.paymentStatus).toEqual(order.paymentStatus)
            expect(shopOrder.transferStatus).toEqual(order.transferStatus)
            expect(shopOrder.transactionResults).toEqual(order.transactionResults)

        }, 15000)
    })

    afterAll(async () => {
        await Promise.all([account.delete(), shop.delete(), user.delete(), product.delete(), sku.delete()])
    })
})
