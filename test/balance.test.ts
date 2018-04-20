process.env.NODE_ENV = 'test'
import * as admin from 'firebase-admin'
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

Tradable.initialize(admin.initializeApp({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
}), admin.firestore.FieldValue.serverTimestamp())

describe("Tradable", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const jpySKU: SKU = new SKU()
    const usdSKU: SKU = new SKU()
    const failureSKU: SKU = new SKU()
    const account: Account = new Account(shop.id, {})

    beforeAll(async () => {

        const account: Account = new Account(shop.id)
        account.commissionRatio = 0.1
        account.country = 'jp'
        account.isRejected = false
        account.isSigned = false
        account.balance = { accountsReceivable: {}, available: {} }
        await account.save()

        product.skus.insert(jpySKU)
        product.skus.insert(usdSKU)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        jpySKU.title = "InfiniteJPYSKU"
        jpySKU.selledBy = shop.id
        jpySKU.createdBy = shop.id
        jpySKU.product = product.id
        jpySKU.amount = 500
        jpySKU.currency = Tradable.Currency.JPY
        jpySKU.inventory = {
            type: Tradable.StockType.infinite
        }

        usdSKU.title = "InfiniteUSDSKU"
        usdSKU.selledBy = shop.id
        usdSKU.createdBy = shop.id
        usdSKU.product = product.id
        usdSKU.amount = 50
        usdSKU.currency = Tradable.Currency.USD
        usdSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        failureSKU.title = "InfiniteFailSKU"
        failureSKU.selledBy = shop.id
        failureSKU.createdBy = shop.id
        failureSKU.product = product.id
        failureSKU.amount = 1
        failureSKU.currency = Tradable.Currency.USD
        failureSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Balance Test", async () => {
        test("Balance changes after payment is successful", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.currency = jpySKU.currency
            orderItem.amount = jpySKU.amount
            orderItem.quantity = 1

            order.amount = jpySKU.amount
            order.currency = jpySKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.execute(order, async (order, batch) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    }, batch)
                })                 
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(jpySKU.amount * (1 - 0.1))
            
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Added to Balance after payment is successful", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = jpySKU.id
            orderItem.currency = jpySKU.currency
            orderItem.amount = jpySKU.amount
            orderItem.quantity = 1

            order.amount = jpySKU.amount
            order.currency = jpySKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.execute(order, async (order, batch) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    }, batch)
                })                
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(jpySKU.amount * (1 - 0.1) * 2)
            
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Balance changes after payment is successful when USD", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = usdSKU.id
            orderItem.currency = usdSKU.currency
            orderItem.amount = usdSKU.amount
            orderItem.quantity = 1

            order.amount = usdSKU.amount
            order.currency = usdSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.execute(order, async (order, batch) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    }, batch)
                })                
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][Tradable.Currency.USD]).toEqual(usdSKU.amount * (1 - 0.1))
            
            await order.delete()
            await orderItem.delete()
        }, 10000)

        test("Balance will not be changed when payment fails", async () => {
            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            manager.delegate = new StripePaymentDelegate()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = failureSKU.id
            orderItem.currency = failureSKU.currency
            orderItem.amount = failureSKU.amount
            orderItem.quantity = 1

            order.amount = failureSKU.amount
            order.currency = failureSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            order.status = Tradable.OrderStatus.received
            try {
                await manager.execute(order, async (order, batch) => {
                    return await manager.pay(order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    }, batch)
                })                
            } catch (error) {
                expect(error).not.toBeNull()
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)
            expect(received.paymentInformation).toBeUndefined()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][Tradable.Currency.USD]).toEqual(usdSKU.amount * (1 - 0.1))
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(jpySKU.amount * 2 * (1 - 0.1))
            
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
        await account.delete()
    })
})
