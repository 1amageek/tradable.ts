import * as Pring from 'pring'
import * as tradable from '../src/index'
import { Sale } from './sale'
import { Transaction } from './transaction'
import "reflect-metadata"
import { bankAccounts } from 'stripe';

const property = Pring.property

export class Account extends Pring.Base implements tradable.AccountProtocol<Sale, Transaction> {
    @property stripeID?: string
    @property country: string
    @property isRejected: boolean
    @property isSigned: boolean
    @property balance: tradable.Balance
    @property sales: Pring.NestedCollection<Sale> = new Pring.NestedCollection(this)
    @property transactions: Pring.NestedCollection<Transaction> = new Pring.NestedCollection(this)
    @property fundInformation: { [key: string]: any }
}
