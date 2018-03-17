import * as Pring from "pring";
import { Manager } from './manager';
import { Currency } from './currency';
import { Query } from '@google-cloud/firestore';
export { Currency, Manager };
export interface Tradable<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>> extends Pring.Base {
    isAvailabled: boolean;
    products: Pring.ReferenceCollection<Product>;
    skus: Pring.ReferenceCollection<SKU>;
    orders: Pring.ReferenceCollection<Order>;
}
export interface UserProtocol extends Pring.Base {
    orders: Query;
}
export interface ProductProtocol<SKU extends SKUProtocol> extends Pring.Base {
    title: string;
    selledBy: string;
    createdBy: string;
    skus: Pring.ReferenceCollection<SKU>;
}
export declare enum StockType {
    bucket = "bucket",
    finite = "finite",
    infinite = "infinite",
}
export declare enum StockValue {
    inStock = "in_stock",
    limited = "limited",
    outOfStock = "out_of_stock",
}
export declare type Inventory = {
    type: StockType;
    quantity?: number;
    value?: StockValue;
};
export interface SKUProtocol extends Pring.Base {
    selledBy: string;
    createdBy: string;
    currency: Currency;
    product: string;
    name: string;
    price: number;
    inventory: Inventory;
    isPublished: boolean;
    isActive: boolean;
}
export declare enum OrderItemType {
    sku = "sku",
    tax = "tax",
    shipping = "shipping",
    discount = "discount",
}
export declare enum OrderStatus {
    unknown = "unknown",
    created = "created",
    rejected = "rejected",
    received = "received",
    paid = "paid",
    waitingForPayment = "waitingForPayment",
    waitingForRefund = "waitingForRefund",
    canceled = "canceled",
}
export interface OrderItemProtocol extends Pring.Base {
    order: string;
    buyer: string;
    selledBy: string;
    type: OrderItemType;
    sku: string;
    quantity: number;
    amount: number;
}
export interface OrderProtocol<OrderItem extends OrderItemProtocol> extends Pring.Base {
    parentID?: string;
    buyer: string;
    selledBy: string;
    shippingTo?: {
        [key: string]: string;
    };
    paidAt?: Date;
    expirationDate: Date;
    currency: Currency;
    amount: number;
    items: Pring.NestedCollection<OrderItem>;
    status: OrderStatus;
}
