import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { SKU } from './sku'
import { SKUShard } from './skuShard'
import "reflect-metadata";

const property = Pring.property

export class Product extends Pring.Base implements tradable.ProductProtocol<SKUShard, SKU> {
    @property name?: string | undefined;
    @property caption?: string | undefined;
    @property SKUs: Pring.NestedCollection<SKU> = new Pring.NestedCollection(this)
    @property selledBy: string = ''
    @property createdBy: string = ''
    @property isAvailabled: boolean = false
    @property isPrivated: boolean = false
}