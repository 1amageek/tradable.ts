"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Pring = require("pring");
const tradable = require("../src/index");
const property = Pring.property;
const isUndefined = (value) => {
    return (value === null || value === undefined || value == NaN);
};
class Order extends Pring.Base {
    constructor() {
        super(...arguments);
        this.currency = tradable.Currency.USD;
        this.amount = 0;
        this.items = new Pring.NestedCollection(this);
        this.status = tradable.OrderStatus.created;
    }
}
__decorate([
    property
], Order.prototype, "parentID", void 0);
__decorate([
    property
], Order.prototype, "buyer", void 0);
__decorate([
    property
], Order.prototype, "selledBy", void 0);
__decorate([
    property
], Order.prototype, "shippingTo", void 0);
__decorate([
    property
], Order.prototype, "paidAt", void 0);
__decorate([
    property
], Order.prototype, "expirationDate", void 0);
__decorate([
    property
], Order.prototype, "currency", void 0);
__decorate([
    property
], Order.prototype, "amount", void 0);
__decorate([
    property
], Order.prototype, "items", void 0);
__decorate([
    property
], Order.prototype, "status", void 0);
__decorate([
    property
], Order.prototype, "paymentInformation", void 0);
exports.Order = Order;
//# sourceMappingURL=order.js.map