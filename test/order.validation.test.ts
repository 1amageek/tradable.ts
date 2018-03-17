process.env.NODE_ENV = 'test';

import * as Pring from 'pring'
import * as Tradable from '../src/index'
import * as UUID from 'uuid'
import { options } from './config'
import { User } from './user'
import { Product } from './product'
import { SKU } from './sku'
import { Order } from './order';
import { OrderItem } from './orderItem';

Pring.initialize({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
})

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

        shop.skus.insert(sku)
        shop.products.insert(product)

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
            try {
                order.validate()
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
            try {
                order.validate()
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
            try {
                order.validate()
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
            try {
                order.validate()
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
            try {
                order.validate()
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("items is required", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            try {
                order.validate()
            } catch (error) {
                expect(error).not.toBeNull()
            }
        }, 10000)

        test("success", async () => {
            const order: Order = new Order()
            orderItem.order = order.id
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))            
            order.items.insert(orderItem)
            try {
                order.validate()
            } catch (error) {
                expect(error).toBeNull()
            }
        }, 10000)

    })
})
