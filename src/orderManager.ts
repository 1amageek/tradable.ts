import * as Pring from 'pring-admin'
import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    timestamp,
    OrderItemProtocol,
    OrderProtocol,
    TradeTransactionProtocol,
    ItemProtocol,
    UserProtocol,
    TransactionResult
} from "./index"

export class OrderManager
    <
    Order extends OrderProtocol<OrderItem>,
    OrderItem extends OrderItemProtocol,
    User extends UserProtocol<Order, OrderItem, TradeTransaction, Item>,
    Item extends ItemProtocol,
    TradeTransaction extends TradeTransactionProtocol
    > {

    private _User: { new(id?: string, value?: { [key: string]: any }): User }

    constructor(
        user: { new(id?: string, value?: { [key: string]: any }): User }
    ) {
        this._User = user
    }

    update(order: Order, orderItems: OrderItem[], transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {
    
        const orderValue = order.value() as any
        orderValue.updatedAt = timestamp

        if (Object.keys(transactionResult).length > 0) {
            orderValue["transactionResults"] = FirebaseFirestore.FieldValue.arrayUnion(transactionResult)
        }
        
        transaction.set(order.reference, orderValue, { merge: true })
        const seller = new this._User(order.selledBy, {})
        transaction.set(seller.receivedOrders.reference.doc(order.id), orderValue, { merge: true })
        for (const orderItem of orderItems) {
            const orderItemValue: Pring.DocumentData = order.value()
            orderItemValue.updatedAt = timestamp
            transaction.set(seller.receivedOrders.reference.doc(order.id).collection("items").doc(orderItem.id),
            orderItemValue,
            { merge: true })
        }
    }
}