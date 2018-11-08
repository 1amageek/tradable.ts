import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    UserProtocol,
    SKUProtocol,
    TradeTransactionType,
    TradeTransactionProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    ItemProtocol,
    TradableError,
    TradableErrorCode
} from "./index"

export class StockManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction, Item>,
    Product extends ProductProtocol<SKU>,
    SKU extends SKUProtocol,
    Item extends ItemProtocol,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _Item: { new(id?: string, value?: { [key: string]: any }): Item }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        item: { new(id?: string, value?: { [key: string]: any }): Item },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    ) {
        this._User = user
        this._Product = product
        this._SKU = sku
        this._Item = item
        this._TradeTransaction = tradeTransaction
    }

    async order(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU | undefined = await product.skus.doc(skuID, this._SKU, transaction)

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        const skuQuantity: number = (sku.inventory.quantity || 0) - quantity

        if (skuQuantity < 0) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock.`)
        }

        for (let i = 0; i < quantity; i++) {
            const item: Item = new this._Item()
            item.selledBy = selledBy
            item.order = orderID
            item.product = productID
            item.sku = skuID
            tradeTransaction.items.push(item.id)
            transaction.set(purchaser.items.reference.doc(item.id), item.value(), { merge: true })
        }

        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })

        return tradeTransaction
    }

    async itemCancel(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, itemID: string, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const item: Item = new this._Item(itemID, {})
        const sku: SKU | undefined = await product.skus.doc(skuID, this._SKU, transaction)

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderItemCancel
        tradeTransaction.quantity = 1
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID
        tradeTransaction.items.push(item.id)

        const skuQuantity: number = (sku.inventory.quantity || 0) + 1
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })
        transaction.set(purchaser.items.reference.doc(item.id), {
            isCanceled: true
        }, { merge: true })
        return tradeTransaction
    }

    async orderCancel(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const result = await Promise.all([product.skus.doc(skuID, this._SKU, transaction), purchaser.items.get(this._Item)])

        const sku: SKU | undefined = result[0]
        const items: Item[] = result[1]

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderCancel
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        const skuQuantity: number = (sku.inventory.quantity || 0) + quantity
        for (const item of items) {
            tradeTransaction.items.push(item.id)
            transaction.set(purchaser.items.reference.doc(item.id), {
                isCanceled: true
            }, { merge: true })
        }
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })
        return tradeTransaction
    }
}