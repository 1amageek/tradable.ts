import * as Pring from 'pring';
import * as admin from 'firebase-admin';
import * as FirebaseFirestore from '@google-cloud/firestore';
import { Manager } from './manager';
import { Currency } from './currency';
export { Currency, Manager };
export declare let firestore: FirebaseFirestore.Firestore;
export declare let timestamp: admin.firestore.FieldValue;
export declare const initialize: (app: admin.app.App, serverTimestamp: FirebaseFirestore.FieldValue) => void;
export interface UserProtocol<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>> extends Pring.Base {
    isAvailabled: boolean;
    country: string;
    products: FirebaseFirestore.Query;
    skus: FirebaseFirestore.Query;
    orders: FirebaseFirestore.Query;
    orderings: FirebaseFirestore.Query;
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
    currency: Currency;
    amount: number;
    fee: number;
    net: number;
    order?: string;
    transfer?: string;
    payout?: string;
    information: {
        [key: string]: any;
    };
}
export declare type Balance = {
    accountsReceivable: {
        [currency: string]: number;
    };
    available: {
        [currency: string]: number;
    };
};
export interface AccountProtocol<Transaction extends TransactionProtocol> extends Pring.Base {
    country: string;
    isRejected: boolean;
    isSigned: boolean;
    commissionRatio: number;
    revenue: {
        [currency: string]: number;
    };
    balance: Balance;
    transactions: Pring.NestedCollection<Transaction>;
    fundInformation: {
        [key: string]: any;
    };
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
    refunded = "refunded",
    waitingForRefund = "waitingForRefund",
    canceled = "canceled",
    transferd = "transferd",
    waitingForTransferrd = "waitingForTransferrd",
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
    shippingTo: {
        [key: string]: string;
    };
    transferredTo: {
        [key: string]: true;
    };
    paidAt?: Date;
    expirationDate: Date;
    currency: Currency;
    amount: number;
    fee: number;
    net: number;
    items: Pring.NestedCollection<OrderItem>;
    status: OrderStatus;
    paymentInformation: {
        [key: string]: any;
    };
    transferInformation: {
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
export declare type TransferOptions = {
    vendorType: string;
};
export interface PaymentDelegate {
    pay<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: PaymentOptions): Promise<any>;
    refund<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: RefundOptions): Promise<any>;
    transfer<U extends OrderItemProtocol, T extends OrderProtocol<U>>(order: T, options: TransferOptions): Promise<any>;
}
