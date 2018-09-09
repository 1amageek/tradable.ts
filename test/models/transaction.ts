import * as Pring from 'pring'
import * as tradable from '../../src'
import "reflect-metadata"

const property = Pring.property

export class Transaction extends Pring.Base implements tradable.TransactionProtocol {
    @property type: tradable.TransactionType
    @property currency: tradable.Currency
    @property amount: number
    @property fee: number
    @property net: number 
    @property order?: string
    @property transfer?: string    
    @property payout?: string
    @property information: { [key: string]: any }
}