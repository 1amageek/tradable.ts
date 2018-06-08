import * as FirebaseFirestore from '@google-cloud/firestore';
import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, TransactionProtocol, AccountProtocol, PaymentDelegate, PaymentOptions, RefundOptions, CancelOptions, TransferOptions } from "./index";
export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
}
export declare class Manager<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>, Transaction extends TransactionProtocol, Account extends AccountProtocol<Transaction>> {
    private _SKU;
    private _Product;
    private _OrderItem;
    private _Order;
    private _Transaction;
    private _Account;
    constructor(sku: {
        new (id?: string, value?: {
            [key: string]: any;
        }): SKU;
    }, product: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Product;
    }, orderItem: {
        new (id?: string, value?: {
            [key: string]: any;
        }): OrderItem;
    }, order: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Order;
    }, transaction: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Transaction;
    }, account: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Account;
    });
    execute(order: Order, process: Process, batch?: FirebaseFirestore.WriteBatch): Promise<void>;
    private validate;
    private validateMinimumAmount;
    private validateCurrency;
    private validateAmount;
    delegate?: PaymentDelegate;
    private inventory;
    inventoryControl(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    pay(order: Order, options: PaymentOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    order(order: Order, options: PaymentOptions, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    cancel(order: Order, options: CancelOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    refund(order: Order, options: RefundOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    transfer(order: Order, options: TransferOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    complete(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
}
