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
// 在庫の増減
// StripeAPIに接続
class Manager {
    constructor(sku, product, orderItem, order) {
        this._SKU = sku;
        this._Product = product;
        this._OrderItem = orderItem;
        this._Order = order;
    }
    execute(order) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield Pring.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                        const items = yield order.items.get(this._OrderItem);
                        // Stock control
                        for (const item of items) {
                            const skuID = item.sku;
                            const quantity = item.quantity;
                            const sku = new this._SKU(skuID, {});
                            yield sku.fetch();
                            switch (sku.inventory.type) {
                                case index_1.StockType.finite: {
                                    const newQty = sku.inventory.quantity - quantity;
                                    if (newQty < 0) {
                                        reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                    }
                                    transaction.update(sku.reference, { inventory: { quantity: newQty } });
                                    break;
                                }
                                case index_1.StockType.bucket: {
                                    switch (sku.inventory.value) {
                                        case index_1.StockValue.outOfStock: {
                                            reject(`[Failure] ORDER/${order.id}, [StockType ${sku.inventory.type}] SKU/${sku.id} is out of stock.`);
                                        }
                                        default: break;
                                    }
                                }
                                case index_1.StockType.infinite: break;
                                default: break;
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
}
exports.Manager = Manager;
//# sourceMappingURL=manager.js.map