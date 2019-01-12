import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    UserProtocol,
    SKUProtocol,
    TradeTransactionType,
    TradeTransactionProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    TradeDelegate,
    TradableError,
    TradableErrorCode,
    TradeInformation,
    InventoryStockProtocol
} from "./index"

export class StockManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    Product extends ProductProtocol<InventoryStock, SKU>,
    InventoryStock extends InventoryStockProtocol,
    SKU extends SKUProtocol<InventoryStock>,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _InventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }

    public delegate!: TradeDelegate

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        inventoryStock: { new(id?: string, value?: { [key: string]: any }): InventoryStock },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    ) {
        this._User = user
        this._Product = product
        this._InventoryStock = inventoryStock
        this._SKU = sku
        this._TradeTransaction = tradeTransaction
    }

    async order(tradeInformation: TradeInformation, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const productID: string | undefined = tradeInformation.product

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const product: Product = new this._Product(productID, {})
        const sku: SKU = product.SKUs.doc(skuID, this._SKU)
        const inventoryStockQuery = sku.inventoryStocks.reference.where("isAvailabled", "==", true).limit(quantity)
        const snapshot: FirebaseFirestore.QuerySnapshot = await transaction.get(inventoryStockQuery)
        const inventoryStocks: FirebaseFirestore.QueryDocumentSnapshot[] = snapshot.docs

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
        }

        if (inventoryStocks.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock.`)
        }

        if (inventoryStocks.length < quantity) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock.`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        for (let i = 0; i < quantity; i++) {
            const inventoryStockSnapshot: FirebaseFirestore.QueryDocumentSnapshot = inventoryStocks[i]
            const itemID = this.delegate.createItem(tradeInformation, inventoryStocks[i].id, transaction)
            tradeTransaction.items.push(itemID)
            transaction.set(inventoryStockSnapshot.ref, {
                "isAvailabled": false,
                "item": itemID,
                "order": orderID
            }, { merge: true })
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
        const productID: string | undefined = tradeInformation.product

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const product: Product = new this._Product(productID, {})
        const sku: SKU = product.SKUs.doc(skuID, this._SKU)
        const inventoryStockQuery = sku.inventoryStocks.reference.where("item", "==", itemID).limit(1)
        const snapshot: FirebaseFirestore.QuerySnapshot = await transaction.get(inventoryStockQuery)
        const inventoryStocks: FirebaseFirestore.QueryDocumentSnapshot[] = snapshot.docs

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (inventoryStocks.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} Inventory Stock is impty`)
        }

        const inventoryStockSnapshot: FirebaseFirestore.QueryDocumentSnapshot = inventoryStocks[0]
        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderChange
        tradeTransaction.quantity = 1
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID
        tradeTransaction.items.push(itemID)

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
        const productID: string | undefined = tradeInformation.product

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const product: Product = new this._Product(productID, {})
        const sku: SKU = product.SKUs.doc(skuID, this._SKU)
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
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        for (let i = 0; i < quantity; i++) {
            const inventoryStockSnapshot: FirebaseFirestore.QueryDocumentSnapshot = inventoryStocks[i]
            const itemID: string = inventoryStockSnapshot.data()["item"]
            tradeTransaction.items.push(itemID)
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