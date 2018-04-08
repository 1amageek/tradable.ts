"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Pring = require("pring");
const index_1 = require("./index");
const isUndefined = (value) => {
    return (value === null || value === undefined || value === NaN);
};
// 在庫の増減
// StripeAPIに接続
class Manager {
    constructor(sku, product, orderItem, order, transaction, account) {
        this._SKU = sku;
        this._Product = product;
        this._OrderItem = orderItem;
        this._Order = order;
        this._Transaction = transaction;
        this._Account = account;
    }
    execute(order, process) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // validation error
                const validationError = this.validate(order);
                if (validationError) {
                    order.status = index_1.OrderStatus.rejected;
                    try {
                        yield order.update();
                    }
                    catch (error) {
                        throw error;
                    }
                    throw validationError;
                }
                const batch = yield process(order);
                if (batch) {
                    yield batch.commit();
                }
            }
            catch (error) {
                throw error;
            }
        });
    }
    validate(order) {
        if (isUndefined(order.buyer))
            return Error(`[Tradable] Error: validation error, buyer is required`);
        if (isUndefined(order.selledBy))
            return Error(`[Tradable] Error: validation error, selledBy is required`);
        if (isUndefined(order.expirationDate))
            return Error(`[Tradable] Error: validation error, expirationDate is required`);
        if (isUndefined(order.currency))
            return Error(`[Tradable] Error: validation error, currency is required`);
        if (isUndefined(order.amount))
            return Error(`[Tradable] Error: validation error, amount is required`);
        if (!this.validateCurrency(order))
            return Error(`[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`);
        if (!this.validateAmount(order))
            return Error(`[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`);
        if (!this.validateMinimumAmount(order))
            return Error(`[Tradable] Error: validation error, Amount is below the lower limit.`);
    }
    // Returns true if there is no problem in the verification
    validateCurrency(order) {
        for (const item of order.items.objects) {
            if (item.currency !== order.currency) {
                return false;
            }
        }
        return true;
    }
    // Returns true if there is no problem in the verification
    validateAmount(order) {
        let totalAmount = 0;
        for (const item of order.items.objects) {
            totalAmount += item.amount;
        }
        if (totalAmount !== order.amount) {
            return false;
        }
        return true;
    }
    validateMinimumAmount(order) {
        const currency = order.currency;
        const amount = order.amount;
        if (0 < amount && amount < index_1.Currency.minimum(currency)) {
            return false;
        }
        return true;
    }
    inventoryControl(order) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Skip
                if (order.status === index_1.OrderStatus.received ||
                    order.status === index_1.OrderStatus.waitingForRefund ||
                    order.status === index_1.OrderStatus.paid ||
                    order.status === index_1.OrderStatus.waitingForPayment ||
                    order.status === index_1.OrderStatus.canceled) {
                    return;
                }
                order.status = index_1.OrderStatus.received;
                yield Pring.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                        const items = yield order.items.get(this._OrderItem);
                        // Stock control
                        for (const item of items) {
                            const productID = item.product;
                            const skuID = item.sku;
                            const quantity = item.quantity;
                            const product = new this._Product(productID, {});
                            const sku = yield product.skus.doc(skuID, this._SKU);
                            switch (sku.inventory.type) {
                                case index_1.StockType.finite: {
                                    const remaining = sku.inventory.quantity - (sku.unitSales + quantity);
                                    if (remaining < 0) {
                                        reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                    }
                                    const newUnitSales = sku.unitSales + quantity;
                                    transaction.update(sku.reference, { unitSales: newUnitSales });
                                    break;
                                }
                                case index_1.StockType.bucket: {
                                    switch (sku.inventory.value) {
                                        case index_1.StockValue.outOfStock: {
                                            reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                        }
                                        default: {
                                            const newUnitSales = sku.unitSales + quantity;
                                            transaction.update(sku.reference, { unitSales: newUnitSales });
                                        }
                                    }
                                }
                                case index_1.StockType.infinite: {
                                    const newUnitSales = sku.unitSales + quantity;
                                    transaction.update(sku.reference, { unitSales: newUnitSales });
                                }
                            }
                        }
                        transaction.update(order.reference, { status: index_1.OrderStatus.received });
                        resolve(`[Success] ORDER/${order.id}, USER/${order.selledBy}`);
                    }));
                }));
            }
            catch (error) {
                order.status = index_1.OrderStatus.rejected;
                try {
                    yield order.update();
                }
                catch (error) {
                    throw error;
                }
                throw error;
            }
        });
    }
    pay(order, options, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip for paid, waitingForRefund, refunded
            if (order.status === index_1.OrderStatus.paid ||
                order.status === index_1.OrderStatus.waitingForRefund ||
                order.status === index_1.OrderStatus.refunded) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.received || order.status === index_1.OrderStatus.waitingForPayment)) {
                throw new Error(`[Failure] ORDER/${order.id}, Order is not a payable status.`);
            }
            if (!options.customer && !options.source) {
                throw new Error(`[Failure] ORDER/${order.id}, PaymentOptions required customer or source`);
            }
            if (!options.vendorType) {
                throw new Error(`[Failure] ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new Error(`[Failure] ORDER/${order.id}, Manager required delegate`);
            }
            if (order.amount > 0) {
                try {
                    const result = yield this.delegate.pay(order, options);
                    order.paymentInformation = {
                        [options.vendorType]: result
                    };
                }
                catch (error) {
                    order.status = index_1.OrderStatus.waitingForPayment;
                    try {
                        yield order.update();
                    }
                    catch (error) {
                        throw error;
                    }
                    throw error;
                }
                try {
                    yield Pring.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                            const account = new this._Account(order.selledBy, {});
                            try {
                                yield account.fetch();
                            }
                            catch (error) {
                                reject(`[Failure] pay ORDER/${order.id}, Account could not be fetched.`);
                            }
                            const currency = order.currency;
                            const balance = account.balance || {};
                            const amount = balance[order.currency] || 0;
                            const newAmount = amount + order.amount;
                            transaction.set(account.reference, { balance: { [currency]: newAmount } }, { merge: true });
                            resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`);
                        }));
                    }));
                }
                catch (error) {
                    throw error;
                }
            }
            order.status = index_1.OrderStatus.paid;
            const _batch = order.pack(Pring.BatchType.update, null, batch);
            return this.transaction(order, index_1.TransactionType.payment, order.currency, order.amount, _batch);
        });
    }
    transaction(order, type, currency, amount, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = new this._Account(order.selledBy, {});
            const transaction = new this._Transaction();
            transaction.amount = amount;
            transaction.currency = currency;
            transaction.type = type;
            transaction.setParent(account.transactions);
            transaction.order = order.id;
            batch.set(transaction.reference, transaction.value());
            return batch;
        });
    }
    refund(order, options, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip for refunded
            if (order.status === index_1.OrderStatus.refunded) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.paid)) {
                throw new Error(`[Failure] ORDER/${order.id}, Order is not a refundable status.`);
            }
            if (!options.vendorType) {
                throw new Error(`[Failure] ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new Error(`[Failure] ORDER/${order.id}, Manager required delegate`);
            }
            if (order.amount > 0) {
                try {
                    const result = yield this.delegate.refund(order, options);
                    order.refundInformation = {
                        [options.vendorType]: result
                    };
                }
                catch (error) {
                    throw error;
                }
                try {
                    yield Pring.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                            const account = new this._Account(order.selledBy, {});
                            try {
                                yield account.fetch();
                            }
                            catch (error) {
                                reject(`[Failure] refund ORDER/${order.id}, Account could not be fetched.`);
                            }
                            const currency = order.currency;
                            const balance = account.balance || {};
                            const amount = balance[order.currency] || 0;
                            const newAmount = amount - order.amount;
                            transaction.set(account.reference, { balance: { [currency]: newAmount } }, { merge: true });
                            resolve(`[Success] refund ORDER/${order.id}, USER/${order.selledBy}`);
                        }));
                    }));
                }
                catch (error) {
                    throw error;
                }
            }
            order.status = index_1.OrderStatus.refunded;
            const _batch = order.pack(Pring.BatchType.update, null, batch);
            return this.transaction(order, index_1.TransactionType.paymentRefund, order.currency, order.amount, _batch);
        });
    }
}
exports.Manager = Manager;
//# sourceMappingURL=manager.js.map