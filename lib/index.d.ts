import * as Pring from "pring";
import { Manager } from './manager';
import { Currency } from './currency';
import { Query } from '@google-cloud/firestore';
export { Currency, Manager };
export interface UserProtocol<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>> extends Pring.Base {
    isAvailabled: boolean;
    country: string;
    products: Pring.ReferenceCollection<Product>;
    skus: Query;
    orders: Query;
    orderings: Query;
}
export declare enum TransactionType {
    payment = "payment",
    paymentRefund = "payment_refund",
    transfer = "transfer",
    transferRefund = "transfer_refund",
    payout = "payout",
    payoutCancel = "payout_cancel",
}
export interface TransactionProtocol extends Pring.Base {
    type: TransactionType;
    currency: string;
    amount: number;
    order?: string;
    transfer?: string;
    payout?: string;
}
export interface AccountProtocol<Transaction extends TransactionProtocol> extends Pring.Base {
    country: string;
    isRejected: boolean;
    isSigned: boolean;
    balance: {
        [currency: string]: number;
    };
    transactions: Pring.NestedCollection<Transaction>;
}
export interface ProductProtocol<SKU extends SKUProtocol> extends Pring.Base {
    title: string;
    selledBy: string;
    createdBy: string;
    skus: Pring.NestedCollection<SKU>;
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
    unitSales: number;
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
    created = "created",
    rejected = "rejected",
    received = "received",
    paid = "paid",
    waitingForPayment = "waitingForPayment",
    waitingForRefund = "waitingForRefund",
    refunded = "refunded",
    canceled = "canceled",
}
export interface OrderItemProtocol extends Pring.Base {
    order: string;
    buyer: string;
    selledBy: string;
    type: OrderItemType;
    product?: string;
    sku?: string;
    quantity: number;
    currency: Currency;
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
    paymentInformation: {
        [key: string]: any;
    };
    refundInformation: {
        [key: string]: any;
    };
}
export declare type PaymentOptions = {
    source?: string;
    customer?: string;
    vendorType: string;
};
export declare enum RefundReason {
    duplicate = "duplicate",
    fraudulent = "fraudulent",
    requestedByCustomer = "requested_by_customer",
}
export declare type RefundOptions = {
    vendorType: string;
    reason?: RefundReason;
};
export interface PaymentDelegate {
    pay<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: PaymentOptions): Promise<any>;
    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: RefundOptions): Promise<any>;
}
