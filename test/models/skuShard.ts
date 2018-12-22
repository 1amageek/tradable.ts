import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import "reflect-metadata";

const property = Pring.property

export class SKUShard extends Pring.Base implements tradable.SKUShardProtocol {
    @property quantity: number = 0
}
