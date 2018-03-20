import * as Pring from 'pring';
import * as tradable from '../src/index';
import "reflect-metadata";
export declare class OrderItem extends Pring.Base implements tradable.OrderItemProtocol {
    order: string;
    buyer: string;
    selledBy: string;
    type: tradable.OrderItemType;
    sku: string;
    quantity: number;
    amount: number;
}
