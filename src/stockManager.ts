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
    TradableErrorCode
} from "./index"

export class StockManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    Product extends ProductProtocol<SKU>,
    SKU extends SKUProtocol,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }

    public delegate!: TradeDelegate

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    ) {
        this._User = user
        this._Product = product
        this._SKU = sku
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

        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock.`)
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
            const itemID = this.delegate.createItem(selledBy, purchasedBy, orderID, productID, skuID, transaction)
            tradeTransaction.items.push(itemID)
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

    async orderChange(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, itemID: string, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU | undefined = await product.skus.doc(skuID, this._SKU, transaction)

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderChange
        tradeTransaction.quantity = 1
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID
        tradeTransaction.items.push(itemID)

        const skuQuantity: number = (sku.inventory.quantity || 0) + 1
        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(sku.reference, {
            inventory: {
                quantity: skuQuantity
            }
        }, { merge: true })
        this.delegate.cancelItem(selledBy, purchasedBy, orderID, productID, skuID, itemID, transaction)
        return tradeTransaction
    }

    async orderCancel(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const product: Product = new this._Product(productID, {})
        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const result = await Promise.all([product.skus.doc(skuID, this._SKU, transaction), this.delegate.getItems(selledBy, purchasedBy, orderID, productID, skuID, transaction)])

        const sku: SKU | undefined = result[0]
        const itemIDs = result[1]

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
        for (const itemID of itemIDs) {
            tradeTransaction.items.push(itemID)
            this.delegate.cancelItem(selledBy, purchasedBy, orderID, productID, skuID, itemID, transaction)
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