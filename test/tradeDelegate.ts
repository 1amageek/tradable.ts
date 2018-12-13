import * as tradable from '../src/index'
import { Item } from './models/item'
import { User } from './models/user'


export class TradeDelegate implements tradable.TradeDelegate {

    createItem(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, transaction: FirebaseFirestore.Transaction): string {
        const purchaser: User = new User(purchasedBy, {})
        const item: Item = new Item()
        item.selledBy = selledBy
        item.order = orderID
        item.product = productID
        item.sku = skuID
        transaction.set(purchaser.items.reference.doc(item.id), item.value(), { merge: true })
        return item.id
    }

    cancelItem(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, itemID: string, transaction: FirebaseFirestore.Transaction): void {
        const purchaser: User = new User(purchasedBy, {})
        transaction.set(purchaser.items.reference.doc(itemID), {
            isCanceled: true
        }, { merge: true })
    }

    async getItems(selledBy: string, purchasedBy: string, orderID: string, productID: string, skuID: string, transaction: FirebaseFirestore.Transaction): Promise<string[]> {
        const purchaser: User = new User(purchasedBy, {})
        const items = await purchaser.items.get(Item, transaction)
        return  items.map((value) => { return value.id})
    }
}