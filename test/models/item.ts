import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";

const property = Pring.property

export class Item extends Pring.Base implements tradable.ItemProtocol {
    @property purchasedBy!: string 
    @property order: string = ''
    @property selledBy: string = ''
    @property product?: FirebaseFirestore.DocumentReference
    @property sku: string = ''
    @property isCancelled: boolean = false
    @property inventoryStock?: string
}