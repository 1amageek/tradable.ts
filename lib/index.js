"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Pring = require("pring");
const manager_1 = require("./manager");
exports.Manager = manager_1.Manager;
const currency_1 = require("./currency");
exports.Currency = currency_1.Currency;
exports.initialize = (app, serverTimestamp) => {
    Pring.initialize(app, serverTimestamp);
    exports.firestore = app.firestore();
    exports.timestamp = serverTimestamp;
};
var TransactionType;
(function (TransactionType) {
    TransactionType["payment"] = "payment";
    TransactionType["paymentRefund"] = "payment_refund";
    TransactionType["transfer"] = "transfer";
    TransactionType["transferRefund"] = "transfer_refund";
    TransactionType["payout"] = "payout";
    TransactionType["payoutCancel"] = "payout_cancel";
})(TransactionType = exports.TransactionType || (exports.TransactionType = {}));
var StockType;
(function (StockType) {
    StockType["bucket"] = "bucket";
    StockType["finite"] = "finite";
    StockType["infinite"] = "infinite";
})(StockType = exports.StockType || (exports.StockType = {}));
/// StockValue is used when StockType is Bucket.
var StockValue;
(function (StockValue) {
    StockValue["inStock"] = "in_stock";
    StockValue["limited"] = "limited";
    StockValue["outOfStock"] = "out_of_stock";
})(StockValue = exports.StockValue || (exports.StockValue = {}));
var OrderItemType;
(function (OrderItemType) {
    OrderItemType["sku"] = "sku";
    OrderItemType["tax"] = "tax";
    OrderItemType["shipping"] = "shipping";
    OrderItemType["discount"] = "discount";
})(OrderItemType = exports.OrderItemType || (exports.OrderItemType = {}));
var OrderStatus;
(function (OrderStatus) {
    /// Immediately after the order made
    OrderStatus["created"] = "created";
    /// Inventory processing was done, but it was rejected
    OrderStatus["rejected"] = "rejected";
    /// Inventory processing was successful
    OrderStatus["received"] = "received";
    /// Customer payment succeeded, but we do not transfer funds to the account.
    OrderStatus["paid"] = "paid";
    /// Successful inventory processing but payment failed.
    OrderStatus["waitingForPayment"] = "waitingForPayment";
    /// Payment has been refunded.
    OrderStatus["refunded"] = "refunded";
    /// If payment was made, I failed in refunding.
    OrderStatus["waitingForRefund"] = "waitingForRefund";
    /// Everything including refunds was canceled.
    OrderStatus["canceled"] = "canceled";
    /// It means that a payout has been made to the Account.
    OrderStatus["transferred"] = "transferred";
    /// It means that the transfer failed.
    OrderStatus["waitingForTransferrd"] = "waitingForTransferrd";
    /// Completed
    OrderStatus["completed"] = "completed";
})(OrderStatus = exports.OrderStatus || (exports.OrderStatus = {}));
var RefundReason;
(function (RefundReason) {
    RefundReason["duplicate"] = "duplicate";
    RefundReason["fraudulent"] = "fraudulent";
    RefundReason["requestedByCustomer"] = "requested_by_customer";
})(RefundReason = exports.RefundReason || (exports.RefundReason = {}));
var TradableErrorCode;
(function (TradableErrorCode) {
    TradableErrorCode["invalidArgument"] = "invalidArgument";
    TradableErrorCode["lessMinimumAmount"] = "lessMinimumAmount";
    TradableErrorCode["invalidCurrency"] = "invalidCurrency";
    TradableErrorCode["invalidAmount"] = "invalidAmount";
    TradableErrorCode["outOfStock"] = "outOfStock";
    TradableErrorCode["invalidStatus"] = "invalidStatus";
    TradableErrorCode["internal"] = "internal";
})(TradableErrorCode = exports.TradableErrorCode || (exports.TradableErrorCode = {}));
class TradableError {
    constructor(code, order, message, stack) {
        this.name = 'tradable.error';
        this.info = {
            code: code,
            order: {
                [order.id]: order.value()
            }
        };
        this.message = message;
        this.stack = stack || new Error().stack;
    }
}
exports.TradableError = TradableError;
//# sourceMappingURL=index.js.map