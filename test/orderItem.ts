import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class OrderItem extends Pring.Base implements tradable.OrderItemProtocol {
    @property order: string
    @property buyer: string
    @property selledBy: string
    @property type: tradable.OrderItemType = tradable.OrderItemType.sku
    @property product?: string
    @property sku?: string
    @property quantity: number = 0
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property amount: number = 0
}