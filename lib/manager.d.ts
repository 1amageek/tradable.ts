import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, BalanceProtocol, AccountProtocol, PaymentDelegate, PaymentOptions, TransferOptions } from "./index";
export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U): Promise<FirebaseFirestore.WriteBatch | void>;
}
export declare class Manager<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>, Balance extends BalanceProtocol, Account extends AccountProtocol<Balance>> {
    private _SKU;
    private _Product;
    private _OrderItem;
    private _Order;
    private _Balance;
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
    }, balance: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Balance;
    }, account: {
        new (id?: string, value?: {
            [key: string]: any;
        }): Account;
    });
    execute(order: Order, process: Process): Promise<void>;
    delegate?: PaymentDelegate;
    inventoryControl(order: Order): Promise<void>;
    pay(order: Order, options: PaymentOptions, batch?: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch | void>;
    recode(order: Order, batch: FirebaseFirestore.WriteBatch): Promise<FirebaseFirestore.WriteBatch>;
    transfer(order: Order, options: TransferOptions): Promise<void>;
}
