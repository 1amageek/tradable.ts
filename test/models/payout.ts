import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";

const property = Pring.property

export class Payout extends Pring.Base implements tradable.PayoutProtocol {
    @property currency: tradable.Currency = tradable.Currency.JPY
    @property amount: number = 0
    @property account: string = ""
    @property status: tradable.PayoutStatus = tradable.PayoutStatus.none
    @property transactionResults: tradable.TransactionResult[] = []
    @property isCancelled: boolean = false
}
