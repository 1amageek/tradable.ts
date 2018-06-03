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
    execute(order, process, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // validation error
                const validationError = yield this.validate(order);
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
                const _batch = batch || index_1.firestore.batch();
                const __batch = yield process(order, _batch);
                if (__batch) {
                    yield __batch.commit();
                }
            }
            catch (error) {
                throw error;
            }
        });
    }
    validate(order) {
        return __awaiter(this, void 0, void 0, function* () {
            if (isUndefined(order.buyer))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, buyer is required`);
            if (isUndefined(order.selledBy))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, selledBy is required`);
            if (isUndefined(order.expirationDate))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, expirationDate is required`);
            if (isUndefined(order.currency))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, currency is required`);
            if (isUndefined(order.amount))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, amount is required`);
            if (!this.validateMinimumAmount(order))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Tradable] Error: validation error, Amount is below the lower limit.`);
            try {
                const items = yield order.items.get(this._OrderItem);
                if (!this.validateCurrency(order, items))
                    return new index_1.TradableError(index_1.TradableErrorCode.invalidCurrency, order, `[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`);
                if (!this.validateAmount(order, items))
                    return new index_1.TradableError(index_1.TradableErrorCode.invalidAmount, order, `[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`);
            }
            catch (error) {
                return error;
            }
        });
    }
    validateMinimumAmount(order) {
        const currency = order.currency;
        const amount = order.amount;
        if (0 < amount && amount < index_1.Currency.minimum(currency)) {
            return false;
        }
        return true;
    }
    // Returns true if there is no problem in the verification
    validateCurrency(order, orderItems) {
        for (const item of orderItems) {
            if (item.currency !== order.currency) {
                return false;
            }
        }
        return true;
    }
    // Returns true if there is no problem in the verification
    validateAmount(order, orderItems) {
        let totalAmount = 0;
        for (const item of orderItems) {
            totalAmount += (item.amount * item.quantity);
        }
        if (totalAmount !== order.amount) {
            return false;
        }
        return true;
    }
    inventoryControl(order, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip
            if (order.status === index_1.OrderStatus.received ||
                order.status === index_1.OrderStatus.paid ||
                order.status === index_1.OrderStatus.waitingForPayment ||
                order.status === index_1.OrderStatus.transferred ||
                order.status === index_1.OrderStatus.waitingForTransferrd ||
                order.status === index_1.OrderStatus.refunded ||
                order.status === index_1.OrderStatus.waitingForRefund ||
                order.status === index_1.OrderStatus.canceled) {
                return;
            }
            try {
                order.status = index_1.OrderStatus.received;
                yield index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
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
                                        const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                        reject(error);
                                    }
                                    const newUnitSales = sku.unitSales + quantity;
                                    transaction.set(sku.reference, {
                                        updateAt: index_1.timestamp,
                                        unitSales: newUnitSales
                                    }, { merge: true });
                                    break;
                                }
                                case index_1.StockType.bucket: {
                                    switch (sku.inventory.value) {
                                        case index_1.StockValue.outOfStock: {
                                            const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                            reject(error);
                                            break;
                                        }
                                        default: {
                                            const newUnitSales = sku.unitSales + quantity;
                                            transaction.set(sku.reference, {
                                                updateAt: index_1.timestamp,
                                                unitSales: newUnitSales
                                            }, { merge: true });
                                            break;
                                        }
                                    }
                                    break;
                                }
                                case index_1.StockType.infinite: {
                                    const newUnitSales = sku.unitSales + quantity;
                                    transaction.set(sku.reference, {
                                        updateAt: index_1.timestamp,
                                        unitSales: newUnitSales
                                    }, { merge: true });
                                    break;
                                }
                            }
                        }
                        transaction.set(order.reference, {
                            updateAt: index_1.timestamp,
                            status: index_1.OrderStatus.received
                        }, { merge: true });
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
                order.status === index_1.OrderStatus.refunded ||
                order.status === index_1.OrderStatus.transferred ||
                order.status === index_1.OrderStatus.waitingForTransferrd) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.received || order.status === index_1.OrderStatus.waitingForPayment)) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] pay ORDER/${order.id}, Order is not a payable status.`);
            }
            if (!options.customer && !options.source) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] pay ORDER/${order.id}, PaymentOptions required customer or source`);
            }
            if (!options.vendorType) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] pay ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] pay ORDER/${order.id}, Manager required delegate`);
            }
            if (order.amount === 0) {
                try {
                    order.status = index_1.OrderStatus.paid;
                    const result = yield this.delegate.pay(order, options);
                    yield index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                            try {
                                const targetOrder = new this._Order(order.id, {});
                                yield targetOrder.fetch(transaction);
                                if (targetOrder.status === index_1.OrderStatus.paid ||
                                    targetOrder.status === index_1.OrderStatus.waitingForRefund ||
                                    targetOrder.status === index_1.OrderStatus.refunded ||
                                    targetOrder.status === index_1.OrderStatus.transferred ||
                                    targetOrder.status === index_1.OrderStatus.waitingForTransferrd) {
                                    resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`);
                                    return;
                                }
                                const account = new this._Account(targetOrder.selledBy, {});
                                yield account.fetch(transaction);
                                const amount = targetOrder.amount;
                                const commissionRatio = account.commissionRatio;
                                const fee = amount * commissionRatio;
                                const net = amount - fee;
                                console.log(`[Tradable] pay currency: ${index_1.Currency} amount: ${amount} commissionRatio: ${commissionRatio} fee: ${fee} net: ${net}`);
                                const currency = targetOrder.currency;
                                const balance = account.balance || { accountsReceivable: {}, available: {} };
                                const accountsReceivable = balance.accountsReceivable;
                                const amountOfAccountsReceivable = accountsReceivable[currency] || 0;
                                const newAmount = amountOfAccountsReceivable + net;
                                const revenue = account.revenue || {};
                                const amountOfRevenue = revenue[currency] || 0;
                                const newRevenue = amountOfRevenue + amount;
                                // set account data
                                transaction.set(account.reference, {
                                    updateAt: index_1.timestamp,
                                    revenue: { [currency]: newRevenue },
                                    balance: {
                                        accountsReceivable: { [currency]: newAmount }
                                    }
                                }, { merge: true });
                                // set order data
                                transaction.set(order.reference, {
                                    updateAt: index_1.timestamp,
                                    paymentInformation: {
                                        [options.vendorType]: result
                                    },
                                    fee: fee,
                                    net: net,
                                    status: index_1.OrderStatus.paid
                                }, { merge: true });
                                resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`);
                            }
                            catch (error) {
                                let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                                reject(_error);
                            }
                        }));
                    }));
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
            }
            else {
                order.status = index_1.OrderStatus.paid;
                batch.set(order.reference, {
                    updateAt: index_1.timestamp,
                    status: index_1.OrderStatus.paid
                }, { merge: true });
                return batch;
            }
        });
    }
    inventry(order, item, transaction, resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            const productID = item.product;
            const skuID = item.sku;
            const quantity = item.quantity;
            const product = new this._Product(productID, {});
            const sku = yield product.skus.doc(skuID, this._SKU, transaction);
            switch (sku.inventory.type) {
                case index_1.StockType.finite: {
                    const remaining = sku.inventory.quantity - (sku.unitSales + quantity);
                    if (remaining < 0) {
                        const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                        reject(error);
                    }
                    const newUnitSales = sku.unitSales + quantity;
                    transaction.set(sku.reference, {
                        updateAt: index_1.timestamp,
                        unitSales: newUnitSales
                    }, { merge: true });
                    break;
                }
                case index_1.StockType.bucket: {
                    switch (sku.inventory.value) {
                        case index_1.StockValue.outOfStock: {
                            if (quantity > 0) {
                                const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                reject(error);
                            }
                            break;
                        }
                        default: {
                            const newUnitSales = sku.unitSales + quantity;
                            transaction.set(sku.reference, {
                                updateAt: index_1.timestamp,
                                unitSales: newUnitSales
                            }, { merge: true });
                            break;
                        }
                    }
                    break;
                }
                case index_1.StockType.infinite: {
                    const newUnitSales = sku.unitSales + quantity;
                    transaction.set(sku.reference, {
                        updateAt: index_1.timestamp,
                        unitSales: newUnitSales
                    }, { merge: true });
                    break;
                }
            }
        });
    }
    change(order, item, options, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip for refunded
            if (order.status === index_1.OrderStatus.refunded) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.paid)) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] refund ORDER/${order.id}, Order is not a changeable status.`);
            }
            if (!options.vendorType) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, Manager required delegate`);
            }
            const result = yield this.delegate.change(order, item, options);
            try {
                yield index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            this.inventry(order, item, transaction, resolve, reject);
                            const account = new this._Account(order.selledBy, {});
                            yield account.fetch(transaction);
                            const currency = order.currency;
                            const balance = account.balance || { accountsReceivable: {}, available: {} };
                            const accountsReceivable = balance.accountsReceivable;
                            const amountAccountsReceivable = accountsReceivable[order.currency] || 0;
                            const newAmount = amountAccountsReceivable - item.amount;
                            // set account data
                            transaction.set(account.reference, {
                                accountsReceivable: {
                                    available: { [currency]: newAmount }
                                }
                            }, { merge: true });
                            // set order data
                            transaction.set(order.reference, {
                                refundInformation: {
                                    [options.vendorType]: result
                                }
                            }, { merge: true });
                            resolve(`[Success] change ORDER/${order.id}/${item.id}, USER/${order.selledBy}`);
                        }
                        catch (error) {
                            let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                            reject(_error);
                        }
                    }));
                }));
            }
            catch (error) {
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
    refund(order, options, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip for refunded
            if (order.status === index_1.OrderStatus.refunded) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.paid || order.status === index_1.OrderStatus.transferred || order.status === index_1.OrderStatus.waitingForTransferrd)) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] refund ORDER/${order.id}, Order is not a refundable status.`);
            }
            if (!options.vendorType) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, Manager required delegate`);
            }
            if (order.amount === 0) {
                try {
                    order.status = index_1.OrderStatus.refunded;
                    const result = yield this.delegate.refund(order, options);
                    yield index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                            try {
                                const account = new this._Account(order.selledBy, {});
                                yield account.fetch(transaction);
                                if (order.status === index_1.OrderStatus.transferred) {
                                    const currency = order.currency;
                                    const net = order.net;
                                    const balance = account.balance || { accountsReceivable: {}, available: {} };
                                    const available = balance.available;
                                    const amountOfAvailable = available[order.currency] || 0;
                                    const newAmount = amountOfAvailable - net;
                                    // set account data
                                    transaction.set(account.reference, {
                                        balance: {
                                            available: { [currency]: newAmount }
                                        }
                                    }, { merge: true });
                                    // set order data
                                    transaction.set(order.reference, {
                                        refundInformation: {
                                            [options.vendorType]: result
                                        },
                                        status: index_1.OrderStatus.refunded
                                    }, { merge: true });
                                }
                                else {
                                    const currency = order.currency;
                                    const net = order.net;
                                    const balance = account.balance || { accountsReceivable: {}, available: {} };
                                    const accountsReceivable = balance.accountsReceivable;
                                    const amountAccountsReceivable = accountsReceivable[order.currency] || 0;
                                    const newAmount = amountAccountsReceivable - net;
                                    // set account data
                                    transaction.set(account.reference, {
                                        accountsReceivable: {
                                            available: { [currency]: newAmount }
                                        }
                                    }, { merge: true });
                                    // set order data
                                    transaction.set(order.reference, {
                                        refundInformation: {
                                            [options.vendorType]: result
                                        },
                                        status: index_1.OrderStatus.refunded
                                    }, { merge: true });
                                }
                                resolve(`[Success] refund ORDER/${order.id}, USER/${order.selledBy}`);
                            }
                            catch (error) {
                                let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                                reject(_error);
                            }
                        }));
                    }));
                }
                catch (error) {
                    order.status = index_1.OrderStatus.waitingForRefund;
                    try {
                        yield order.update();
                    }
                    catch (error) {
                        throw error;
                    }
                    throw error;
                }
            }
            else {
                order.status = index_1.OrderStatus.refunded;
                batch.set(order.reference, {
                    updateAt: index_1.timestamp,
                    status: index_1.OrderStatus.refunded
                }, { merge: true });
                return batch;
            }
        });
    }
    transfer(order, options, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Skip for 
            if (order.status === index_1.OrderStatus.transferred) {
                return;
            }
            if (!(order.status === index_1.OrderStatus.paid || order.status === index_1.OrderStatus.waitingForTransferrd)) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] transfer ORDER/${order.id}, Order is not a transferable status.`);
            }
            if (!options.vendorType) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] transfer ORDER/${order.id}, PaymentOptions required vendorType`);
            }
            if (!this.delegate) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] transfer ORDER/${order.id}, Manager required delegate`);
            }
            if (order.amount > 0) {
                try {
                    order.status = index_1.OrderStatus.transferred;
                    const result = yield this.delegate.transfer(order, options);
                    yield index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                            try {
                                const targetOrder = new this._Order(order.id, {});
                                yield targetOrder.fetch(transaction);
                                if (targetOrder.status === index_1.OrderStatus.transferred) {
                                    resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}`);
                                    return;
                                }
                                const account = new this._Account(targetOrder.selledBy, {});
                                yield account.fetch(transaction);
                                const currency = targetOrder.currency;
                                const balance = account.balance || { accountsReceivable: {}, available: {} };
                                const accountsReceivable = balance.accountsReceivable;
                                const available = balance.available;
                                const net = targetOrder.net;
                                const accountsReceivableAmount = accountsReceivable[targetOrder.currency] || 0;
                                const availableAmount = available[targetOrder.currency] || 0;
                                const newAccountsReceivableAmount = accountsReceivableAmount - net;
                                const newAvailableAmount = availableAmount + net;
                                // set account data
                                transaction.set(account.reference, {
                                    balance: {
                                        accountsReceivable: { [currency]: newAccountsReceivableAmount },
                                        available: { [currency]: newAvailableAmount }
                                    }
                                }, { merge: true });
                                // set transaction data
                                const trans = new this._Transaction();
                                trans.amount = targetOrder.amount;
                                trans.fee = targetOrder.fee;
                                trans.net = targetOrder.net;
                                trans.currency = currency;
                                trans.type = index_1.TransactionType.transfer;
                                trans.setParent(account.transactions);
                                trans.order = targetOrder.id;
                                trans.information = {
                                    [options.vendorType]: result
                                };
                                transaction.set(trans.reference, trans.value());
                                // set order data
                                transaction.set(targetOrder.reference, {
                                    transferInformation: {
                                        [options.vendorType]: result
                                    },
                                    transferredTo: { [trans.id]: true },
                                    status: index_1.OrderStatus.transferred
                                }, { merge: true });
                                resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}, TRANSACTION/${trans.id}`);
                            }
                            catch (error) {
                                let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                                reject(_error);
                            }
                        }));
                    }));
                }
                catch (error) {
                    order.status = index_1.OrderStatus.waitingForTransferrd;
                    try {
                        yield order.update();
                    }
                    catch (error) {
                        throw error;
                    }
                    throw error;
                }
            }
            else {
                order.status = index_1.OrderStatus.transferred;
                batch.set(order.reference, {
                    updateAt: index_1.timestamp,
                    status: index_1.OrderStatus.transferred
                }, { merge: true });
                return batch;
            }
        });
    }
    // async payout(account: Account, currency: Currency, batch?: FirebaseFirestore.WriteBatch) {
    //     if (!account.isSigned) {
    //         throw new TradableError(order, `[Failure] ACCOUNT/${account.id}, This account has not agreed to the terms of service.`)
    //     }
    //     const balance = account.balance
    //     const amount: number = balance[currency]
    //     try {
    //         const result = await this.delegate.payout(account, amount, currency)
    //     } catch (error) {
    //         throw error
    //     }
    // }
    complete(order, batch) {
        return __awaiter(this, void 0, void 0, function* () {
            if (order.status === index_1.OrderStatus.completed) {
                return;
            }
            batch.set(order.reference, {
                updateAt: index_1.timestamp,
                status: index_1.OrderStatus.completed
            }, { merge: true });
            return batch;
        });
    }
}
exports.Manager = Manager;
//# sourceMappingURL=manager.js.map