import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class Transaction extends Pring.Base implements tradable.TransactionProtocol {
    @property currency: string
    @property amount: number
    @property type: tradable.TransactionType
}