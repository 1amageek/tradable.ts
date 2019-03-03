import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    OrderItemProtocol,
    OrderProtocol,
    TradeTransactionProtocol,
    UserProtocol,
    TransactionResult
} from "./index"

export class OrderManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction>,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }
    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User },
        order: { new(id?: string, value?: { [key: string]: any }): Order }
    ) {
        this._User = user
        this._Order = order
    }

    update(order: Order, orderItems: OrderItem[], transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {
    
        const orderValue = order.updateValue()
        orderValue.updatedAt = FirebaseFirestore.FieldValue.serverTimestamp()

        if (Object.keys(transactionResult).length > 0) {
            orderValue["transactionResults"] = FirebaseFirestore.FieldValue.arrayUnion(transactionResult)
        }

        const orderReference = new this._Order(order.id, {}).reference
        const seller = new this._User(order.selledBy, {})
        const purchaser = new this._User(order.purchasedBy, {})
        transaction.set(orderReference, orderValue, { merge: true })
        transaction.set(seller.receivedOrders.reference.doc(order.id), orderValue, { merge: true })
        transaction.set(purchaser.orders.reference.doc(order.id), orderValue, { merge: true })
    }
}