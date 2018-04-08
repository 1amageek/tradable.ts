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

    async transfer<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.TransferOptions): Promise<any> {
        try {            
            const account = await Account.get(order.selledBy, Account)
            const amount = order.amount
            const currency = order.currency
            const transfer_group = order.id

            if (!account.isSigned) {
                throw new Error("account is not signed")
            }

            const destination = account.stripeID
            if (!account.isSigned) {
                throw new Error("account is not signed")
            }

            const data: Stripe.transfers.ITransferCreationOptions = {
                amount: amount,
                currency: currency,
                destination: destination,
                transfer_group: transfer_group
            }

            try {
                const result = await stripe.transfers.create(data)
                return result
            } catch (error) {
                throw error
            }
        } catch (error) {
            throw error
        }
    }
}