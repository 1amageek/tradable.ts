process.env.NODE_ENV = 'test'
import * as Pring from 'pring-admin'
import * as admin from 'firebase-admin'
import * as Tradable from '../src/index'
import * as Config from '../config'
import Stripe from 'stripe'
import { User } from './models/user'
import { Product } from './models/product'
import { InventoryStock } from './models/inventoryStock'
import { SKU } from './models/sku'
import { Order } from './models/order'
import { OrderItem } from './models/orderItem'
import { Item } from './models/item'
import { TradeTransaction } from './models/tradeTransaction'
import { Account } from './models/account'
import { StockManager } from '../src/stockManager'
import * as firebase from '@firebase/testing'
import { TradeDelegate } from './tradeDelegate';
import { rejects } from 'assert';


export const stripe = new Stripe(Config.STRIPE_API_KEY)

const key = require("../key.json")
const app = admin.initializeApp({
	credential: admin.credential.cert(key)
})

Pring.initialize(app.firestore())
Tradable.initialize(app)

describe("StockManager", () => {

	const shop: User = new User()
	const user: User = new User()
	const product: Product = new Product()
	const sku: SKU = new SKU()
	const order: Order = new Order()


	let transactionID: string

	const stockManager: StockManager<Order, OrderItem, User, InventoryStock, SKU, TradeTransaction> = new StockManager(User, InventoryStock, SKU, TradeTransaction)

	beforeAll(async () => {

		product.name = "PRODUCT"
		product.createdBy = shop.id
		product.selledBy = shop.id

		sku.title = "sku"
		sku.selledBy = shop.id
		sku.createdBy = shop.id
		sku.product = product.reference
		sku.amount = 100
		sku.currency = Tradable.Currency.JPY
		sku.inventory = {
			type: Tradable.StockType.finite,
			quantity: 10
		}
		for (let i = 0; i < sku.inventory.quantity!; i++) {
			const inventoryStock: InventoryStock = new InventoryStock(`${i}`)
			sku.inventoryStocks.insert(inventoryStock)
		}

		await Promise.all([user.save(), sku.save(), product.save(), shop.save()])
		stockManager.delegate = new TradeDelegate()
	})

	describe("Order Stress test", async () => {
		test("Success", async () => {
			let successCount: number = 0
			const n = 5
			const interval = 0
			try {
				let tasks = []
				for (let i = 0; i < n; i++) {
					const test = async () => {
						const date: Date = new Date()
						const orderItem: OrderItem = new OrderItem()

						orderItem.order = order.id
						orderItem.selledBy = shop.id
						orderItem.purchasedBy = user.id
						orderItem.sku = sku.id
						orderItem.currency = sku.currency
						orderItem.amount = sku.amount
						orderItem.quantity = 1
						orderItem.product = product.reference

						order.amount = sku.amount
						order.currency = sku.currency
						order.selledBy = shop.id
						order.purchasedBy = user.id
						order.shippingTo = { address: "address" }
						order.expirationDate = admin.firestore.Timestamp.fromDate(new Date(date.setDate(date.getDate() + 14)))
						order.items.append(orderItem)
						user.orders.insert(order)
						await order.save()
						try {
							await new Promise((resolve, reject) => {
								setTimeout(async () => {
									try {
										const result = await Pring.firestore.runTransaction(async (transaction) => {
											const tradeInformation = {
												selledBy: shop.id,
												purchasedBy: user.id,
												order: order.id,
												sku: sku.id,
												product: product.reference
											}
											const stockTransaction = await stockManager._trade(order, orderItem, transaction)
											return await stockTransaction.commit()
										})
										resolve(result)
									} catch (error) {
										reject(error)
									}

								}, i * interval)
							})
							successCount += 1
							console.log(successCount)
						} catch (error) {
							console.log(error)
						}
					}
					tasks.push(test())
				}
				await Promise.all(tasks)
				const result = await sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", false).dataSource().get()
				expect(successCount).toEqual(result.length)
			} catch (error) {
				const result = await sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", false).dataSource().get()
				expect(successCount).toEqual(result.length)
				console.log(error)
			}
		}, 15000)
	})

	afterAll(async () => {
		await Promise.all([shop.delete(), user.delete(), product.delete(), sku.delete()])
	})
})
