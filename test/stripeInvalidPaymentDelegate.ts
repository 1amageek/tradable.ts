import * as tradable from '../src/index'
import * as Stripe from 'stripe'
import * as Config from '../config'

export const stripe = new Stripe(Config.STRIPE_API_KEY)

export class StripeInvalidPaymentDelegate implements tradable.TransactionDelegate {


    async authorize<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions) {
        throw new Error("Method not implemented.");
    }

    async authorizeCancel<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions) {
        throw new Error("Method not implemented.");
    }

    async pay<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions) {
        throw new Error("Method not implemented.");
    }

    async refund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions, reason?: string | undefined) {
        
    }
    
    async partRefund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, orderItem: U, options: tradable.PaymentOptions, reason?: string | undefined) {
        throw new Error("Method not implemented.");
    }

    async transfer<OrderItem extends tradable.OrderItemProtocol, 
    Order extends tradable.OrderProtocol<OrderItem>, 
    BalanceTransaction extends tradable.BalanceTransactionProtocol, 
    Payout extends tradable.PayoutProtocol, 
    Account extends tradable.AccountProtocol<BalanceTransaction, Payout>>
    (currency: tradable.Currency, amount: number, order: Order, toAccount: Account, options: tradable.TransferOptions) {
        throw new Error("Method not implemented.");
    }

    async transferCancel<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.TransferOptions, reason?: string | undefined) {
        throw new Error("Method not implemented.");
    }

    async payout(currency: tradable.Currency, amount: number, accountID: string, options: tradable.PayoutOptions) {
        throw new Error("Method not implemented.");
    }

    async payoutCancel(currency: tradable.Currency, amount: number, accountID: string, options: tradable.PayoutOptions) {
        throw new Error("Method not implemented.");
    }
}