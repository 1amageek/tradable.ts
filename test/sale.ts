import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata"

const property = Pring.property

export class Sale extends Pring.Base implements tradable.SaleProtocol {
    @property status: tradable.SaleStatus
    @property currency: tradable.Currency
    @property amount: number
    @property fee: number
    @property net: number
    @property order: string
    @property transfer?: string
}