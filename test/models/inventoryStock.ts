import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";
import { Item } from './item';

const property = Pring.property

export class InventoryStock extends Pring.Base implements tradable.InventoryStockProtocol {
    @property isAvailabled: boolean = true
    @property SKU!: string
    @property item?: string
}
