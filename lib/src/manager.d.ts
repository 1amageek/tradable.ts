import { SKUProtocol, OrderItemProtocol, ProductProtocol, OrderProtocol, Tradable, PaymentDelegate, PaymentOptions } from "./index";
export declare class Manager<SKU extends SKUProtocol, Product extends ProductProtocol<SKU>, OrderItem extends OrderItemProtocol, Order extends OrderProtocol<OrderItem>, User extends Tradable<SKU, Product, OrderItem, Order>> {
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
    execute(order: Order, transaction: (order: Order) => void): Promise<void>;
    delegate?: PaymentDelegate;
    inventoryControl(order: Order): Promise<void>;
    payment(order: Order, options: PaymentOptions): Promise<void>;
}
