import * as Pring from 'pring'
import * as tradable from '../src/index'
import { SKU } from './sku'
import { Product } from './product'
import { OrderItem } from './orderItem';
import { Order } from './order'
import "reflect-metadata";
import { Query } from '@google-cloud/firestore';

const property = Pring.property

export class User extends Pring.Base implements tradable.UserProtocol<SKU, Product, OrderItem, Order> {
    @property isAvailabled: boolean = false
    @property country: string = "JP"
    @property products: Query
    @property skus: Query
    @property orders: Query
    @property orderings: Query
}