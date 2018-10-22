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

    payment(order: string, currency: Currency, amount: number, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const transaction: BalanceTransaction = new this._BalanceTransaction()
        transaction.type = BalanceTransactionType.payment
        transaction.currency = currency
        transaction.amount = amount
        transaction.order = order
        batch.set(transaction.reference as FirebaseFirestore.DocumentReference, transaction.value(), { merge: true })
        return batch
    }

    paymentRefund(order: string, currency: Currency, amount: number, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const transaction: BalanceTransaction = new this._BalanceTransaction()
        transaction.type = BalanceTransactionType.paymentRefund
        transaction.currency = currency
        transaction.amount = amount
        transaction.order = order
        batch.set(transaction.reference as FirebaseFirestore.DocumentReference, transaction.value(), { merge: true })
        return batch
    }

    transfer(order: string, currency: Currency, amount: number, accountID: string, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const send: BalanceTransaction = new this._BalanceTransaction()
        send.type = BalanceTransactionType.transfer
        send.currency = currency
        send.amount = -amount
        send.order = order
        send.to = accountID
        batch.set(send.reference as FirebaseFirestore.DocumentReference, send.value(), { merge: true })

        const account: Account = new this._Account(accountID, {})
        const receive: BalanceTransaction = new this._BalanceTransaction(send.id)
        receive.type = BalanceTransactionType.transfer
        receive.currency = currency
        receive.amount = amount
        receive.order = order
        account.transactions.insert(receive)
        batch.set(receive.reference as FirebaseFirestore.DocumentReference, receive.value(), { merge: true })
        return batch
    }

    transferRefund(order: string, currency: Currency, amount: number, accountID: string, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const account: Account = new this._Account(accountID, {})
        const send: BalanceTransaction = new this._BalanceTransaction()
        send.type = BalanceTransactionType.transferRefund
        send.currency = currency
        send.amount = -amount
        send.order = order
        account.transactions.insert(send)
        batch.set(send.reference as FirebaseFirestore.DocumentReference, send.value(), { merge: true })

        const receive: BalanceTransaction = new this._BalanceTransaction(send.id)
        receive.type = BalanceTransactionType.transferRefund
        receive.currency = currency
        receive.amount = amount
        receive.order = order
        receive.from = accountID
        batch.set(receive.reference as FirebaseFirestore.DocumentReference, receive.value(), { merge: true })
        return batch
    }

    payout(order: string, currency: Currency, amount: number, accountID: string, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const transaction: BalanceTransaction = new this._BalanceTransaction()
        transaction.type = BalanceTransactionType.payout
        transaction.currency = currency
        transaction.amount = -amount
        transaction.order = order
        transaction.from = accountID
        batch.set(transaction.reference as FirebaseFirestore.DocumentReference, transaction.value(), { merge: true })
        return batch
    }

    payoutCancel(order: string, currency: Currency, amount: number, accountID: string, batch: FirebaseFirestore.Transaction): FirebaseFirestore.Transaction {
        const transaction: BalanceTransaction = new this._BalanceTransaction()
        transaction.type = BalanceTransactionType.payoutCancel
        transaction.currency = currency
        transaction.amount = amount
        transaction.order = order
        transaction.from = accountID
        batch.set(transaction.reference as FirebaseFirestore.DocumentReference, transaction.value(), { merge: true })
        return batch
    }
}