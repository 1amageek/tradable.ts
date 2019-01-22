import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    BalanceTransactionProtocol,
    AccountProtocol,
    Currency,
    TransactionResult,
    BalanceTransactionType,
    PayoutProtocol
} from "./index"

export class BalanceManager
    <
    BalanceTransaction extends BalanceTransactionProtocol,
    Payout extends PayoutProtocol,
    Account extends AccountProtocol<BalanceTransaction, Payout>
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

    static platform: string = "platform"

    static bankAccount: string = "bank_account"

    /// Purchaser -> Platform
    pay(purchasedBy: string, orderID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {

        const purchaser: Account = new this._Account(purchasedBy, {})
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payment
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = purchasedBy
        balanceTransaction.to = BalanceManager.platform
        balanceTransaction.transactionResults.push(transactionResult)
        transaction.set(balanceTransaction.reference, balanceTransaction.value(), { merge: true })
        transaction.set(purchaser.balanceTransactions.reference.doc(balanceTransaction.id), balanceTransaction.value(), { merge: true })
        return balanceTransaction
    }

    /// Platform -> Purchaser
    refund(purchasedBy: string, orderID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {

        const purchaser: Account = new this._Account(purchasedBy, {})
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.paymentRefund
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.order = orderID
        balanceTransaction.from = BalanceManager.platform
        balanceTransaction.to = purchasedBy
        balanceTransaction.transactionResults.push(transactionResult)
        transaction.set(balanceTransaction.reference, balanceTransaction.value(), { merge: true })
        transaction.set(purchaser.balanceTransactions.reference.doc(balanceTransaction.id), balanceTransaction.value(), { merge: true })
        return balanceTransaction
    }

    /// User -> User        from: userID, to: userID
    /// Platform -> User    from: "platform", to: userID   
    /// User -> Platform    from: userID, to: "platform"
    async transfer(from: string, to: string, orderID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {

        if (from === BalanceManager.platform) {
            const receiver: Account = new this._Account(to, {})
            await receiver.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transfer
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const receiverBalance = (receiver.balance.available[currency] || 0) + amount
            transaction.set(receiver.reference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
            return balanceTransaction
        } else if (to === BalanceManager.platform) {
            const sender: Account = new this._Account(from, {})
            await sender.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transfer
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            transaction.set(sender.reference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            return balanceTransaction
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
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            const receiverBalance = (receiver.balance.available[currency] || 0) + amount

            transaction.set(sender.reference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            transaction.set(receiver.reference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
            return balanceTransaction
        }
    }

    /// User -> User        from: userID, to: userID
    /// Platform -> User    from: "platform", to: userID   
    /// User -> Platform    from: userID, to: platform
    async transferRefund(from: string, to: string, orderID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {

        if (from === BalanceManager.platform) {
            const receiver: Account = new this._Account(to, {})
            await receiver.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transferRefund
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const receiverBalance = (receiver.balance.available[currency] || 0) + amount
            transaction.set(receiver.reference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
            return balanceTransaction
        } else if (to === BalanceManager.platform) {
            const sender: Account = new this._Account(from, {})
            await sender.fetch(transaction)

            const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
            balanceTransaction.type = BalanceTransactionType.transferRefund
            balanceTransaction.currency = currency
            balanceTransaction.amount = amount
            balanceTransaction.order = orderID
            balanceTransaction.from = from
            balanceTransaction.to = to
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            transaction.set(sender.reference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            return balanceTransaction
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
            balanceTransaction.transactionResults.push(transactionResult)

            transaction.set(balanceTransaction.reference,
                balanceTransaction.value(),
                { merge: true })
            transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })
            transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id),
                balanceTransaction.value(),
                { merge: true })

            const senderBalance = (sender.balance.available[currency] || 0) - amount
            const receiverBalance = (receiver.balance.available[currency] || 0) + amount

            transaction.set(sender.reference, {
                balance: {
                    available: {
                        [currency]: senderBalance
                    }
                }
            })
            transaction.set(receiver.reference, {
                balance: {
                    available: {
                        [currency]: receiverBalance
                    }
                }
            })
            return balanceTransaction
        }
    }

    async payout(accountID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {
        const sender: Account = new this._Account(accountID, {})
        await sender.fetch(transaction)
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payout
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.from = accountID
        balanceTransaction.to = BalanceManager.bankAccount
        balanceTransaction.transactionResults.push(transactionResult)
        transaction.set(balanceTransaction.reference, balanceTransaction.value(), { merge: true })
        transaction.set(sender.balanceTransactions.reference.doc(balanceTransaction.id),
            balanceTransaction.value(),
            { merge: true })
        const senderBalance = (sender.balance.available[currency] || 0) - amount
        transaction.set(sender.reference, {
            balance: {
                available: {
                    [currency]: senderBalance
                }
            }
        })
        return balanceTransaction
    }

    async payoutCancel(accountID: string, currency: Currency, amount: number, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {
        const receiver: Account = new this._Account(accountID, {})
        await receiver.fetch(transaction)
        const balanceTransaction: BalanceTransaction = new this._BalanceTransaction()
        balanceTransaction.type = BalanceTransactionType.payoutCancel
        balanceTransaction.currency = currency
        balanceTransaction.amount = amount
        balanceTransaction.from = BalanceManager.bankAccount
        balanceTransaction.to = accountID
        balanceTransaction.transactionResults.push(transactionResult)
        transaction.set(balanceTransaction.reference, balanceTransaction.value(), { merge: true })
        transaction.set(receiver.balanceTransactions.reference.doc(balanceTransaction.id),
            balanceTransaction.value(),
            { merge: true })
        const receiverBalance = (receiver.balance.available[currency] || 0) + amount
        transaction.set(receiver.reference, {
            balance: {
                available: {
                    [currency]: receiverBalance
                }
            }
        })
        return balanceTransaction
    }
}