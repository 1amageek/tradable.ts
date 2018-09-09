import * as Pring from 'pring'
import * as tradable from '../../src/index'
import { Transaction } from './transaction'
import "reflect-metadata"

const property = Pring.property

export class Account extends Pring.Base implements tradable.AccountProtocol<Transaction> {
    @property stripeID?: string
    @property country: string
    @property isRejected: boolean
    @property isSigned: boolean
    @property commissionRatio: number = 10
    @property revenue: { [currency: string]: number }
    @property balance: tradable.Balance
    @property transactions: Pring.NestedCollection<Transaction> = new Pring.NestedCollection(this)
    @property fundInformation: { [key: string]: any }
}
