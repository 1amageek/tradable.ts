import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { InventoryStock } from './inventoryStock'
import "reflect-metadata";

const property = Pring.property

export class SKU extends Pring.Base implements tradable.SKUProtocol<InventoryStock> {
    @property selledBy!: string
    @property createdBy!: string
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property product!: FirebaseFirestore.DocumentReference
    @property title!: string
    @property body!: string
    @property amount: number = 0
    @property unitSales: number = 0
    @property inventory: tradable.Inventory = { type: tradable.StockType.finite, quantity: 1 }
    @property isOutOfStock: boolean = false
    @property isAvailabled: boolean = true
    @property numberOfFetchCount: number = 2
    @property inventoryStocks: Pring.NestedCollection<InventoryStock> = new Pring.NestedCollection(this)
}
