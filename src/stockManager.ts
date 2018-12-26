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
    SKUShardProtocol
} from "./index"

export class StockManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    Product extends ProductProtocol,
    SKUShard extends SKUShardProtocol,
    SKU extends SKUProtocol<SKUShard>,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Product: { new(id?: string, value?: { [key: string]: any }): Product }
    private _SKUShard: { new(id?: string, value?: { [key: string]: any }): SKUShard }
    private _SKU: { new(id?: string, value?: { [key: string]: any }): SKU }
    private _TradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }

    public delegate!: TradeDelegate

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        product: { new(id?: string, value?: { [key: string]: any }): Product },
        skuShard: { new(id?: string, value?: { [key: string]: any }): SKUShard },
        sku: { new(id?: string, value?: { [key: string]: any }): SKU },
        tradeTransaction: { new(id?: string, value?: { [key: string]: any }): TradeTransaction }
    ) {
        this._User = user
        this._Product = product
        this._SKUShard = skuShard
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
        const sku: SKU = new this._SKU(skuID, {})
        const result = await Promise.all([sku.fetch(transaction), sku.shards.get(this._SKUShard, transaction)])
        const shards: SKUShard[] = result[1]

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (!sku.isAvailabled) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is not availabled`)
        }

        if (shards.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU has not shards`)
        }

        let skuQuantity: number = 0
        shards.forEach((shard) => {
            skuQuantity += shard.quantity
        })

        skuQuantity += quantity

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.order
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        const inventoryQuantity: number = sku.inventory.quantity || 0
        if (inventoryQuantity < skuQuantity) {
            throw new TradableError(TradableErrorCode.outOfStock, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU is out of stock.`)
        }

        if (inventoryQuantity === skuQuantity) {
            transaction.set(sku.reference, { isOutOfStock: true }, { merge: true })
        }

        for (let i = 0; i < quantity; i++) {
            const itemID = this.delegate.createItem(tradeInformation, transaction)
            tradeTransaction.items.push(itemID)
        }

        const shardID = Math.floor(Math.random() * sku.numberOfShards);
        const shard: SKUShard = shards[shardID]
        const shardQuantity: number = shard.quantity + quantity

        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(shard.reference, {
            quantity: shardQuantity
        }, { merge: true })

        return tradeTransaction
    }

    async orderChange(tradeInformation: TradeInformation, itemID: string, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const productID: string | undefined = tradeInformation.product

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = new this._SKU(skuID, {})
        const result = await Promise.all([sku.fetch(transaction), sku.shards.get(this._SKUShard, transaction)])
        const shards: SKUShard[] = result[1]

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (shards.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU has not shards`)
        }

        const inventoryQuantity: number = sku.inventory.quantity || 0
        let skuQuantity: number = 0
        shards.forEach((shard) => {
            skuQuantity += shard.quantity
        })
        if (inventoryQuantity === skuQuantity) {
            transaction.set(sku.reference, { isOutOfStock: false }, { merge: true })
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

        const shardID = Math.floor(Math.random() * sku.numberOfShards);
        const shard: SKUShard = shards[shardID]
        const shardQuantity: number = shard.quantity - 1

        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(shard.reference, {
            quantity: shardQuantity
        }, { merge: true })
        this.delegate.cancelItem(tradeInformation, itemID, transaction)
        return tradeTransaction
    }

    async orderCancel(tradeInformation: TradeInformation, quantity: number, transaction: FirebaseFirestore.Transaction) {

        const orderID: string = tradeInformation.order
        const skuID: string = tradeInformation.sku
        const purchasedBy: string = tradeInformation.purchasedBy
        const selledBy: string = tradeInformation.selledBy
        const productID: string | undefined = tradeInformation.product

        const seller: User = new this._User(selledBy, {})
        const purchaser: User = new this._User(purchasedBy, {})
        const sku: SKU = new this._SKU(skuID, {})
        const result = await Promise.all([sku.fetch(transaction), sku.shards.get(this._SKUShard, transaction), this.delegate.getItems(tradeInformation, transaction)])
        const shards: SKUShard[] = result[1]
        const itemIDs = result[2]

        if (!sku) {
            throw new TradableError(TradableErrorCode.invalidArgument, `[Manager] Invalid order ORDER/${orderID}. invalid SKU: ${skuID}`)
        }

        if (shards.length == 0) {
            throw new TradableError(TradableErrorCode.internal, `[Manager] Invalid order ORDER/${orderID}. SKU/${skuID} SKU has not shards`)
        }

        const inventoryQuantity: number = sku.inventory.quantity || 0
        let skuQuantity: number = 0
        shards.forEach((shard) => {
            skuQuantity += shard.quantity
        })
        if (inventoryQuantity === skuQuantity) {
            transaction.set(sku.reference, { isOutOfStock: false }, { merge: true })
        }

        const tradeTransaction: TradeTransaction = new this._TradeTransaction()
        tradeTransaction.type = TradeTransactionType.orderCancel
        tradeTransaction.quantity = quantity
        tradeTransaction.selledBy = selledBy
        tradeTransaction.purchasedBy = purchasedBy
        tradeTransaction.order = orderID
        tradeTransaction.product = productID
        tradeTransaction.sku = skuID

        for (const itemID of itemIDs) {
            tradeTransaction.items.push(itemID)
            this.delegate.cancelItem(tradeInformation, itemID, transaction)
        }

        const shardID = Math.floor(Math.random() * sku.numberOfShards);
        const shard: SKUShard = shards[shardID]
        const shardQuantity: number = shard.quantity - quantity

        transaction.set(seller.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(purchaser.tradeTransactions.reference.doc(tradeTransaction.id), tradeTransaction.value(), { merge: true })
        transaction.set(shard.reference, {
            quantity: shardQuantity
        }, { merge: true })
        return tradeTransaction
    }
}