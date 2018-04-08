import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata"

const property = Pring.property

export class Transaction extends Pring.Base implements tradable.TransactionProtocol {
    @property type: tradable.TransactionType = tradable.TransactionType.payment
    @property currency: string = tradable.Currency.JPY
    @property amount: number = 0 
    @property order?: string
    @property transfer?: string
    @property payout?: string
}