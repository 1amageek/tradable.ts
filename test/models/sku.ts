import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { SKUShard } from './skuShard'
import "reflect-metadata";

const property = Pring.property

export class SKU extends Pring.Base implements tradable.SKUProtocol<SKUShard> {
    @property selledBy!: string
    @property createdBy!: string
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property product!: string
    @property title!: string
    @property body!: string
    @property amount: number = 0
    @property unitSales: number = 0
    @property inventory: tradable.Inventory = { type: tradable.StockType.finite, quantity: 1 }
    @property isAvailabled: boolean = true
    @property numberOfShards: number = 1
    @property shards: Pring.NestedCollection<SKUShard> = new Pring.NestedCollection(this)
}
