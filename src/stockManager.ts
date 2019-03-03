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
    InventoryStockProtocol,
    StockType,
    StockValue
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

    public commitBlock?: () => TradeTransaction[]

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

    async commit() {
        if (this.commitBlock) {
            return this.commitBlock()
        }
        return []
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

    async trade(tradeInformation: TradeInformation, orderItem: OrderItem, transaction: FirebaseFirestore.Transaction) {

        const quantity: number = orderItem.quantity
        const numberOfShards: number = (tradeInformation.numberOfShards || 5) * quantity
        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const sku: SKU = new this._SKU(skuID, {})
        const query = sku.inventoryStocks.reference.where("isAvailabled", "==", true).limit(numberOfShards)

        const fetchResult = await Promise.all([
            sku.fetch(transaction),
            query.get()
        ])
        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }
        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
        }

        const stockType = sku.inventory.type
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

        const inventoryStocks = fetchResult[1].docs.map((snapshot) => {
            const stock: InventoryStock = new this._InventoryStock(snapshot.id, {}).setData(snapshot.data())
            stock.setParent(sku.inventoryStocks)
            return stock
        })

        if (stockType === StockType.finite) {
            if (inventoryStocks.length < quantity) {
                throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock`)
            }
            let tasks = []
            let stockIDs = inventoryStocks.map(stock => { return stock.id })
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
            stockTransaction.inventoryStocks = result
        }

        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string | undefined = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const stockValue: StockValue | undefined = sku.inventory.value

        if (!stockType) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] ORDER/${orderID}. SKU: ${skuID}. Invalid StockType.`)
        }

        stockTransaction.commitBlock = () => {
            let tradeTransactions = []
            for (let i = 0; i < quantity; i++) {
                const tradeTransaction: TradeTransaction = new this._TradeTransaction()
                tradeTransaction.type = TradeTransactionType.order
                tradeTransaction.selledBy = selledBy
                tradeTransaction.purchasedBy = purchasedBy
                tradeTransaction.order = orderID
                tradeTransaction.product = tradeInformation.product
                tradeTransaction.sku = skuID
                switch (stockType) {
                    case StockType.finite: {
                        const inventoryStock = stockTransaction.inventoryStocks[i]
                        if (inventoryStock.isAvailabled) {
                            const item = this.delegate.createItem(tradeInformation, orderItem, inventoryStock.id, transaction)
                            tradeTransaction.item = item
                            tradeTransaction.inventoryStock = inventoryStock.id
                            transaction.set(inventoryStock.reference, {
                                "isAvailabled": false,
                                "item": item,
                                "order": orderID
                            }, { merge: true })
                        } else {
                            throw new TradableError(TradableErrorCode.invalidShard, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} InventoryStock/${inventoryStock.id} InventoryStock is not availabled`)
                        }
                        break
                    }
                    case StockType.infinite: {
                        const item = this.delegate.createItem(tradeInformation, orderItem, undefined, transaction)
                        tradeTransaction.item = item
                        break
                    }
                    case StockType.bucket: {
                        if (!stockValue) {
                            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] ORDER/${orderID}. SKU: ${skuID}. Invalid StockValue.`)
                        }
                        if (stockValue !== StockValue.outOfStock) {
                            const item = this.delegate.createItem(tradeInformation, orderItem, undefined, transaction)
                            tradeTransaction.item = item
                        } else {
                            throw new TradableError(TradableErrorCode.invalidShard, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} StockValue is out of stock.`)
                        }
                        break
                    }
                }

                transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
                transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
                transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
                tradeTransactions.push(tradeTransaction)
            }
            return tradeTransactions
        }
        return stockTransaction
    }

    async cancel(tradeInformation: TradeInformation, transaction: FirebaseFirestore.Transaction) {
        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = new this._SKU(skuID, {})
        const result = await Promise.all([sku.fetch(transaction), this.delegate.getItems(tradeInformation, transaction)])
        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }
        const items = result[1].docs
        const stockType = sku.inventory.type
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

        stockTransaction.commitBlock = () => {
            let tradeTransactions: TradeTransaction[] = []
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                const stockID = item.data()["inventoryStock"]
                const tradeTransaction: TradeTransaction = new this._TradeTransaction()
                tradeTransaction.type = TradeTransactionType.orderCancel
                tradeTransaction.selledBy = selledBy
                tradeTransaction.purchasedBy = purchasedBy
                tradeTransaction.order = orderID
                tradeTransaction.product = tradeInformation.product
                tradeTransaction.sku = skuID
                tradeTransaction.item = item.ref
                tradeTransaction.inventoryStock = stockID
                this.delegate.cancelItem(tradeInformation, item.ref, transaction)
                if (stockType === StockType.finite) {
                    let inventoryStock: InventoryStock = new this._InventoryStock(stockID)
                    inventoryStock.setParent(sku.inventoryStocks)
                    transaction.set(inventoryStock.reference, {
                        "isAvailabled": true,
                        "item": FirebaseFirestore.FieldValue.delete(),
                        "order": FirebaseFirestore.FieldValue.delete()
                    }, { merge: true })
                }
                transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
                transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
                transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
                tradeTransactions.push(tradeTransaction)
            }
            return tradeTransactions
        }
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

        const stockType = sku.inventory.type
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

        stockTransaction.commitBlock = () => {
            let tradeTransactions: TradeTransaction[] = []
            const tradeTransaction: TradeTransaction = new this._TradeTransaction()
            tradeTransaction.type = TradeTransactionType.orderChange
            tradeTransaction.selledBy = selledBy
            tradeTransaction.purchasedBy = purchasedBy
            tradeTransaction.order = orderID
            tradeTransaction.product = tradeInformation.product
            tradeTransaction.sku = skuID
            tradeTransaction.item = item
            this.delegate.cancelItem(tradeInformation, item, transaction)
            if (stockType === StockType.finite) {
                const stockID = inventoryStocks[0].id
                tradeTransaction.inventoryStock = stockID
                let inventoryStock: InventoryStock = new this._InventoryStock(stockID)
                inventoryStock.setParent(sku.inventoryStocks)
                transaction.set(inventoryStock.reference, {
                    "isAvailabled": true,
                    "item": FirebaseFirestore.FieldValue.delete(),
                    "order": FirebaseFirestore.FieldValue.delete()
                }, { merge: true })
            }
            transaction.set(tradeTransaction.reference, tradeTransaction.value(), { merge: true })
            transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
            transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
            tradeTransactions.push(tradeTransaction)
            return tradeTransactions
        }
        return stockTransaction
    }
}