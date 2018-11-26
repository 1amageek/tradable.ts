import * as Pring from 'pring-admin'
import * as tradable from '../../src'
import { Order } from './order'
import { OrderItem } from './orderItem'
import { TradeTransaction } from './tradeTransaction'
import { Item } from './item'
import "reflect-metadata";

const property = Pring.property

export class User extends Pring.Base implements tradable.UserProtocol<Order, OrderItem, TradeTransaction> {
    @property orders: Pring.NestedCollection<Order> = new Pring.NestedCollection(this)
    @property receivedOrders: Pring.NestedCollection<Order> = new Pring.NestedCollection(this)
    @property items: Pring.NestedCollection<Item> = new Pring.NestedCollection(this)
    @property tradeTransactions: Pring.NestedCollection<TradeTransaction> = new Pring.NestedCollection(this)
    @property isAvailabled: boolean = false
    @property country: string = "JP"
}