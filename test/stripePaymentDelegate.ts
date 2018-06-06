import * as tradable from '../src/index'
import * as Stripe from 'stripe'
import * as Config from './config'
import { Account } from './account'
import { Order } from './order'

export const stripe = new Stripe(Config.STRIPE_API_KEY)

export class StripePaymentDelegate implements tradable.PaymentDelegate {

    async pay<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.PaymentOptions): Promise<any> {

        const amount = order.amount
        const currency = order.currency
        const idempotency_key = order.id
        const data: Stripe.charges.IChargeCreationOptions = {
            amount: order.amount,
            currency: order.currency,
            description: `Charge for user/${order.buyer}`
        }

        if (options.customer) {
            data.customer = options.customer
        }

        if (options.source) {
            data.source = options.source
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

    async refund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.RefundOptions): Promise<any> {

        const charegeID = order.paymentInformation[options.vendorType]['id']
        const amount = order.amount
        const currency = order.currency
        const idempotency_key = `refund:${order.id}`

        let data: Stripe.refunds.IRefundCreationOptions = {}

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

    async cancel<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.CancelOptions): Promise<any> {

        const charegeID = order.paymentInformation[options.vendorType]['id']
        const amount = order.net
        const currency = order.currency
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

    // async payout<U extends tradable.TransactionProtocol, T extends tradable.AccountProtocol<U>>(account: T, amount: number, currency: tradable.Currency): Promise<any> {
    //     const stripeAccountID = account.fundInformation['stripe']
    //     const destinationAmount = amount * (1 - 0.2)
    //     try {
    //         const result = await stripe.payouts.create({
    //             destination: stripeAccountID,
    //             amount: destinationAmount,
    //             currency: currency
    //         })
    //         return result
    //     } catch (error) {
    //         throw error
    //     }        
    // }

    async transfer<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.TransferOptions): Promise<any> {
        try {
            return {}
        } catch (error) {
            throw error
        }
    }

}