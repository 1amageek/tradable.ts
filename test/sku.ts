import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class SKU extends Pring.Base implements tradable.SKUProtocol {
    @property selledBy: string
    @property createdBy: string
    @property currency: tradable.Currency = tradable.Currency.USD
    @property product: string
    @property name: string
    @property price: number = 0
    @property unitSales: number = 0
    @property inventory: tradable.Inventory = { type: tradable.StockType.finite, quantity: 1 }
    @property isPublished: boolean = false
    @property isActive: boolean = false
}
