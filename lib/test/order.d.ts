import * as Pring from 'pring';
import * as tradable from '../src/index';
import { OrderItem } from './orderItem';
export declare class Order extends Pring.Base implements tradable.OrderProtocol<OrderItem> {
    parentID?: string;
    buyer: string;
    selledBy: string;
    shippingTo?: {
        [key: string]: string;
    };
    paidAt?: Date;
    expirationDate: Date;
    currency: tradable.Currency;
    amount: number;
    items: Pring.NestedCollection<OrderItem>;
    status: tradable.OrderStatus;
    paymentInformation: {
        [key: string]: any;
    };
}
