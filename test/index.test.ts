process.env.NODE_ENV = 'test';

import * as Pring from 'pring'
import * as Tradable from '../src/index'
import * as UUID from 'uuid'
import { options } from './config'
import { User } from './user'
import { Product } from './product'
import { SKU } from './sku'
import { Order } from './order'
import { OrderItem } from './orderItem'

Pring.initialize({
    projectId: 'salada-f825d',
    keyFilename: './salada-f825d-firebase-adminsdk-19k25-ded6604978.json'
})

describe("Tradable", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const finiteSKU: SKU = new SKU()
    const finiteSKUFailure: SKU = new SKU()
    const infiniteSKU: SKU = new SKU()
    const inStockSKU: SKU = new SKU()
    const limitedSKU: SKU = new SKU()
    const outOfStockSKU: SKU = new SKU()

    beforeAll(async () => {

        product.skus.insert(finiteSKU)
        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        finiteSKU.name = "FiniteSKU"
        finiteSKU.selledBy = shop.id
        finiteSKU.createdBy = shop.id
        finiteSKU.product = product.id

        finiteSKUFailure.name = "FiniteSKU failure"
        finiteSKUFailure.selledBy = shop.id
        finiteSKUFailure.createdBy = shop.id
        finiteSKUFailure.product = product.id

        infiniteSKU.name = "InfiniteSKU"
        infiniteSKU.selledBy = shop.id
        infiniteSKU.createdBy = shop.id
        infiniteSKU.product = product.id
        infiniteSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        inStockSKU.name = "InStockSKU"
        inStockSKU.selledBy = shop.id
        inStockSKU.createdBy = shop.id
        inStockSKU.product = product.id
        inStockSKU.inventory = {
            type: Tradable.StockType.bucket,
            value: Tradable.StockValue.inStock
        }

        limitedSKU.name = "LimitedSKU"
        limitedSKU.selledBy = shop.id
        limitedSKU.createdBy = shop.id
        limitedSKU.product = product.id
        limitedSKU.inventory = {
            type: Tradable.StockType.bucket,
            value: Tradable.StockValue.limited
        }

        outOfStockSKU.name = "OutOfStockSKU"
        outOfStockSKU.selledBy = shop.id
        outOfStockSKU.createdBy = shop.id
        outOfStockSKU.product = product.id
        outOfStockSKU.inventory = {
            type: Tradable.StockType.bucket,
            value: Tradable.StockValue.outOfStock
        }

        shop.skus.insert(finiteSKU)
        shop.skus.insert(finiteSKUFailure)
        shop.skus.insert(infiniteSKU)
        shop.skus.insert(inStockSKU)
        shop.skus.insert(limitedSKU)
        shop.skus.insert(outOfStockSKU)
        shop.products.insert(product)

        await shop.save()
        await user.save()
    })

    describe("Manager", async () => {

        test("Inventory finite quantity success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = finiteSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = await SKU.get(finiteSKU.id, SKU)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.quantity).toEqual(0)

        }, 10000)

        test("Inventory finite quantity failure", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = finiteSKUFailure.id
            orderItem.quantity = 2

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)

            const changedSKU: SKU = await SKU.get(finiteSKUFailure.id, SKU)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.quantity).toEqual(1)

        }, 10000)
        
        test("Inventory Infinite stock success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = infiniteSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = await SKU.get(infiniteSKU.id, SKU)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.type).toEqual(Tradable.StockType.infinite)

        }, 10000)

        test("Inventory InStock success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = inStockSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            console.log(status)
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = await SKU.get(inStockSKU.id, SKU)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.type).toEqual(Tradable.StockType.bucket)
            expect(inventory.value).toEqual(Tradable.StockValue.inStock)

        }, 10000)

        test("Inventory Limited success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = limitedSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            try {
                await order.save()
            } catch (error) {
                console.log(error)
            }
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = await SKU.get(limitedSKU.id, SKU)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.type).toEqual(Tradable.StockType.bucket)
            expect(inventory.value).toEqual(Tradable.StockValue.limited)

        }, 10000)

        test("Inventory outOfStock failure", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.sku = outOfStockSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
            try {
                await manager.execute(order)
            } catch (error) {
                console.error(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)

            const changedSKU: SKU = await SKU.get(outOfStockSKU.id, SKU)
            console.log(changedSKU.inventory)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.type).toEqual(Tradable.StockType.bucket)
            expect(inventory.value).toEqual(Tradable.StockValue.outOfStock)

        }, 10000)
        
    })
})
