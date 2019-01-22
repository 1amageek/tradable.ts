import * as FirebaseFirestore from '@google-cloud/firestore'
import {
    BalanceTransactionProtocol,
    TransactionResult,
    PayoutProtocol,
    AccountProtocol
} from "./index"

export class PayoutManager
    <
    BalanceTransaction extends BalanceTransactionProtocol,
    Payout extends PayoutProtocol,
    Account extends AccountProtocol<BalanceTransaction, Payout>
    > {

    private _BalanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction }
    private _Payout: { new(id?: string, value?: { [key: string]: any }): Payout }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        balanceTransaction: { new(id?: string, value?: { [key: string]: any }): BalanceTransaction },
        payout: { new(id?: string, value?: { [key: string]: any }): Payout },
        user: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._BalanceTransaction = balanceTransaction
        this._Payout = payout
        this._Account = user
    }

    update(payout: Payout, transactionResult: TransactionResult, transaction: FirebaseFirestore.Transaction) {
        const payoutValue = payout.value() as any
        payoutValue.updatedAt = FirebaseFirestore.FieldValue.serverTimestamp()
        if (Object.keys(transactionResult).length > 0) {
            payoutValue["transactionResults"] = FirebaseFirestore.FieldValue.arrayUnion(transactionResult)
        }
        const payoutReference = new this._Payout(payout.id, {}).reference
        const account = new this._Account(payout.account, {})
        transaction.set(payoutReference, payoutValue, { merge: true })
        transaction.set(account.payoutRequests.reference.doc(payout.id), payoutValue, { merge: true })
    }
}