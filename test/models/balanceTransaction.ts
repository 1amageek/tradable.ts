import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata"

const property = Pring.property

export class BalanceTransaction extends Pring.Base implements tradable.BalanceTransactionProtocol {
    @property type: tradable.BalanceTransactionType = tradable.BalanceTransactionType.payment
    @property currency: tradable.Currency = tradable.Currency.USD
    @property amount: number = 0
    @property from: tradable.AccountOrDestination = ""
    @property to: tradable.AccountOrDestination = ""
    @property order?: string | undefined
    @property transfer?: string | undefined
    @property payout?: string | undefined
    @property transactionResults: tradable.TransactionResult[] = []
}
