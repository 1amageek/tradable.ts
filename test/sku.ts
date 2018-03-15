import * as Pring from 'pring'
import * as tradable from '../src/index'
import "reflect-metadata";

const property = Pring.property

export class SKU extends Pring.Base implements tradable.SKUProtocol  {
    @property selledBy: string
    @property createdBy: string;
    @property currency: string;
    @property product: string;
    @property name: string;
    @property price: number;
    @property inventory: tradable.Inventory;
    @property isPublished: boolean;
    @property isActive: boolean;
}
