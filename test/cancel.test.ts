process.env.NODE_ENV = 'test';
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

jest.setTimeout(10000)

var key = require("../salada-f825d-firebase-adminsdk-19k25-ded6604978.json")
const app = admin.initializeApp({
    credential: admin.credential.cert(key)
})
Tradable.initialize(app, admin.firestore.FieldValue.serverTimestamp())

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

        sku.title = "InfiniteSKU"
        sku.selledBy = shop.id
        sku.createdBy = shop.id
        sku.product = product.id
        sku.amount = 100
        sku.currency = Tradable.Currency.JPY
        sku.inventory = {
            type: Tradable.StockType.finite,
            quantity: 6
        }

        await product.save()
        await shop.save()
        await user.save()

        orderItem.order = order.id
        orderItem.product = product.id
        orderItem.selledBy = shop.id
        orderItem.buyer = user.id
        orderItem.sku = sku.id
        orderItem.currency = sku.currency
        orderItem.amount = sku.amount
        orderItem.quantity = 1

        order.amount = sku.amount
        order.currency = sku.currency
        order.selledBy = shop.id
        order.buyer = user.id
        order.shippingTo = { address: "address" }
        order.expirationDate = new Date(date.setDate(date.getDate() + 14))
        order.items.insert(orderItem)
        await order.save()
    })

    describe("Cancel Test", async () => {
        test("Stripe's payment success", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const myOrder: Order = await Order.get(order.id, Order)
                await manager.execute(myOrder, async (_order, batch) => {
                    return await manager.order(_order, {
                        customer: Config.STRIPE_CUS_TOKEN,
                        vendorType: 'stripe'
                    }, batch)
                }) 
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }

            // Status
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.paid)

            // PaymentInfomation
            expect(received.paymentInformation['stripe']).not.toBeNull()

            // accountsReceivable
            const account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][order.currency]).toEqual(90)

            const changedSKU: SKU = new SKU(sku.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()

            // unitSales
            expect(changedSKU.unitSales).toEqual(1)
            const inventory: Tradable.Inventory = changedSKU.inventory

            // quantity
            expect(inventory.quantity).toEqual(5)
        }, 15000)

        test("Stripe's cancel success", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const myOrder: Order = await Order.get(order.id, Order)
                await manager.execute(myOrder, async (_order, batch) => {
                    return await manager.cancel(_order, {
                        vendorType: 'stripe'
                    }, batch)
                }) 
            } catch (error) {
                console.log(error)
                expect(error).not.toBeNull()
            }
            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status

            // status
            expect(status).toEqual(Tradable.OrderStatus.canceled)

            // refundInformation
            expect(received.refundInformation['stripe']).not.toBeNull()

            const account: Account = await Account.get(order.selledBy, Account)

            // accountsReceivable
            expect(account.balance['accountsReceivable'][order.currency]).toEqual(0)            

            const changedSKU: SKU = new SKU(sku.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()

            // unitSales
            expect(changedSKU.unitSales).toEqual(0)
            const inventory: Tradable.Inventory = changedSKU.inventory

            // quantity
            expect(inventory.quantity).toEqual(6)

        }, 15000)

        test("Stripe's cancel failure, manager have already cancelled", async () => {
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            manager.delegate = new StripePaymentDelegate()

            try {
                const _order: Order = await Order.get(order.id, Order)
                await manager.execute(_order, async (order) => {
                    return await manager.cancel(order, {
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

            expect(status).toEqual(Tradable.OrderStatus.canceled)
            expect(received.refundInformation['stripe']).not.toBeNull()

            const account = await Account.get(order.selledBy, Account)
            expect(account.balance['accountsReceivable'][order.currency]).toEqual(0)

        }, 15000)
    })

    afterAll(async () => {
        // await account.delete()
        // await shop.delete()
        // await user.delete()
        // await product.delete()
        // await sku.delete()
    })
})
