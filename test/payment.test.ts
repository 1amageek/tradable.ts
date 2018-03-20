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


    beforeAll(async () => {

        product.skus.insert(sku)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        sku.name = "InfiniteSKU"
        sku.selledBy = shop.id
        sku.createdBy = shop.id
        sku.product = product.id
        sku.inventory = {
            type: Tradable.StockType.infinite
        }

        shop.skus.insert(sku)
        shop.products.insert(product)

        await shop.save()
        await user.save()
    })

    describe("Payment Test", async () => {
        test("Stripe Payment use customer success, when set customer", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.quantity = 1
    
            order.amount = 100
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
    
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.payment(order, {
                    customer: Config.STRIPE_CUS_TOKEN,
                    vendorType: 'stripe'
                })
            } catch (error) {
                console.log(error)
            }
            await order.update()
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            await order.delete()
            await orderItem.delete()
        }, 10000)

        // test("Stripe Payment use customer success, when set source", async () => {
        //     const order: Order = new Order()
        //     const date: Date = new Date()
        //     const orderItem: OrderItem = new OrderItem()
        //     const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            
        //     manager.delegate = new StripePaymentDelegate()

        //     orderItem.order = order.id
        //     orderItem.selledBy = shop.id
        //     orderItem.buyer = user.id
        //     orderItem.sku = sku.id
        //     orderItem.quantity = 1
    
        //     order.amount = 100
        //     order.selledBy = shop.id
        //     order.buyer = user.id
        //     order.shippingTo = { address: "address" }
        //     order.expirationDate = new Date(date.setDate(date.getDate() + 14))
        //     order.items.insert(orderItem)
    
        //     await order.save()
        //     order.status = Tradable.OrderStatus.received
        //     try {
        //         await manager.payment(order, {
        //             source: Config.STRIPE_CORD_TOKEN,
        //             vendorType: 'stripe'
        //         })
        //     } catch (error) {
        //         console.log(error)
        //     }
        //     await order.update()
        //     const received: Order = await Order.get(order.id, Order)
        //     const status: Tradable.OrderStatus = received.status
        //     expect(status).toEqual(Tradable.OrderStatus.waitingForPayment)
        //     expect(received.paymentInformation['stripe']).not.toBeNull()
        //     await order.delete()
        //     await orderItem.delete()
        // }, 10000)

        test("Stripe Payment use customer failure, customer and source are not set", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            
            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.quantity = 1
    
            order.amount = 100
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.received
            await order.save()
            
            try {
                await manager.payment(order, {
                    vendorType: 'stripe'
                })
            } catch (error) {
                // console.log(error)
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)
            expect(received.paymentInformation).toBeUndefined()  
            await order.delete()
            await orderItem.delete()       
        }, 10000)

        test("Stripe Payment use customer failure, when Order is not a payable status.", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            
            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = sku.id
            orderItem.quantity = 1
    
            order.amount = 100
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.status = Tradable.OrderStatus.received
            await order.save()

            try {
                order.status = Tradable.OrderStatus.created
                await manager.payment(order, {
                    vendorType: 'stripe'
                })
            } catch (error) {
                // console.log(error)
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)   
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
    })
})
