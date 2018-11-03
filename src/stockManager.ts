import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Pring from 'pring-admin'
import {
    firestore,
    timestamp,
    UserProtocol,
    SKUProtocol,
    TradeTransactionType,
    TradeTransactionProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    ItemProtocol
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

        if (!sku) { return transaction }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        const item: Item = new this._Item(orderID)
        item.selledBy = selledBy
        item.order = orderID
        item.product = productID
        item.sku = skuID

        const skuQuantity: number = (sku.inventory.quantity || 0) - quantity
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id) as FirebaseFirestore.DocumentReference, tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id) as FirebaseFirestore.DocumentReference, tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference as FirebaseFirestore.DocumentReference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })
        transaction.set(purchaser.items.reference.doc(item.id) as FirebaseFirestore.DocumentReference, item.value(), { merge: true })
        return transaction
    }

    async orderCancel(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const item: Item = new this._Item(orderID, {})
        const sku: SKU | undefined = await product.skus.doc(skuID, this._SKU, transaction)

        if (!sku) { return transaction }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        const skuQuantity: number = (sku.inventory.quantity || 0) + quantity
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id) as FirebaseFirestore.DocumentReference, tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id) as FirebaseFirestore.DocumentReference, tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference as FirebaseFirestore.DocumentReference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })
        transaction.set(purchaser.items.reference.doc(item.id) as FirebaseFirestore.DocumentReference, {
            isCanceled: true
        }, { merge: true })
        return transaction
    }
}