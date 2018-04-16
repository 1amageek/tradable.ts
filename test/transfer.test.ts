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
import { onRequest } from 'firebase-functions/lib/providers/https';

export const stripe = new Stripe(Config.STRIPE_API_KEY)

Tradable.initialize(admin.initializeApp({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
}))

describe("Tradable", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const jpySKU: SKU = new SKU()
    const usdSKU: SKU = new SKU()
    const failureSKU: SKU = new SKU()
    const account: Account = new Account(shop.id, {})
    const targetOrder: Order = new Order()

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

        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Transfer Test", async () => {
        test("Transfer changes after payment is successful", async () => {
            const order: Order = targetOrder
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

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
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(jpySKU.price * (1 - 0.1))

        }, 15000)

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
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(jpySKU.price * (1 - 0.1) * 2)

            await order.delete()
            await orderItem.delete()
        }, 15000)

        // test("Transfer succeeds after payment usd", async () => {
        //     const order: Order = new Order()
        //     const date: Date = new Date()
        //     const orderItem: OrderItem = new OrderItem()
        //     const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

        //     manager.delegate = new StripePaymentDelegate()

        //     orderItem.order = order.id
        //     orderItem.selledBy = shop.id
        //     orderItem.buyer = user.id
        //     orderItem.sku = usdSKU.id
        //     orderItem.currency = usdSKU.currency
        //     orderItem.amount = usdSKU.price
        //     orderItem.quantity = 1

        //     order.amount = usdSKU.price
        //     order.currency = usdSKU.currency
        //     order.selledBy = shop.id
        //     order.buyer = user.id
        //     order.shippingTo = { address: "address" }
        //     order.expirationDate = new Date(date.setDate(date.getDate() + 14))
        //     order.items.insert(orderItem)
        //     await order.save()
        //     order.status = Tradable.OrderStatus.received
        //     try {
        //         await manager.execute(order, async (order) => {
        //             return await manager.transfer(order, {
        //                 vendorType: 'stripe'
        //             })
        //         })                
        //     } catch (error) {
        //         console.log(error)
        //         expect(error).not.toBeNull()
        //     }

        //     const received: Order = await Order.get(order.id, Order)
        //     const status: Tradable.OrderStatus = received.status
        //     expect(status).toEqual(Tradable.OrderStatus.completed)
        //     expect(received.paymentInformation['stripe']).not.toBeNull()
        //     expect(received.transferInformation['stripe']).not.toBeNull()
        //     const account: Account = await Account.get(order.selledBy, Account)
        //     expect(account.balance['accountsReceivable'][Tradable.Currency.USD]).toEqual(usdSKU.price * (1 - 0.1))

        //     await order.delete()
        //     await orderItem.delete()
        // }, 10000)

        test("Transfer succeeds after payment jpy", async () => {
            const order: Order = await Order.get(targetOrder.id, Order)
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                await manager.execute(order, async (order) => {
                    return await manager.transfer(order, {
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                console.error(error)
                expect(error).not.toBeNull()
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.transferd)
            expect(received.paymentInformation['stripe']).not.toBeNull()
            expect(received.transferInformation['stripe']).not.toBeNull()
            const account: Account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][Tradable.Currency.JPY]).toEqual(order.net)
            expect(account.balance['available'][Tradable.Currency.JPY]).toEqual(order.net)
            expect(received.transferredTo).not.toBeNull()

            for (const id in received.transferredTo) {
                const transaction: Transaction = await account.transactions.doc(id, Transaction)
                expect(transaction.order).toEqual(received.id)
                expect(transaction.amount).toEqual(received.amount)
                expect(transaction.fee).toEqual(received.fee)
                expect(transaction.net).toEqual(received.net)
                expect(transaction.currency).toEqual(received.currency)
                expect(transaction.type).toEqual(Tradable.TransactionType.transfer)
                expect(transaction.information['stripe']).not.toBeNull()            
            }

            await order.delete()
        }, 15000)
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
