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

        infiniteSKU.name = "InfiniteSKU"        
        infiniteSKU.selledBy = shop.id
        infiniteSKU.createdBy = shop.id
        infiniteSKU.product = product.id
        infiniteSKU.inventory = {
            type: Tradable.StockType.infinite,
            value: Tradable.StockValue.inStock
        }

        shop.skus.insert(finiteSKU)
        shop.skus.insert(infiniteSKU)
        shop.products.insert(product)

        await shop.save()
        await user.save()
    })

    describe("Manager", async () => {

        test("Inventory Infinite quantity success", async () => {

            const order: Order = new Order()
            const date: Date = new Date()
            const orderItem: OrderItem = new OrderItem()

            orderItem.order = order.id
            orderItem.selledBy = shop.id
            orderItem.buyer = user.id
            orderItem.quantity = 1

            order.selledBy = shop.id
            order.buyer = user.id
            order.shippingTo = { address: "address" }
            order.expirationDate = new Date(date.setDate(date.getDate() + 14))
            order.items.insert(orderItem)

            await order.save()

            const manager = new Tradable.Manager()

            try {
                await manager.execute(order)
            } catch (error) {
                console.log(error)
            }
            
        }, 10000)

        test("Inventory Infinite quantity failure", async () => {
            

        }, 10000)

        test("Inventory Infinite quantity success", async () => {
            

        }, 10000)
    })
})
