# tradable.ts

## Installation

```
npm add @1amageek/tradable
```


## Usage

You need to implement Tradable Inteface in the object associated with the user.Also, you prepare objects that implement other protocols.

### PaymentDelegate
In order to process payment with tradabe it is necessary to implement delegate.
This is an example of paying with Stripe.

```typescript
export const stripe = new Stripe(Config.STRIPE_API_KEY)
export class StripePaymentDelegate implements tradable.TransactionDelegate {

    async payment<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions) {
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
        data.customer = Config.STRIPE_CUS_TOKEN
        data.source = Config.STRIPE_CORD_TOKEN

        try {
            const charge = await stripe.charges.create(data, {
                idempotency_key: idempotency_key
            })
            return charge
        } catch (error) {
            console.log(error)
            throw error
        }
    }

    async refund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, options: tradable.PaymentOptions, reason?: string | undefined) {
        const transactionResults = order.transactionResults
        const transactionResult = transactionResults[transactionResults.length - 1]
        const stripeCharge = transactionResult["stripe"] as Stripe.charges.ICharge
        const charegeID = stripeCharge.id
        const idempotency_key = `refund:${order.id}`

        let data: Stripe.refunds.IRefundCreationOptions = {}
        data.amount = amount
        if (reason) {
            data.reason = reason
        }

        try {
            return await stripe.charges.refund(charegeID, data, {
                idempotency_key: idempotency_key
            })
        } catch (error) {
            throw error
        }
    }

    async partRefund<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(currency: tradable.Currency, amount: number, order: T, orderItem: U, options: tradable.PaymentOptions, reason?: string | undefined) {
        const transactionResults = order.transactionResults
        const transactionResult = transactionResults[transactionResults.length - 1]

        const stripeCharge = transactionResult["stripe"] as Stripe.charges.ICharge
        const charegeID = stripeCharge.id
        const idempotency_key = `refund:${orderItem.id}`

        let data: Stripe.refunds.IRefundCreationOptions = {}
        data.amount = amount
        if (reason) {
            data.reason = reason
        }

        try {
            return await stripe.charges.refund(charegeID, data, {
                idempotency_key: idempotency_key
            })
        } catch (error) {
            throw error
        }
    }

    async transfer<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>,
        V extends tradable.BalanceTransactionProtocol, W extends tradable.AccountProtocol<V>>
        (currency: tradable.Currency, amount: number, order: T, toAccount: W, options: tradable.TransferOptions) {
        const idempotency_key = order.id
        const destination = toAccount.accountInformation['stripe']['id']
        const data: Stripe.transfers.ITransferCreationOptions = {
            amount: order.amount,
            currency: order.currency,
            transfer_group: order.id,
            destination: destination
        }

        try {
            const transfer = await stripe.transfers.create(data, {
                idempotency_key: idempotency_key
            })
            return transfer
        } catch (error) {
            console.log(error)
            throw error
        }
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
```

#### Tradable
Request implementation of protocol required for trading.

#### UserProtocol
Request implementation of the protocol of the user who can place an order.

#### ProductProtocol
Request implementation of protocol of product information.

#### SKUShardProtocol
Request implementation of SKUShard protocol.

#### SKUProtocol
Request implementation of SKU protocol.

#### OrderProtocol
Request implementation of Order protocol.

#### OrderItemProtocol
Request implementation of OrderItem protocol.

