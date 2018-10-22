"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FirebaseFirestore = require("@google-cloud/firestore");
const index_1 = require("./index");
const isUndefined = (value) => {
    return (value === null || value === undefined || value === NaN);
};
// export interface TransactionProcess {
//     <T extends OrderItemProtocol, U extends OrderProtocol<T>>(amount:transaction: FirebaseFirestore.Transaction): Promise<void>
// }
var InventoryControlType;
(function (InventoryControlType) {
    InventoryControlType["increase"] = "increase";
    InventoryControlType["decrease"] = "decrease";
})(InventoryControlType || (InventoryControlType = {}));
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
    async execute(order, process, batch) {
        try {
            // validation error
            const validationError = await this.validate(order);
            if (validationError) {
                order.status = index_1.OrderStatus.rejected;
                try {
                    await order.update();
                }
                catch (error) {
                    throw error;
                }
                throw validationError;
            }
            const _batch = batch || index_1.firestore.batch();
            const __batch = await process(order, _batch);
            if (__batch) {
                await __batch.commit();
            }
        }
        catch (error) {
            throw error;
        }
    }
    async validate(order) {
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
            const items = await order.items.get(this);
            if (!this.validateCurrency(order, items))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidCurrency, order, `[Tradable] Error: validation error, Currency of OrderItem does not match Currency of Order.`);
            if (!this.validateAmount(order, items))
                return new index_1.TradableError(index_1.TradableErrorCode.invalidAmount, order, `[Tradable] Error: validation error, The sum of OrderItem does not match Amount of Order.`);
        }
        catch (error) {
            return error;
        }
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
    async inventory(type, order, item, transaction, resolve, reject) {
        const productID = item.product;
        const skuID = item.sku;
        if (!productID) {
            const error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, `[Failure] ORDER/${order.id} Order requires productID..`);
            reject(error);
            return;
        }
        if (!skuID) {
            const error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, `[Failure] ORDER/${order.id} Order requires skuID.`);
            reject(error);
            return;
        }
        let quantity = 0;
        switch (type) {
            case InventoryControlType.increase:
                quantity = item.quantity;
                break;
            case InventoryControlType.decrease:
                quantity = -item.quantity;
                break;
        }
        const product = new this._Product(productID, {});
        const sku = await product.skus.doc(skuID, this._SKU, transaction);
        if (!sku) {
            const error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, `[Failure] ORDER/${order.id} PRODUCT/${product.id} invalid sku.`);
            reject(error);
            return;
        }
        const unitSales = sku.unitSales || 0;
        switch (sku.inventory.type) {
            case index_1.StockType.finite: {
                const skuQuantity = sku.inventory.quantity;
                if (!skuQuantity) {
                    const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                    reject(error);
                    return;
                }
                const newUnitSales = unitSales + quantity;
                const remaining = skuQuantity - quantity;
                if (remaining < 0) {
                    const error = new index_1.TradableError(index_1.TradableErrorCode.outOfStock, order, `[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                    reject(error);
                }
                transaction.set(sku.reference, {
                    updateAt: index_1.timestamp,
                    unitSales: newUnitSales,
                    inventory: {
                        quantity: remaining
                    }
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
                        const newUnitSales = unitSales + quantity;
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
                const newUnitSales = unitSales + quantity;
                transaction.set(sku.reference, {
                    updateAt: index_1.timestamp,
                    unitSales: newUnitSales
                }, { merge: true });
                break;
            }
        }
    }
    async inventoryControl(order, batch) {
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
            await index_1.firestore.runTransaction(async (transaction) => {
                return new Promise(async (resolve, reject) => {
                    const items = await order.items.get(this._OrderItem, transaction);
                    for (const item of items) {
                        await this.inventory(InventoryControlType.increase, order, item, transaction, resolve, reject);
                    }
                    transaction.set(order.reference, {
                        updateAt: index_1.timestamp,
                        status: index_1.OrderStatus.received
                    }, { merge: true });
                    resolve(`[Success] ORDER/${order.id}, USER/${order.selledBy}`);
                });
            });
        }
        catch (error) {
            order.status = index_1.OrderStatus.rejected;
            try {
                await order.update();
            }
            catch (error) {
                throw error;
            }
            throw error;
        }
    }
    async charge(order, options, batch) {
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
        if (!options.vendorType) {
            throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] pay ORDER/${order.id}, ChargeOptions required vendorType`);
        }
        const delegate = this.delegate;
        if (!delegate) {
            throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] cancel ORDER/${order.id}, Manager required delegate`);
        }
        if (order.amount === 0) {
            order.status = index_1.OrderStatus.paid;
            batch.set(order.reference, {
                updateAt: index_1.timestamp,
                status: index_1.OrderStatus.paid
            }, { merge: true });
            return batch;
        }
        else {
            if (!options.customer && !options.source) {
                throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] pay ORDER/${order.id}, ChargeOptions required customer or source`);
            }
            try {
                order.status = index_1.OrderStatus.paid;
                const result = await delegate.charge(order, options);
                await index_1.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const targetOrder = new this._Order(order.id, {});
                            await targetOrder.fetch(transaction);
                            if (targetOrder.status === index_1.OrderStatus.paid ||
                                targetOrder.status === index_1.OrderStatus.waitingForRefund ||
                                targetOrder.status === index_1.OrderStatus.refunded ||
                                targetOrder.status === index_1.OrderStatus.transferred ||
                                targetOrder.status === index_1.OrderStatus.waitingForTransferrd) {
                                resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`);
                                return;
                            }
                            const account = new this._Account(targetOrder.selledBy, {});
                            await account.fetch(transaction);
                            const amount = targetOrder.amount;
                            const commissionRate = account.commissionRate;
                            const fee = amount * commissionRate;
                            const transfer = amount - fee;
                            console.log(`[Tradable] pay currency: ${index_1.Currency} amount: ${amount} commissionRate: ${commissionRate} fee: ${fee} transfer: ${transfer}`);
                            const currency = targetOrder.currency;
                            const balance = account.balance || { accountsReceivable: {}, available: {} };
                            const accountsReceivable = balance.accountsReceivable;
                            const amountOfAccountsReceivable = accountsReceivable[currency] || 0;
                            const newAmount = amountOfAccountsReceivable + transfer;
                            const revenue = account.revenue || {};
                            const amountOfRevenue = revenue[currency] || 0;
                            const newRevenue = amountOfRevenue + transfer;
                            const sales = account.sales || {};
                            const amountOfSales = sales[currency] || 0;
                            const newSales = amountOfSales + amount;
                            const trans = new this._Transaction(order.id, {});
                            trans.type = index_1.TransactionType.payment;
                            trans.amount = transfer;
                            trans.currency = currency;
                            trans.order = order.id;
                            transaction.set(trans.reference, trans.value, { merge: true });
                            // set account data
                            transaction.set(account.reference, {
                                updateAt: index_1.timestamp,
                                revenue: { [currency]: newRevenue },
                                sales: { [currency]: newSales },
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
                                status: index_1.OrderStatus.paid
                            }, { merge: true });
                            resolve(`[Success] pay ORDER/${order.id}, USER/${order.selledBy}`);
                        }
                        catch (error) {
                            let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                            reject(_error);
                        }
                    });
                });
            }
            catch (error) {
                order.status = index_1.OrderStatus.waitingForPayment;
                try {
                    await order.update();
                }
                catch (error) {
                    throw error;
                }
                throw error;
            }
        }
    }
    async order(order, options, batch) {
        try {
            await this.inventoryControl(order, batch);
            return await this.charge(order, options, batch);
        }
        catch (error) {
            throw error;
        }
    }
    async cancel(order, options, batch) {
        // Skip for refunded
        if (order.status === index_1.OrderStatus.refunded) {
            return;
        }
        if (!(order.status === index_1.OrderStatus.paid)) {
            throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] cancel ORDER/${order.id}, Order is not a changeable status.`);
        }
        if (!options.vendorType) {
            throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] cancel ORDER/${order.id}, PaymentOptions required vendorType`);
        }
        const delegate = this.delegate;
        if (!delegate) {
            throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] cancel ORDER/${order.id}, Manager required delegate`);
        }
        if (order.amount === 0) {
            try {
                await index_1.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const items = await order.items.get(this._OrderItem, transaction);
                            for (const item of items) {
                                await this.inventory(InventoryControlType.decrease, order, item, transaction, resolve, reject);
                            }
                            transaction.set(order.reference, {
                                status: index_1.OrderStatus.canceled
                            }, { merge: true });
                            resolve(`[Success] cancel ORDER/${order.id}, USER/${order.selledBy}`);
                        }
                        catch (error) {
                            let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                            reject(_error);
                        }
                    });
                });
            }
            catch (error) {
                throw error;
            }
        }
        else {
            try {
                await index_1.firestore.runTransaction(async (transaction) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const items = await order.items.get(this._OrderItem, transaction);
                            const paymentTransaction = await this._Transaction.
                                for();
                            const item;
                            of;
                            items;
                        }
                        finally { }
                    });
                    {
                        this.inventory(InventoryControlType.decrease, order, item, transaction, resolve, reject);
                    }
                    const account = new this._Account(order.selledBy, {});
                    await account.fetch(transaction);
                    const currency = order.currency;
                    const amount = order.amount;
                    const commissionRate = account.commissionRate;
                    const fee = amount * commissionRate;
                    const transfer = amount - fee;
                    const revenueWithCurrency = account.revenue[order.currency] || 0;
                    const newRevenueWithCurrency = revenueWithCurrency - transfer;
                    const balance = account.balance || { accountsReceivable: {}, available: {} };
                    const accountsReceivable = balance.accountsReceivable;
                    const accountsReceivableWithCurrency = accountsReceivable[order.currency] || 0;
                    const newAccountsReceivable = accountsReceivableWithCurrency - transfer;
                    const sales = account.sales || {};
                    const amountOfSales = sales[currency] || 0;
                    const newSales = amountOfSales - amount;
                    const result = await delegate.cancel(order, options);
                    // set account data
                    transaction.set(account.reference, {
                        updateAt: index_1.timestamp,
                        revenue: { [currency]: newRevenueWithCurrency },
                        sales: { [currency]: newSales },
                        balance: {
                            accountsReceivable: { [currency]: newAccountsReceivable }
                        }
                    }, { merge: true });
                    // set order data
                    transaction.set(order.reference, {
                        status: index_1.OrderStatus.canceled,
                        refundInformation: {
                            [options.vendorType]: result
                        }
                    }, { merge: true });
                    resolve(`[Success] cancel ORDER/${order.id}, USER/${order.selledBy}`);
                });
                try { }
                catch (error) {
                    let _error = new index_1.TradableError(index_1.TradableErrorCode.internal, order, error.message, error.stack);
                    reject(_error);
                }
            }
            finally { }
        }
    }
    catch(error) {
        throw error;
    }
}
exports.Manager = Manager;
async;
refund(order, Order, options, RefundOptions, batch, FirebaseFirestore.WriteBatch);
Promise < FirebaseFirestore.WriteBatch | void  > {
    // Skip for refunded
    if(order, status) { }
} === index_1.OrderStatus.refunded;
{
    return;
}
if (!(order.status === index_1.OrderStatus.paid || order.status === index_1.OrderStatus.transferred || order.status === index_1.OrderStatus.waitingForTransferrd)) {
    throw new index_1.TradableError(index_1.TradableErrorCode.invalidStatus, order, `[Failure] refund ORDER/${order.id}, Order is not a refundable status.`);
}
if (!options.vendorType) {
    throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, PaymentOptions required vendorType`);
}
const delegate = this.delegate;
if (!delegate) {
    throw new index_1.TradableError(index_1.TradableErrorCode.invalidArgument, order, `[Failure] refund ORDER/${order.id}, Manager required delegate`);
}
if (order.amount === 0) {
    order.status = index_1.OrderStatus.refunded;
    batch.set(order.reference, {
        updateAt: index_1.timestamp,
        status: index_1.OrderStatus.refunded
    }, { merge: true });
    return batch;
}
else {
    try {
        order.status = index_1.OrderStatus.refunded;
        const result = await delegate.refund(order, options);
        await index_1.firestore.runTransaction(async (transaction) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const account = new this._Account(order.selledBy, {});
                    await account.fetch(transaction);
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
            });
        });
    }
    catch (error) {
        order.status = index_1.OrderStatus.waitingForRefund;
        try {
            await order.update();
        }
        catch (error) {
            throw error;
        }
        throw error;
    }
}
async;
transfer(order, Order, options, TransferOptions, batch, FirebaseFirestore.WriteBatch);
Promise < FirebaseFirestore.WriteBatch | void  > {
    // Skip for 
    if(order, status) { }
} === index_1.OrderStatus.transferred;
{
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
if (order.amount === 0) {
    order.status = index_1.OrderStatus.transferred;
    batch.set(order.reference, {
        updateAt: index_1.timestamp,
        status: index_1.OrderStatus.transferred
    }, { merge: true });
    return batch;
}
else {
    try {
        order.status = index_1.OrderStatus.transferred;
        const result = await this.delegate.transfer(order, options);
        await index_1.firestore.runTransaction(async (transaction) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const targetOrder = new this._Order(order.id, {});
                    await targetOrder.fetch(transaction);
                    if (targetOrder.status === index_1.OrderStatus.transferred) {
                        resolve(`[Success] transfer ORDER/${order.id}, USER/${order.selledBy}`);
                        return;
                    }
                    const account = new this._Account(targetOrder.selledBy, {});
                    await account.fetch(transaction);
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
            });
        });
    }
    catch (error) {
        order.status = index_1.OrderStatus.waitingForTransferrd;
        try {
            await order.update();
        }
        catch (error) {
            throw error;
        }
        throw error;
    }
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
async;
complete(order, Order, batch, FirebaseFirestore.WriteBatch);
Promise < FirebaseFirestore.WriteBatch | void  > {
    if(order, status) { }
} === index_1.OrderStatus.completed;
{
    return;
}
batch.set(order.reference, {
    updateAt: index_1.timestamp,
    status: index_1.OrderStatus.completed
}, { merge: true });
return batch;
//# sourceMappingURL=manager.js.map