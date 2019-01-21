import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { OrderItem } from './orderItem'
import { } from "reflect-metadata"

const property = Pring.property

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value == NaN)
}

export class Order extends Pring.Base implements tradable.OrderProtocol<OrderItem> {
    @property parentID?: string
    @property purchasedBy!: string
    @property selledBy!: string
    @property shippingTo!: { [key: string]: string }
    @property transferredTo!: { [key: string]: true }
    @property paidAt?: Pring.Timestamp
    @property expirationDate?: Pring.Timestamp
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property amount: number = 0
    @property items: Pring.List<OrderItem> = new Pring.List(this, OrderItem)
    @property paymentStatus: tradable.OrderPaymentStatus = tradable.OrderPaymentStatus.none
    @property transferStatus: tradable.OrderTransferStatus = tradable.OrderTransferStatus.none
    @property transactionResults: tradable.TransactionResult[] = []
    @property isCancelled: boolean = false
}