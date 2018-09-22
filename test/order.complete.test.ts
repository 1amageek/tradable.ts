process.env.NODE_ENV = 'test';
import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from './config'
import * as Stripe from 'stripe'
import { User } from './models/user'
import { Product } from './models/product'
import { SKU } from './models/sku'
import { Order } from './models/order'
import { OrderItem } from './models/orderItem'
import { Transaction } from './models/transaction'
import { Account } from './models/account'
import { StripePaymentDelegate } from './stripePaymentDelegate'

export const stripe = new Stripe(Config.STRIPE_API_KEY)

var key = require("../salada-f825d-firebase-adminsdk-19k25-ded6604978.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})
Tradable.initialize(app, admin.firestore.FieldValue.serverTimestamp())

describe("Tradable", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const jpySKU: SKU = new SKU()
    const usdSKU: SKU = new SKU()


    beforeAll(async () => {

        product.skus.insert(jpySKU)
        product.skus.insert(usdSKU)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        jpySKU.title = "InfiniteJPYSKU"
        jpySKU.selledBy = shop.id
        jpySKU.createdBy = shop.id
        jpySKU.product = product.id
        jpySKU.amount = 0
        jpySKU.currency = Tradable.Currency.JPY
        jpySKU.inventory = {
            type: Tradable.StockType.infinite
        }

        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Order Complete Test", async () => {
        test("Free Order is completed.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            const jpyOrderItem: OrderItem = new OrderItem()
            jpyOrderItem.order = order.id
            jpyOrderItem.selledBy = shop.id
            jpyOrderItem.buyer = user.id
            jpyOrderItem.sku = jpySKU.id
            jpyOrderItem.amount = jpySKU.amount
            jpyOrderItem.currency = jpySKU.currency
            jpyOrderItem.quantity = 1

            order.amount = 0
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(jpyOrderItem)
            await order.save()

            try {
                await manager.execute(order, async (order, batch) => {
                    return await manager.complete(order, batch)
                })                
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.completed)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await jpyOrderItem.delete()
        }, 15000)
    })

    afterAll(async () => {
        await shop.delete()
        await user.delete()
        await product.delete()
        await jpySKU.delete()
        await usdSKU.delete()
    })
})
