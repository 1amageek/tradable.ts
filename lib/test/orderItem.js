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
require("reflect-metadata");
const property = Pring.property;
class OrderItem extends Pring.Base {
    constructor() {
        super(...arguments);
        this.type = tradable.OrderItemType.sku;
        this.quantity = 0;
        this.amount = 0;
    }
}
__decorate([
    property
], OrderItem.prototype, "order", void 0);
__decorate([
    property
], OrderItem.prototype, "buyer", void 0);
__decorate([
    property
], OrderItem.prototype, "selledBy", void 0);
__decorate([
    property
], OrderItem.prototype, "type", void 0);
__decorate([
    property
], OrderItem.prototype, "sku", void 0);
__decorate([
    property
], OrderItem.prototype, "quantity", void 0);
__decorate([
    property
], OrderItem.prototype, "amount", void 0);
exports.OrderItem = OrderItem;
//# sourceMappingURL=orderItem.js.map