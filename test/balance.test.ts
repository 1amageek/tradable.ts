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
    const failureSKU: SKU = new SKU()

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
        usdSKU.price = 50
        usdSKU.currency = Tradable.Currency.USD
        usdSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        failureSKU.name = "InfiniteFailSKU"
        failureSKU.selledBy = shop.id
        failureSKU.createdBy = shop.id
        failureSKU.product = product.id
        failureSKU.price = 1
        failureSKU.currency = Tradable.Currency.USD
        failureSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        // shop.skus.insert(sku)
        shop.products.insert(product)
        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Balance Test", async () => {
        test("Balance changes after payment is successful", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.currency = jpySKU.currency
            orderItem.amount = jpySKU.price
            orderItem.quantity = 1

            order.amount = jpySKU.price
            order.currency = jpySKU.currency
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
                console.log(error)
                expect(error).not.toBeNull()
            }
            await order.update()
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance[Tradable.Currency.JPY]).toEqual(jpySKU.price)
            
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Balance changes after payment is successful", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = usdSKU.id
            orderItem.currency = usdSKU.currency
            orderItem.amount = usdSKU.price
            orderItem.quantity = 1

            order.amount = usdSKU.price
            order.currency = usdSKU.currency
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
                console.log(error)
                expect(error).not.toBeNull()
            }
            await order.update()
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance[Tradable.Currency.USD]).toEqual(usdSKU.price)
            
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Balance will not be changed when payment fails", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = failureSKU.id
            orderItem.currency = failureSKU.currency
            orderItem.amount = failureSKU.price
            orderItem.quantity = 1

            order.amount = failureSKU.price
            order.currency = failureSKU.currency
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
                expect(error).not.toBeNull()
            }
            await order.update()
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)
            expect(received.paymentInformation).toBeUndefined()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance[Tradable.Currency.USD]).toEqual(usdSKU.price)
            expect(account.balance[Tradable.Currency.JPY]).toEqual(jpySKU.price)
            
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