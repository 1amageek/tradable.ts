import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";

const property = Pring.property

export class SKU extends Pring.Base implements tradable.SKUProtocol {
    @property selledBy: string = ''
    @property createdBy: string = ''
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property product: string = ''
    @property title: string = ''
    @property body: string = ''
    @property amount: number = 0
    @property unitSales: number = 0
    @property inventory: tradable.Inventory = { type: tradable.StockType.finite, quantity: 1 }
}
