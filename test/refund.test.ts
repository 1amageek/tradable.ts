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
    const order: Order = new Order()
    const date: Date = new Date()
    const orderItem: OrderItem = new OrderItem()

    beforeAll(async () => {

        const stripeAccount: Stripe.accounts.IAccount = await stripe.accounts.create({
            type: 'custom',
            country: 'jp',
            metadata: { id: shop.id }
        })
        const account: Account = new Account(shop.id)
        account.commissionRatio = 0.1
        account.country = 'jp'
        account.fundInformation = { 'stripe': stripeAccount.id }
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
        sku.currency = Tradable.Currency.JPY
        sku.inventory = {
            type: Tradable.StockType.infinite
        }

        await product.save()
        await shop.save()
        await user.save()

        orderItem.order = order.id
        orderItem.selledBy = shop.id
        orderItem.buyer = user.id
        orderItem.sku = sku.id
        orderItem.currency = sku.currency
        orderItem.amount = sku.price
        orderItem.quantity = 1

        order.amount = sku.price
        order.currency = sku.currency
        order.selledBy = shop.id
        order.buyer = user.id
        order.shippingTo = { address: "address" }
        order.expirationDate = new Date(date.setDate(date.getDate() + 14))
        order.items.insert(orderItem)
        await order.save()
    })

    describe("Refund Test", async () => {
        test("Stripe's payment success", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const _order: Order = await Order.get(order.id, Order)

                order.status = Tradable.OrderStatus.received
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
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)
        }, 15000)

        test("Stripe's Refund success", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const _order: Order = await Order.get(order.id, Order)
                console.log(_order.value())
                await manager.execute(_order, async (order) => {
                    return await manager.refund(order, {
                        vendorType: 'stripe'
                    })
                })
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status

            expect(status).toEqual(Tradable.OrderStatus.refunded)
            expect(received.refundInformation['stripe']).not.toBeNull()

            const account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][order.currency]).toEqual(90)

        }, 15000)

        test("Stripe's Refund failure, manager have already refunded", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const _order: Order = await Order.get(order.id, Order)
                await manager.execute(_order, async (order) => {
                    return await manager.refund(order, {
                        vendorType: 'stripe',
                        reason: Tradable.RefundReason.requestedByCustomer
                    })
                })
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status

            expect(status).toEqual(Tradable.OrderStatus.refunded)
            expect(received.refundInformation['stripe']).not.toBeNull()

            const account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][order.currency]).toEqual(90)

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
