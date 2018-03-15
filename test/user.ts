import * as Pring from 'pring'
import * as tradable from '../src/index'
import { SKU } from './sku'
import { Product } from './product'
import { OrderItem } from './orderItem';
import { Order } from './order'
import "reflect-metadata";

const property = Pring.property

export class User extends Pring.Base implements tradable.UserProtocol<SKU, Product, OrderItem, Order> {
    @property name: string
    @property isAvailabled: boolean
    @property products: Pring.ReferenceCollection<Product>
    @property skus: Pring.ReferenceCollection<SKU>
    @property orders: Pring.ReferenceCollection<Order>
}