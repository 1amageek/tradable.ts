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

    describe("Payment Test", async () => {
        test("Stripe Payment use customer success, when set customer", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                // console.log(error)
                expect(error).not.toBeNull()
            }
            await order.update()
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment use customer failure, customer and source are not set", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.received
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment use customer failure, stripe error", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.received
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: "cus_xxxxxxxxxx",
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.waitingForPayment)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment use customer failure, when Order is not a payable status.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                // console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.created)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment use customer failure, when Order already paid.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.paid
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                // console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment failure, when OrderItem contains more than one Currency.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            const jpyOrderItem: OrderItem = new OrderItem()
            jpyOrderItem.order = order.id
            jpyOrderItem.selledBy = shop.id
            jpyOrderItem.buyer = user.id
            jpyOrderItem.sku = jpySKU.id
            jpyOrderItem.quantity = 1

            const usdOrderItem: OrderItem = new OrderItem()
            usdOrderItem.order = order.id
            usdOrderItem.selledBy = shop.id
            usdOrderItem.buyer = user.id
            usdOrderItem.sku = usdOrderItem.id
            usdOrderItem.quantity = 1

            order.amount = 100
            order.currency = Tradable.Currency.JPY
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(jpyOrderItem)
            order.items.insert(usdOrderItem)
            order.status = Tradable.OrderStatus.paid
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        vendorType: 'stripe'
                    })
                })                
            } catch (error) {
                // console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await jpyOrderItem.delete()
            await usdOrderItem.delete()
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
