import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class Balance extends Pring.Base implements tradable.BalanceProtocol {
    @property currency: string
    @property amount: number
}