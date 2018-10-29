import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Pring from 'pring'
import {
    firestore,
    timestamp,
    UserProtocol,
    SKUProtocol,
    TradeTransactionType,
    TradeTransactionProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    Currency,
    BalanceTransactionType,
    Balance,
    TransferOptions,
    TradableErrorCode,
    TradableError,
    ItemProtocol
} from "./index"

const isUndefined = (value: any): boolean => {
    return (value === null || value === undefined || value === NaN)
}

export class OrderValidator
<Order extends OrderProtocol<OrderItem>, OrderItem extends OrderItemProtocol> {

    private _Order: { new(id?: string, value?: { [key: string]: any }): Order }
    private _OrderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }

    constructor(
        order: { new(id?: string, value?: { [key: string]: any }): Order },
        orderItem: { new(id?: string, value?: { [key: string]: any }): OrderItem }
    ) {
        this._Order = order
        this._OrderItem = orderItem
    }

    validate(order: Order, items: OrderItem[]): void | Error {
        if (isUndefined(order.purchasedBy)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, purchasedBy is required`)
        if (isUndefined(order.selledBy)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, selledBy is required`)
        if (isUndefined(order.expirationDate)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, expirationDate is required`)
        if (isUndefined(order.currency)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, currency is required`)
        if (isUndefined(order.amount)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, amount is required`)
        if (!this.validateMinimumAmount(order)) return new TradableError(TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, Amount is below the lower limit.`)
        try {
            if (!this.validateCurrency(order, items)) return new TradableError(TradableErrorCode.invalidCurrency, order, `[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`)
            if (!this.validateAmount(order, items)) return new TradableError(TradableErrorCode.invalidAmount, order, `[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`)
            const orderItemError = this.validateOrderItem(order, items)
            if (orderItemError) return orderItemError
        } catch (error) {
            return error
        }
    }

    private validateMinimumAmount(order: Order): boolean {
        const currency: Currency = order.currency
        const amount: number = order.amount
        if (0 < amount && amount < Currency.minimum(currency)) {
            return false
        }
        return true
    }

    // Returns true if there is no problem in the verification
    private validateCurrency(order: Order, orderItems: OrderItem[]): boolean {
        for (const item of orderItems) {
            if (item.currency !== order.currency) {
                return false
            }
        }
        return true
    }

    // Returns true if there is no problem in the verification
    private validateAmount(order: Order, orderItems: OrderItem[]) {
        let totalAmount: number = 0

        for (const item of orderItems) {
            totalAmount += (item.amount * item.quantity)
        }
        if (totalAmount !== order.amount) {
            return false
        }
        return true
    }

    private validateOrderItem(order: Order, orderItems: OrderItem[]): void | Error {
        for (const item of orderItems) {
            const productID: string | undefined = item.product
            const skuID: string | undefined = item.sku

            if (!productID) {
                return new TradableError(TradableErrorCode.internal, order, `[Failure] ORDER/${order.id} Order requires productID..`)
            }
    
            if (!skuID) {
                return new TradableError(TradableErrorCode.internal, order, `[Failure] ORDER/${order.id} Order requires skuID.`)
            }
        }
    }
}