# tradable.ts

## Installation

```
npm add @1amageek/tradable
```


## Usage

You need to implement Tradable Inteface in the object associated with the user.Also, you prepare objects that implement other protocols.

### Inventory processing
The tradable.ts do inventory processing by the Manager. The manager processes the inventory in the transaction.


```typescript

// Initialize the Manager.
const manager = new Tradable.Manager(SKU, Product, OrderItem, Order)
manager.delegate = new StripePaymentDelegate()

const order: Order = new Order()
const orderItem: OrderItem = new OrderItem()

// set required properties

try {
    await manager.execute(order, async (order) => {
        await manager.inventoryControl(order)
        await manager.payment(order, {
            customer: user.stripe.customerID,
            vendorType: 'stripe'
        })
    })
} catch (error) {
    console.log(error)
}
```

### PaymentDelegate
In order to process payment with tradabe it is necessary to implement delegate.
This is an example of paying with Stripe.

```typescript
export class StripePaymentDelegate implements tradable.PaymentDelegate {

    async payment<U extends tradable.OrderItemProtocol, T extends tradable.OrderProtocol<U>>(order: T, options?: tradable.PaymentOptions): Promise<any> {

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
}
```

#### Tradable
Request implementation of protocol required for trading.

#### UserProtocol
Request implementation of the protocol of the user who can place an order.

#### ProductProtocol
Request implementation of protocol of product information.

#### SKUProtocol
Request implementation of SKU protocol.

#### OrderProtocol
Request implementation of Order protocol.

#### OrderItemProtocol
Request implementation of OrderItem protocol.

