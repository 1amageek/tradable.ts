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
import { Transaction } from './transaction'
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
    const sku: SKU = new SKU()
    const account: Account = new Account(shop.id, {})

    beforeAll(async () => {

        const account: Account = new Account(shop.id)
        account.commissionRatio = 0.1
        account.country = 'jp'
        account.isRejected = false
        account.isSigned = false
        account.balance = { accountsReceivable: {}, available: {} }
        await account.save()

        product.skus.insert(sku)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        sku.name = "InfiniteSKU"
        sku.selledBy = shop.id
        sku.createdBy = shop.id
        sku.product = product.id
        sku.price = 100
        sku.inventory = {
            type: Tradable.StockType.infinite
        }

        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Payment status Test", async () => {
        test("Stripe Payment success, when OrderStatus received", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
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
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment success, when OrderStatus waitingForPayment", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.waitingForPayment
            await order.save()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment failure, when OrderStatus created", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()

            order.status = Tradable.OrderStatus.created

            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }
            
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.created)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment failure, when OrderStatus rejected", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()

            order.status = Tradable.OrderStatus.rejected
            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.created)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment failure, when OrderStatus paid", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
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
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment failure, when OrderStatus waitingForRefund", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.waitingForRefund
            await order.save()
        
            try {
                await manager.execute(order, async (order) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.waitingForRefund)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 15000)

        test("Stripe Payment failure, when OrderStatus refunded", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.refunded
            await order.save()
            
            try {
                await manager.execute(order, async (order) => {
                    await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.refunded)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Stripe Payment failure, when OrderStatus canceled", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.currency = sku.currency
            orderItem.amount = sku.price
            orderItem.quantity = 1

            order.amount = sku.price
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.canceled
            await order.save()
            
            try {
                await manager.execute(order, async (order) => {
                    await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                expect(error).not.toBeNull()
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.canceled)
            expect(received.paymentInformation).toBeUndefined()
            await order.delete()
            await orderItem.delete()
        }, 10000)
    })

    afterAll(async () => {
        await shop.delete()
        await user.delete()
        await product.delete()
        await sku.delete()
        await account.delete()
    })
})
