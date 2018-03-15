import * as Pring from 'pring'
import * as tradable from '../src/index'
import { OrderItem } from './orderItem'
import "reflect-metadata";

const property = Pring.property

export class Order extends Pring.Base implements tradable.OrderProtocol<OrderItem> {
    @property parentID?: string
    @property buyer: string
    @property selledBy: string
    @property shippingTo: { [key: string]: string; }
    @property paidAt?: Date
    @property expirationDate: Date
    @property currency: tradable.Currency = tradable.Currency.USD
    @property amount: number = 0
    @property items: Pring.ReferenceCollection<OrderItem> = new Pring.ReferenceCollection(this)
    @property status: tradable.OrderStatus = tradable.OrderStatus.created
}