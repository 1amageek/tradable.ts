import * as Pring from 'pring-admin'
import * as tradable from '../../src/index'
import { SKU } from './sku'
import "reflect-metadata";

const property = Pring.property

export class Product extends Pring.Base implements tradable.ProductProtocol<SKU> {
    @property title: string = ''
    @property selledBy: string = ''
    @property createdBy: string = ''
    @property skus: Pring.NestedCollection<SKU> = new Pring.NestedCollection(this)
    @property isPublished: boolean = false
    @property isAvailabled: boolean = false
    @property isPrivated: boolean = false
}