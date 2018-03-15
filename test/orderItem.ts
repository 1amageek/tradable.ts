import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class OrderItem extends Pring.Base implements tradable.OrderItemProtocol {
    @property order: string
    @property buyer: string
    @property selledBy: string
    @property type: tradable.OrderItemType
    @property sku: string
    @property quantity: number
    @property amount: number
}