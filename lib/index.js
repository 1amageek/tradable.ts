"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const manager_1 = require("./manager");
exports.Manager = manager_1.Manager;
const currency_1 = require("./currency");
exports.Currency = currency_1.Currency;
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
    OrderStatus["unknown"] = "unknown";
    /// Immediately after the order made
    OrderStatus["created"] = "created";
    /// Inventory processing was done, but it was rejected
    OrderStatus["rejected"] = "rejected";
    /// Inventory processing was successful
    OrderStatus["received"] = "received";
    /// Payment was successful
    OrderStatus["paid"] = "paid";
    /// Successful inventory processing but payment failed.
    OrderStatus["waitingForPayment"] = "waitingForPayment";
    /// If payment was made, I failed in refunding.
    OrderStatus["waitingForRefund"] = "waitingForRefund";
    /// Everything including refunds was canceled. Inventory processing is not canceled
    OrderStatus["canceled"] = "canceled";
})(OrderStatus = exports.OrderStatus || (exports.OrderStatus = {}));
//# sourceMappingURL=index.js.map