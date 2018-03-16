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

describe("Tradable", () => {

    const shop: User = new User()
    const user: User = new User()
    const product: Product = new Product()
    const finiteSKU: SKU = new SKU()
    const finiteSKUFailure: SKU = new SKU()
    const infiniteSKU: SKU = new SKU()

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
            type: Tradable.StockType.infinite,
            value: Tradable.StockValue.inStock
        }

        shop.skus.insert(finiteSKU)
        shop.skus.insert(finiteSKUFailure)
        shop.skus.insert(infiniteSKU)
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

                const received: Order = await Order.get(order.id, Order)
                const status: Tradable.OrderStatus = received.status
                expect(status).toEqual(Tradable.OrderStatus.received)

                const changedSKU: SKU = await SKU.get(finiteSKU.id, SKU)
                const inventory: Tradable.Inventory = changedSKU.inventory
                expect(inventory.quantity).toEqual(0)

            } catch (error) {
                console.log(error)
            }
            
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
                const received: Order = await Order.get(order.id, Order)
                const status: Tradable.OrderStatus = received.status
                expect(status).toEqual(Tradable.OrderStatus.received)

                const changedSKU: SKU = await SKU.get(finiteSKUFailure.id, SKU)
                const inventory: Tradable.Inventory = changedSKU.inventory
                expect(inventory.quantity).toEqual(1)
            }
            
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

                const received: Order = await Order.get(order.id, Order)
                const status: Tradable.OrderStatus = received.status
                expect(status).toEqual(Tradable.OrderStatus.received)

                const changedSKU: SKU = await SKU.get(infiniteSKU.id, SKU)
                const inventory: Tradable.Inventory = changedSKU.inventory
                expect(inventory.type).toEqual(Tradable.StockType.infinite)

            } catch (error) {
                console.log(error)
            }

        }, 10000)

        test("Inventory Infinite quantity success", async () => {
            

        }, 10000)
    })
})
