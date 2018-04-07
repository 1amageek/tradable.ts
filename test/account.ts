import * as Pring from 'pring'
import * as tradable from '../src/index'
import { Balance } from './balance'
import "reflect-metadata"

const property = Pring.property

export class Account extends Pring.Base implements tradable.AccountProtocol<Balance> {
    @property stripeID?: string
    @property country: string = "JP"
    @property isRejected: boolean = false
    @property isSigned: boolean = false
    @property balance: { [currency: string]: number }
    // @property balance: Pring.NestedCollection<Balance> = new Pring.NestedCollection(this)
}
