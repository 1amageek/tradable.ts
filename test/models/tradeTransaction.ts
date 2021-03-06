import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata"

const property = Pring.property

export class TradeTransaction extends Pring.Base implements tradable.TradeTransactionProtocol {
    @property type: tradable.TradeTransactionType = tradable.TradeTransactionType.unknown
    @property selledBy: string = ''
    @property purchasedBy: string = ''
    @property order: string = ''
    @property product?: FirebaseFirestore.DocumentReference
    @property sku: string = ''
    @property inventoryStock?: string
    @property item!: FirebaseFirestore.DocumentReference
}
