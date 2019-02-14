import * as tradable from '../src/index'
import { Item } from './models/item'
import { User } from './models/user'


export class TradeDelegate implements tradable.TradeDelegate {
    
    reserve<OrderItem extends tradable.OrderItemProtocol, Order extends tradable.OrderProtocol<OrderItem>>(order: Order, orderItem: OrderItem, transaction: FirebaseFirestore.Transaction): void {

    }

    createItem(information: tradable.TradeInformation, inventoryStock: string, transaction: FirebaseFirestore.Transaction): FirebaseFirestore.DocumentReference {
        const purchaser: User = new User(information.purchasedBy, {})
        const item: Item = new Item()
        item.selledBy = information.selledBy
        item.order = information.order
        item.product = information.product
        item.sku = information.sku
        item.inventoryStock = inventoryStock
        transaction.set(purchaser.items.reference.doc(item.id), item.value(), { merge: true })
        return item.reference
    }

    cancelItem(information: tradable.TradeInformation, item: FirebaseFirestore.DocumentReference, transaction: FirebaseFirestore.Transaction): void {
        const purchaser: User = new User(information.purchasedBy, {})
        transaction.set(purchaser.items.reference.doc(item.id), {
            isCancelled: true
        }, { merge: true })
    }

    async getItems(information: tradable.TradeInformation, transaction: FirebaseFirestore.Transaction): Promise<string[]> {
        const purchaser: User = new User(information.purchasedBy, {})
        const items = await purchaser.items.get(Item, transaction)
        return  items.map((value) => { return value.id})
    }
}