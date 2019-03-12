import * as tradable from '../src/index'
import { Item } from './models/item'
import { User } from './models/user'


export class TradeDelegate implements tradable.TradeDelegate {
    
    reserve<OrderItem extends tradable.OrderItemProtocol, Order extends tradable.OrderProtocol<OrderItem>>(order: Order, orderItem: OrderItem, transaction: FirebaseFirestore.Transaction): void {

    }

    createItem<T extends tradable.OrderItemProtocol, U extends tradable.OrderProtocol<T>>(order: U, orderItem: T, inventoryStock: string | undefined, transaction: FirebaseFirestore.Transaction): FirebaseFirestore.DocumentReference {
        const purchaser: User = new User(order.purchasedBy, {})
        const item: Item = new Item()
        item.selledBy = orderItem.selledBy
        item.order = order.id
        item.product = orderItem.product
        item.sku = orderItem.sku!
        item.inventoryStock = inventoryStock
        transaction.set(purchaser.items.reference.doc(item.id), item.value(), { merge: true })
        return item.reference
    }

    cancelItem<T extends tradable.OrderItemProtocol, U extends tradable.OrderProtocol<T>>(order: U, orderItem: T, item: FirebaseFirestore.DocumentReference, transaction: FirebaseFirestore.Transaction): void {
        const purchaser: User = new User(order.purchasedBy, {})
        transaction.set(purchaser.items.reference.doc(item.id), {
            isCancelled: true
        }, { merge: true })
    }

    async getItems<T extends tradable.OrderItemProtocol, U extends tradable.OrderProtocol<T>>(order: U, orderItem: T, transaction: FirebaseFirestore.Transaction): Promise<FirebaseFirestore.QuerySnapshot> {
        const purchaser: User = new User(order.purchasedBy, {})
        const query = purchaser.items.reference.where("order", "==", order.id)
        const items = await transaction.get(query)
        return items
    }
}