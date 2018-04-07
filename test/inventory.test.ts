process.env.NODE_ENV = 'test';

import * as Pring from 'pring'
import * as Tradable from '../src/index'
import * as UUID from 'uuid'
import * as Config from './config'
import { User } from './user'
import { Product } from './product'
import { SKU } from './sku'
import { Order } from './order'
import { OrderItem } from './orderItem'
import { Balance } from './balance'
import { Account } from './account'

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

        product.title = "PRODUCT"
        product.createdBy = shop.id
        product.selledBy = shop.id

        finiteSKU.name = "FiniteSKU"
        finiteSKU.selledBy = shop.id
        finiteSKU.createdBy = shop.id
        finiteSKU.product = product.id
        finiteSKU.inventory = {
            type: Tradable.StockType.finite,
            quantity: 2
        }

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

        product.skus.insert(finiteSKU)
        product.skus.insert(finiteSKUFailure)
        product.skus.insert(infiniteSKU)
        product.skus.insert(inStockSKU)
        product.skus.insert(limitedSKU)
        product.skus.insert(outOfStockSKU)
        shop.products.insert(product)
        
        await shop.save()
        await user.save()
        await product.save()
    })

    describe("Manager", async () => {

        test("Inventory finite quantity success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.product = product.id
            orderItem.sku = finiteSKU.id
            orderItem.quantity = 2

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    return await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = new SKU(finiteSKU.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(2)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.quantity).toEqual(2)

        }, 10000)

        test("Inventory finite quantity failure", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.product = product.id
            orderItem.sku = finiteSKUFailure.id
            orderItem.quantity = 2

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)

            const changedSKU: SKU = new SKU(finiteSKUFailure.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(0)
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
            orderItem.product = product.id
            orderItem.sku = infiniteSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = new SKU(infiniteSKU.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(1)
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
            orderItem.product = product.id
            orderItem.sku = inStockSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = new SKU(inStockSKU.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(1)
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
            orderItem.product = product.id
            orderItem.sku = limitedSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.received)

            const changedSKU: SKU = new SKU(limitedSKU.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(1)
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
            orderItem.product = product.id
            orderItem.sku = outOfStockSKU.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Balance, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                // console.log(error)
            }

            const received: Order = await Order.get(order.id, Order)
            const status: Tradable.OrderStatus = received.status
            expect(status).toEqual(Tradable.OrderStatus.rejected)

            const changedSKU: SKU = new SKU(outOfStockSKU.id, {})            
            changedSKU.setParent(product.skus)
            await changedSKU.fetch()
            expect(changedSKU.unitSales).toEqual(0)
            const inventory: Tradable.Inventory = changedSKU.inventory
            expect(inventory.type).toEqual(Tradable.StockType.bucket)
            expect(inventory.value).toEqual(Tradable.StockValue.outOfStock)

        }, 10000)
        
    })

    afterAll(async () => {
        await shop.delete()
        await user.delete()
        await product.delete()
        await finiteSKU.delete()
        await finiteSKUFailure.delete()
        await infiniteSKU.delete()
        await inStockSKU.delete()
        await limitedSKU.delete()
        await outOfStockSKU.delete()
    })
})
