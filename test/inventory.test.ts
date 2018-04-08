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
import { Transaction } from './transaction'
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
        finiteSKU.currency = Tradable.Currency.JPY
        finiteSKU.price = 100
        finiteSKU.unitSales = 0
        finiteSKU.selledBy = shop.id
        finiteSKU.createdBy = shop.id
        finiteSKU.product = product.id
        finiteSKU.inventory = {
            type: Tradable.StockType.finite,
            quantity: 2
        }

        finiteSKUFailure.name = "FiniteSKU failure"
        finiteSKUFailure.currency = Tradable.Currency.JPY
        finiteSKUFailure.price = 100
        finiteSKUFailure.unitSales = 0
        finiteSKUFailure.selledBy = shop.id
        finiteSKUFailure.createdBy = shop.id
        finiteSKUFailure.product = product.id

        infiniteSKU.name = "InfiniteSKU"
        infiniteSKU.currency = Tradable.Currency.JPY
        infiniteSKU.price = 100
        infiniteSKU.unitSales = 0
        infiniteSKU.selledBy = shop.id
        infiniteSKU.createdBy = shop.id
        infiniteSKU.product = product.id
        infiniteSKU.inventory = {
            type: Tradable.StockType.infinite
        }

        inStockSKU.name = "InStockSKU"
        inStockSKU.currency = Tradable.Currency.JPY
        inStockSKU.price = 100
        inStockSKU.unitSales = 0
        inStockSKU.selledBy = shop.id
        inStockSKU.createdBy = shop.id
        inStockSKU.product = product.id
        inStockSKU.inventory = {
            type: Tradable.StockType.bucket,
            value: Tradable.StockValue.inStock
        }

        limitedSKU.name = "LimitedSKU"
        limitedSKU.currency = Tradable.Currency.JPY
        limitedSKU.price = 100
        limitedSKU.unitSales = 0
        limitedSKU.selledBy = shop.id
        limitedSKU.createdBy = shop.id
        limitedSKU.product = product.id
        limitedSKU.inventory = {
            type: Tradable.StockType.bucket,
            value: Tradable.StockValue.limited
        }

        outOfStockSKU.name = "OutOfStockSKU"
        outOfStockSKU.currency = Tradable.Currency.JPY
        outOfStockSKU.price = 100
        outOfStockSKU.unitSales = 0
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
            orderItem.amount = finiteSKU.price
            orderItem.currency = finiteSKU.currency
            orderItem.quantity = 2

            order.amount = finiteSKU.price
            order.currency = finiteSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
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
            orderItem.amount = finiteSKUFailure.price
            orderItem.currency = finiteSKUFailure.currency
            orderItem.quantity = 2

            order.amount = finiteSKUFailure.price
            order.currency = finiteSKUFailure.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
            try {
                await manager.execute(order, async (order) => {
                    await manager.inventoryControl(order)
                })                
            } catch (error) {
                console.log(error)
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
            orderItem.amount = infiniteSKU.price
            orderItem.currency = infiniteSKU.currency
            orderItem.quantity = 1

            order.amount = infiniteSKU.price
            order.currency = infiniteSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
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
            orderItem.amount = inStockSKU.price
            orderItem.currency = inStockSKU.currency
            orderItem.quantity = 1

            order.amount = inStockSKU.price
            order.currency = inStockSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
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
            orderItem.amount = limitedSKU.price
            orderItem.currency = limitedSKU.currency
            orderItem.quantity = 1

            order.amount = limitedSKU.price
            order.currency = limitedSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)
            await order.save()
            
            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
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
            orderItem.amount = outOfStockSKU.price
            orderItem.currency = outOfStockSKU.currency
            orderItem.quantity = 1

            order.amount = outOfStockSKU.price
            order.currency = outOfStockSKU.currency
            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager(SKU, Product, OrderItem, Order, Transaction, Account)
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
