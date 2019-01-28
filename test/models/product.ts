import * as Pring from 'pring-admin'
import { SKU } from './sku'
import "reflect-metadata";

const property = Pring.property

export class Product extends Pring.Base {
    @property name?: string | undefined;
    @property caption?: string | undefined;
    @property SKUs: Pring.NestedCollection<SKU> = new Pring.NestedCollection(this)
    @property selledBy: string = ''
    @property createdBy: string = ''
    @property isAvailabled: boolean = false
    @property isPrivated: boolean = false
}