import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    UserProtocol,
    SKUProtocol,
    TradeTransactionType,
    TradeTransactionProtocol,
    OrderItemProtocol,
    OrderProtocol,
    TradeDelegate,
    TradableError,
    TradableErrorCode,
    TradeInformation,
    InventoryStockProtocol
} from "./index"
import { InventoryStock } from '../test/models/inventoryStock';

export class StockManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    InventoryStock extends InventoryStockProtocol,
    SKU extends SKUProtocol<InventoryStock>,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _InventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }

    public delegate!: TradeDelegate

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        inventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    ) {
        this._User = user
        this._InventoryStock = inventoryStock
        this._SKU = sku
        this._TradeTransaction = tradeTransaction
    }

    async reserve(order: Order, orderItem: OrderItem, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = order.id
        const skuID: string | undefined = orderItem.sku
        if (skuID) {
            const sku: SKU = await new this._SKU(skuID, {}).fetch()
            if (!sku) {
                throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
            }
            if (!sku.isAvailabled) {
                throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
            }
            this.delegate.reserve(order, orderItem, transaction)
        }
    }

    async order(tradeInformation: TradeInformation, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const numberOfShards: number = tradeInformation.numberOfShards || 5
        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})

        const sku: SKU = await new this._SKU(skuID, {})

        const fetchResult = await Promise.all([
            sku.fetch(transaction),
            sku.inventoryStocks.query(InventoryStock).where("isAvailabled", "==", true).limit(numberOfShards).dataSource().get()
        ])

        const inventoryStocks = fetchResult[1]
        const inventoryStockIDs = inventoryStocks.map((inventoryStock) => { return inventoryStock.id })

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
        }

        if (inventoryStockIDs.length <= 0) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID} inventoryStockIDs is empty.`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = tradeInformation.product
        tradeTransaction.sku = skuID

        let tasks = []

        let stockIDs = inventoryStockIDs

        for (let i = 0; i < quantity; i++) {
            const numberOfShards = stockIDs.length
            if (numberOfShards > 0) {
                const shardID = Math.floor(Math.random() * numberOfShards)
                const inventoryStockID = stockIDs[shardID]
                stockIDs.splice(shardID, 1)
                const task = async () => {
                    return await sku.inventoryStocks.doc(inventoryStockID, this._InventoryStock).fetch(transaction)
                }
                tasks.push(task())
            } else {
                throw new Error()
            }
        }

        const result = await Promise.all(tasks)

        for (let i = 0; i < quantity; i++) {
            const inventoryStock = result[i]
            if (inventoryStock.isAvailabled) {
                const itemID = this.delegate.createItem(tradeInformation, inventoryStock.id, transaction)
                tradeTransaction.items.push(itemID)
                tradeTransaction.inventoryStocks.push(inventoryStock.id)
                transaction.set(inventoryStock.reference, {
                    "isAvailabled": false,
                    "item": itemID,
                    "order": orderID
                }, { merge: true })
            } else {
                throw new TradableError(TradableErrorCode.invalidShard, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} InventoryStock/${inventoryStock.id} InventoryStock is not availabled`)
            }
        }

        transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        return tradeTransaction
    }

    async itemCancel(tradeInformation: TradeInformation, itemID: string, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = await new this._SKU(skuID, {})
        const inventoryStockQuery = sku.inventoryStocks.reference.where("item", "==", itemID).limit(1)
        const snapshot: FirebaseFirestore.QuerySnapshot = await transaction.get(inventoryStockQuery)
        const inventoryStocks: FirebaseFirestore.QueryDocumentSnapshot[] = snapshot.docs

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (inventoryStocks.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} Inventory Stock is empty`)
        }

        const inventoryStockSnapshot: FirebaseFirestore.QueryDocumentSnapshot = inventoryStocks[0]
        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderChange
        tradeTransaction.quantity = 1
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = tradeInformation.product
        tradeTransaction.sku = skuID
        tradeTransaction.items.push(itemID)
        tradeTransaction.inventoryStocks.push(inventoryStockSnapshot.id)

        transaction.set(inventoryStockSnapshot.ref, {
            "isAvailabled": true,
            "item": FirebaseFirestore.FieldValue.delete(),
            "order": FirebaseFirestore.FieldValue.delete()
        }, { merge: true })

        transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        this.delegate.cancelItem(tradeInformation, itemID, transaction)
        return tradeTransaction
    }

    async orderCancel(tradeInformation: TradeInformation, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = await new this._SKU(skuID, {})
        const inventoryStockQuery = sku.inventoryStocks.reference.where("order", "==", orderID)
        const snapshot: FirebaseFirestore.QuerySnapshot = await transaction.get(inventoryStockQuery)
        const inventoryStocks: FirebaseFirestore.QueryDocumentSnapshot[] = snapshot.docs

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (inventoryStocks.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} Invetory has not shards`)
        }
        const quantity: number = inventoryStocks.length
        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderCancel
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = tradeInformation.product
        tradeTransaction.sku = skuID

        for (let i = 0; i < quantity; i++) {
            const inventoryStockSnapshot: FirebaseFirestore.QueryDocumentSnapshot = inventoryStocks[i]
            const itemID: string = inventoryStockSnapshot.data()["item"]
            tradeTransaction.items.push(itemID)
            tradeTransaction.inventoryStocks.push(inventoryStocks[i].id)
            this.delegate.cancelItem(tradeInformation, itemID, transaction)
            transaction.set(inventoryStockSnapshot.ref, {
                "isAvailabled": true,
                "item": FirebaseFirestore.FieldValue.delete(),
                "order": FirebaseFirestore.FieldValue.delete()
            }, { merge: true })
        }

        transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        return tradeTransaction
    }
}