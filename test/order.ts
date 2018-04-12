import * as Pring from 'pring'
import * as tradable from '../src/index'
import { OrderItem } from './orderItem'
import { } from "reflect-metadata";

const property = Pring.property

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value == NaN)
}

export class Order extends Pring.Base implements tradable.OrderProtocol<OrderItem> {
    @property parentID?: string
    @property buyer: string
    @property selledBy: string
    @property shippingTo?: { [key: string]: string; }
    @property paidAt?: Date
    @property expirationDate: Date
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property amount: number = 0
    @property fee: number = 0
    @property net: number = 0
    @property items: Pring.NestedCollection<OrderItem> = new Pring.NestedCollection(this)
    @property status: tradable.OrderStatus = tradable.OrderStatus.created
    @property paymentInformation: { [key: string]: any }
    @property transferInformation: { [key: string]: any }
    @property refundInformation: { [key: string]: any }
}