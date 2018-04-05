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
    constructor(sku, product, orderItem, order) {
        this._SKU = sku;
        this._Product = product;
        this._OrderItem = orderItem;
        this._Order = order;
    }
    execute(order, process) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (isUndefined(order.buyer))
                    throw Error(`[Tradable] Error: validation error, buyer is required`);
                if (isUndefined(order.selledBy))
                    throw Error(`[Tradable] Error: validation error, selledBy is required`);
                if (isUndefined(order.expirationDate))
                    throw Error(`[Tradable] Error: validation error, expirationDate is required`);
                if (isUndefined(order.currency))
                    throw Error(`[Tradable] Error: validation error, currency is required`);
                if (isUndefined(order.amount))
                    throw Error(`[Tradable] Error: validation error, amount is required`);
                yield process(order);
                yield order.update();
            }
            catch (error) {
                throw error;
            }
        });
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
    payment(order, options) {
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
            try {
                const result = yield this.delegate.payment(order, options);
                order.paymentInformation = {
                    [options.vendorType]: result
                };
                order.status = index_1.OrderStatus.paid;
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
        });
    }
}
exports.Manager = Manager;
//# sourceMappingURL=manager.js.map