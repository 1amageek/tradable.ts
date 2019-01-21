import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";
import { InventoryStock } from './inventoryStock';

const property = Pring.property

export class Item extends Pring.Base implements tradable.ItemProtocol {
    @property order: string = ''
    @property selledBy: string = ''
    @property product?: string
    @property sku: string = ''
    @property isCancelled: boolean = false
    @property inventoryStock?: string
}