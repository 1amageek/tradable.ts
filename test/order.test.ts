process.env.NODE_ENV = 'test';

import * as Pring from 'pring'
import * as Tradable from '../src/index'
import * as UUID from 'uuid'
import * as Config from './config'
import * as Stripe from 'stripe'
import { User } from './user'
import { Product } from './product'
import { SKU } from './sku'
import { Order } from './order'
import { OrderItem } from './orderItem'
import { Balance } from './balance'
import { Account } from './account'
import { StripePaymentDelegate } from './stripePaymentDelegate'

export const stripe = new Stripe(Config.STRIPE_API_KEY)

Pring.initialize({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
})

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

        jpySKU.name = "InfiniteJPYSKU"
        jpySKU.selledBy = shop.id
        jpySKU.createdBy = shop.id
        jpySKU.product = product.id
        jpySKU.price = 500
        jpySKU.currency = Tradable.Currency.JPY
        jpySKU.inventory = {
            type: Tradable.StockType.infinite
        }

        usdSKU.name = "InfiniteUSDSKU"
        usdSKU.selledBy = shop.id
        usdSKU.createdBy = shop.id
        usdSKU.product = product.id
        usdSKU.price = 5
        usdSKU.currency = Tradable.Currency.USD
        usdSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        // shop.skus.insert(sku)
        shop.products.insert(product)
        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Order Test", async () => {
        test("OrderItem contains more than one Currency", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            const jpyOrderItem: OrderItem = new OrderItem()
            jpyOrderItem.order = order.id
            jpyOrderItem.selledBy = shop.id
            jpyOrderItem.buyer = user.id
            jpyOrderItem.sku = jpySKU.id
            jpyOrderItem.amount = jpySKU.price
            jpyOrderItem.currency = jpySKU.currency
            jpyOrderItem.quantity = 1

            const usdOrderItem: OrderItem = new OrderItem()
            usdOrderItem.order = order.id
            usdOrderItem.selledBy = shop.id
            usdOrderItem.buyer = user.id
            usdOrderItem.sku = usdOrderItem.id
            usdOrderItem.amount = usdSKU.price
            usdOrderItem.currency = usdSKU.currency
            usdOrderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(jpyOrderItem)
            order.items.insert(usdOrderItem)
            await order.save()

            try {
                await manager.execute(order, async (order) => {})                
            } catch (error) {
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await jpyOrderItem.delete()
            await usdOrderItem.delete()
        }, 10000)

        test("OrderItem and Order Amount do not match", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            const orderItem0: OrderItem = new OrderItem()
            orderItem0.order = order.id
            orderItem0.selledBy = shop.id
            orderItem0.buyer = user.id
            orderItem0.sku = jpySKU.id
            orderItem0.amount = jpySKU.price
            orderItem0.currency = jpySKU.currency
            orderItem0.quantity = 1

            const orderItem1: OrderItem = new OrderItem()
            orderItem1.order = order.id
            orderItem1.selledBy = shop.id
            orderItem1.buyer = user.id
            orderItem1.sku = jpySKU.id
            orderItem1.amount = jpySKU.price
            orderItem1.currency = jpySKU.currency
            orderItem1.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem0)
            order.items.insert(orderItem1)
            await order.save()

            try {
                await manager.execute(order, async (order) => {})                
            } catch (error) {
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem0.delete()
            await orderItem1.delete()
        }, 10000)

        test("Amount is below the lower limit.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            const orderItem: OrderItem = new OrderItem()
            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = usdSKU.id
            orderItem.amount = usdSKU.price
            orderItem.currency = usdSKU.currency
            orderItem.quantity = 1

            order.amount = usdSKU.price
            order.currency = usdSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()

            try {
                await manager.execute(order, async (order) => {})                
            } catch (error) {
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)
    })

    afterAll(async () => {
        await shop.delete()
        await user.delete()
        await product.delete()
        await jpySKU.delete()
        await usdSKU.delete()
    })
})
