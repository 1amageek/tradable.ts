import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Pring from 'pring'
import {
    firestore,
    timestamp,
    SKUProtocol,
    OrderItemProtocol,
    ProductProtocol,
    OrderProtocol,
    TransactionProtocol,
    AccountProtocol,
    StockType,
    StockValue,
    OrderStatus,
    TransactionDelegate,
    ChargeOptions,
    RefundOptions,
    CancelOptions,
    Currency,
    TransactionType,
    Balance,
    TransferOptions,
    TradableErrorCode,
    TradableError
} from "./index"

export class StockManager
    <
    SKU extends TransactionProtocol,
    Account extends AccountProtocol<Transaction>
    > {

    private _Transaction: { new(id?: string, value?: { [key: string]: any }): Transaction }
    private _Account: { new(id?: string, value?: { [key: string]: any }): Account }

    constructor(
        transaction: { new(id?: string, value?: { [key: string]: any }): Transaction },
        account: { new(id?: string, value?: { [key: string]: any }): Account }
    ) {
        this._Transaction = transaction
        this._Account = account
    }
}