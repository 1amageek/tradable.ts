import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, PaymentDelegate, PaymentOptions } from "./index";
export interface Process {
    <T extends OrderItemProtocol, U extends OrderProtocol<T>>(order: U): Promise<void>;
}
export declare class Manager<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>> {
    private _SKU;
    private _Product;
    private _OrderItem;
    private _Order;
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
    });
    execute(order: Order, process: Process): Promise<void>;
    delegate?: PaymentDelegate;
    inventoryControl(order: Order): Promise<void>;
    payment(order: Order, options: PaymentOptions): Promise<void>;
}
