import * as tradable from '../src/index'
import { Item } from './models/item'
import { User } from './models/user'


export class TradeDelegate implements tradable.TradeDelegate {

    createItem<T extends tradable.ItemProtocol>(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, transaction: FirebaseFirestore.Transaction): T {
        const purchaser: User = new User(purchasedBy, {})
        const item: Item = new Item()
        item.selledBy = selledBy
        item.order = orderID
        item.product = productID
        item.sku = skuID
        transaction.set(purchaser.items.reference.doc(item.id), item.value(), { merge: true })
        return item as T
    }

    cancelItem(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, itemID: string, transaction: FirebaseFirestore.Transaction): void {
        const purchaser: User = new User(purchasedBy, {})
        transaction.set(purchaser.items.reference.doc(itemID), {
            isCanceled: true
        }, { merge: true })
    }

    getItems<T extends tradable.ItemProtocol>(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, transaction: FirebaseFirestore.Transaction): Promise<T[]> {
        const purchaser: User = new User(purchasedBy, {})
        return purchaser.items.get(Item) as Promise<T[]>
    }
}