import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { BalanceTransaction } from './balanceTransaction'
import { Payout } from './payout';

const property = Pring.property

export class Account extends Pring.Base implements tradable.AccountProtocol<BalanceTransaction, Payout> {
    
    @property stripeID?: string
    @property country: string = ""
    @property isRejected: boolean = false
    @property isSigned: boolean = false
    @property commissionRate: number = 10
    @property revenue: { [currency: string]: number } = {}
    @property sales: { [currency: string]: number } = {}
    @property balance: tradable.Balance = { available: {}, pending: {}}
    @property balanceTransactions: Pring.NestedCollection<BalanceTransaction> = new Pring.NestedCollection(this)
    @property accountInformation: { [key: string]: any } = {}
    @property payoutRequests: Pring.NestedCollection<Payout> = new Pring.NestedCollection(this)
}
