process.env.NODE_ENV = 'test'
import * as admin from 'firebase-admin'
import * as Pring from 'pring'
import * as Tradable from '../src/index'
import * as UUID from 'uuid'
import { User } from './user'
import { Product } from './product'
import { SKU } from './sku'
import { Order } from './order'
import { OrderItem } from './orderItem'
import { Transaction } from './transaction'
import { Account } from './account'

Tradable.initialize(admin.initializeApp({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
}), admin.firestore.FieldValue.serverTimestamp())

describe("Order validation test", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const sku: SKU = new SKU()

    beforeAll(async () => {

        product.skus.insert(sku)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        await product.save()
        await shop.save()
        await user.save()
    })

    describe("Order properties", async () => {

        const date: Date = new Date()
        const orderItem: OrderItem = new OrderItem()

        orderItem.selledBy = shop.id
        orderItem.buyer = user.id
        orderItem.sku = sku.id
        orderItem.quantity = 1

        test("buyer is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = null
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            try {
                await manager.execute(order, async (order) => {})
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("selledBy is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = null
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            try {
                await manager.execute(order, async (order) => {})
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("expirationDate is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = null
            order.items.insert(orderItem)
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            try {
                await manager.execute(order, async (order) => {})
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("currency is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.currency = null
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            try {
                await manager.execute(order, async (order) => {})
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("amount is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            order.amount = null
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)

            try {
                await manager.execute(order, async (order) => {})
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)
    })
})
