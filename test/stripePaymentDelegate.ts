import * as tradable from '../src/index'
import * as Stripe from 'stripe'
import * as Config from './config'
import { Account } from './models/account'
import { Order } from './models/order'

export const stripe = new Stripe(Config.STRIPE_API_KEY)

export class StripePaymentDelegate implements tradable.TransactionDelegate {

    async payment<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions): Promise<any> {

        const idempotency_key = order.id
        const data: Stripe.charges.IChargeCreationOptions = {
            amount: order.amount,
            currency: order.currency,
            description: `Charge for user/${order.purchasedBy}`
        }

        if (options) {
            if (options.customer) {
                data.customer = options.customer
            }
            if (options.source) {
                data.source = options.source
            }
        }

        try {
            const charge = await stripe.charges.create(data, {
                idempotency_key: idempotency_key
            })
            return charge
        } catch (error) {
            throw error
        }
    }

    async refund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions, reason?: string): Promise<any> {

        const charegeID = ""
        const idempotency_key = `refund:${order.id}`

        let data: Stripe.refunds.IRefundCreationOptions = {}

        if (reason) {
            data.reason = reason
        }

        try {
            const result = await stripe.charges.refund(charegeID, data, {
                idempotency_key: idempotency_key
            })
            return result
        } catch (error) {
            throw error
        }
    }

    async transfer<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.TransferOptions): Promise<any> {

        const charegeID = order.paymentInformation[options.vendorType]['id']
        const idempotency_key = `refund:${order.id}`

        let data: Stripe.refunds.IRefundCreationOptions = {
            amount: amount
        }

        if (options.reason) {
            data.reason = options.reason
        }

        try {
            const result = await stripe.charges.refund(charegeID, data, {
                idempotency_key: idempotency_key
            })
            return result
        } catch (error) {
            throw error
        }
    }

    async transferCancel<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options?: tradable.TransferOptions): Promise<any> {
        try {
            return {}
        } catch (error) {
            throw error
        }
    }

    async payout(currency: tradable.Currency, amount: number, accountID: string, options: tradable.PayoutOptions) {

    }

    async payoutCancel(currency: tradable.Currency, amount: number, accountID: string, options: tradable.PayoutOptions) {

    }


    // async payout<U extends tradable.BalanceTransactionProtocol, T extends tradable.AccountProtocol<U>>(currency: tradable.Currency, amount: number, account: T, options?: tradable.PayoutOptions): Promise<any> {
    //     try {
    //         return {}
    //     } catch (error) {
    //         throw error
    //     }
    // } 

    // async payoutCancel<U extends tradable.BalanceTransactionProtocol, T extends tradable.AccountProtocol<U>>(currency: tradable.Currency, amount: number, account: T, options?: tradable.PayoutOptions): Promise<any> {
    //     try {
    //         return {}
    //     } catch (error) {
    //         throw error
    //     }
    // } 

}