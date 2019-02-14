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

export class StockTransaction
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

    public inventoryStocks: InventoryStock[] = []

    public delegate!: TradeDelegate

    public tradeInformation!: TradeInformation

    public quantity!: number

    public transaction!: FirebaseFirestore.Transaction

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

    setInformation(tradeInformation: TradeInformation, quantity: number, transaction: FirebaseFirestore.Transaction) {
        this.tradeInformation = tradeInformation
        this.quantity = quantity
        this.transaction = transaction
    }

    async commit() {
        const tradeInformation = this.tradeInformation
        const inventoryStocks = this.inventoryStocks
        const transaction = this.transaction
        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = this.quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = tradeInformation.product
        tradeTransaction.sku = skuID

        for (let i = 0; i < inventoryStocks.length; i++) {
            const inventoryStock = inventoryStocks[i]
            if (inventoryStock.isAvailabled) {
                const item = this.delegate.createItem(tradeInformation, inventoryStock.id, transaction)
                tradeTransaction.item = item
                tradeTransaction.inventoryStocks.push(inventoryStock.id)
                transaction.set(inventoryStock.reference, {
                    "isAvailabled": false,
                    "item": item,
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
}

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

        const numberOfShards: number = (tradeInformation.numberOfShards || 5) * quantity
        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const sku: SKU = new this._SKU(skuID, {})
        const query = sku.inventoryStocks.reference.where("isAvailabled", "==", true).limit(numberOfShards)

        const fetchResult = await Promise.all([
            sku.fetch(transaction),
            query.get()
        ])

        const inventoryStocks = fetchResult[1]
        const inventoryStockIDs = inventoryStocks.docs.map((inventoryStock) => { return inventoryStock.id })

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
        }

        if (inventoryStockIDs.length < quantity) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock`)
        }

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
                throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock`)
            }
        }

        const result = await Promise.all(tasks)

        const stockTransaction: StockTransaction<
            Order,
            OrderItem,
            User,
            InventoryStock,
            SKU,
            TradeTransaction
        > = new StockTransaction(
            this._User,
            this._InventoryStock,
            this._SKU,
            this._TradeTransaction
        )

        stockTransaction.delegate = this.delegate
        stockTransaction.setInformation(tradeInformation, quantity, transaction)
        stockTransaction.inventoryStocks = result
        return stockTransaction
    }

    async itemCancel(tradeInformation: TradeInformation, item: FirebaseFirestore.DocumentReference, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = await new this._SKU(skuID, {})
        const inventoryStockQuery = sku.inventoryStocks.reference.where("item", "==", item).limit(1)
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
        tradeTransaction.item = item
        tradeTransaction.inventoryStocks.push(inventoryStockSnapshot.id)

        transaction.set(inventoryStockSnapshot.ref, {
            "isAvailabled": true,
            "item": FirebaseFirestore.FieldValue.delete(),
            "order": FirebaseFirestore.FieldValue.delete()
        }, { merge: true })

        transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        this.delegate.cancelItem(tradeInformation, item, transaction)
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
            const item: FirebaseFirestore.DocumentReference = inventoryStockSnapshot.data()["item"]
            tradeTransaction.item = item
            tradeTransaction.inventoryStocks.push(inventoryStocks[i].id)
            this.delegate.cancelItem(tradeInformation, item, transaction)
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