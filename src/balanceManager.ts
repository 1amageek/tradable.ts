import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    firestore,
    timestamp,
    BalanceTransactionProtocol,
    AccountProtocol,
    Currency,
    BalanceTransactionType
} from "./index"

export class BalanceManager
    <
    BalanceTransaction extends BalanceTransactionProtocol,
    Account extends AccountProtocol<BalanceTransaction>
    > {

    private _BalanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        transaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction },
        account: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._BalanceTransaction = transaction
        this._Account = account
    }

    platform: string = "platform"

    bankAccount: string = "bank_account"

    /// Purchaser -> Platform
    async payment(purchasedBy: string, orderID: string, currency: Currency, amount: number, paymentInformation: { [key: string]: any }, transaction: FirebaseFirestore.Transaction) {

        const purchaser: Account = new this._Account(purchasedBy, {})
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payment
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = purchasedBy
        balanceTransaction.to = this.platform
        balanceTransaction.paymentInformation = paymentInformation
        transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        transaction.set(purchaser.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        return transaction
    }

    /// Platform -> Purchaser
    async paymentRefund(purchasedBy: string, orderID: string, currency: Currency, amount: number, transaction: FirebaseFirestore.Transaction) {

        const purchaser: Account = new this._Account(purchasedBy, {})
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.paymentRefund
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = this.platform
        balanceTransaction.to = purchasedBy

        transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        transaction.set(purchaser.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        return transaction
    }

    /// User -> User        from: userID, to: userID
    /// Platform -> User    from: "platform", to: userID   
    /// User -> Platform    from: userID, to: platform
    async transfer(from: string, to: string, orderID: string, currency: Currency, amount: number, transaction: FirebaseFirestore.Transaction) {

        if (from === this.platform) {
            const receiver: Account = new this._Account(to, {})
            await receiver.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transfer
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const receiverBalance = (receiver.balance.available[currency] || 0) + amount
            transaction.set(receiver.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
        } else if (to === this.platform) {
            const sender: Account = new this._Account(from, {})
            await sender.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transfer
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            transaction.set(sender.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
        } else {
            const sender: Account = new this._Account(from, {})
            const receiver: Account = new this._Account(to, {})
            await Promise.all([sender.fetch(transaction), receiver.fetch(transaction)])

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transfer
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            const receiverBalance = (receiver.balance.available[currency] || 0) + amount

            transaction.set(sender.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            transaction.set(receiver.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
        }
        return transaction
    }

    /// User -> User        from: userID, to: userID
    /// Platform -> User    from: "platform", to: userID   
    /// User -> Platform    from: userID, to: platform
    async transferRefund(from: string, to: string, orderID: string, currency: Currency, amount: number, transaction: FirebaseFirestore.Transaction) {

        if (from === this.platform) {
            const receiver: Account = new this._Account(to, {})
            await receiver.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transferRefund
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const receiverBalance = (receiver.balance.available[currency] || 0) + amount
            transaction.set(receiver.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
        } else if (to === this.platform) {
            const sender: Account = new this._Account(from, {})
            await sender.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transferRefund
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            transaction.set(sender.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
        } else {
            const sender: Account = new this._Account(from, {})
            const receiver: Account = new this._Account(to, {})
            await Promise.all([sender.fetch(transaction), receiver.fetch(transaction)])

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transferRefund
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id) as FirebaseFirestore.DocumentReference,
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            const receiverBalance = (receiver.balance.available[currency] || 0) + amount

            transaction.set(sender.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            transaction.set(receiver.reference as FirebaseFirestore.DocumentReference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
        }
        return transaction
    }

    async payout(accountID: string, orderID: string, currency: Currency, amount: number, transaction: FirebaseFirestore.Transaction) {
        const sender: Account = new this._Account(accountID, {})
        await sender.fetch(transaction)
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payout
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = accountID
        balanceTransaction.to = this.bankAccount
        transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        const senderBalance = (sender.balance.available[currency] || 0) - amount
        transaction.set(sender.reference as FirebaseFirestore.DocumentReference, {
            balance: {
                available: {
                    [currency]: senderBalance
                }
            }
        })
        return transaction
    }

    async payoutCancel(accountID: string, orderID: string, currency: Currency, amount: number, transaction: FirebaseFirestore.Transaction) {
        const receiver: Account = new this._Account(accountID, {})
        await receiver.fetch(transaction)
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payoutCancel
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = this.bankAccount
        balanceTransaction.to = accountID
        transaction.set(balanceTransaction.reference as FirebaseFirestore.DocumentReference, balanceTransaction.value(), { merge: true })
        const receiverBalance = (receiver.balance.available[currency] || 0) + amount
        transaction.set(receiver.reference as FirebaseFirestore.DocumentReference, {
            balance: {
                available: {
                    [currency]: receiverBalance
                }
            }
        })
        return transaction
    }
}