"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var temporaryOrderService_1 = require("../services/temporaryOrderService");
var logger_1 = require("../utils/logger");
/**
 * Test script for the temporary order storage service
 *
 * This script tests:
 * 1. Creating temporary orders
 * 2. Retrieving orders
 * 3. Updating orders
 * 4. Deleting orders
 * 5. File persistence
 */
function testTemporaryOrderStorage() {
    return __awaiter(this, void 0, void 0, function () {
        var sampleOrder, createdOrder, retrievedOrder, updatedOrder, allOrders, deleted, deletedOrder, shortExpirationOrder, pastExpiration, expiredOrder;
        return __generator(this, function (_a) {
            logger_1.logger.info('Starting temporary order storage test', {
                context: 'test-script'
            });
            sampleOrder = {
                customerName: 'Test Customer',
                customerEmail: 'test@example.com',
                restaurantId: 'rest-123',
                restaurantName: 'Test Restaurant',
                items: [
                    {
                        id: 'item-1',
                        name: 'Burger',
                        price: 9.99,
                        quantity: 2
                    },
                    {
                        id: 'item-2',
                        name: 'Fries',
                        price: 3.99,
                        quantity: 1
                    }
                ],
                total: 23.97,
                subtotal: 21.79,
                tax: 2.18
            };
            logger_1.logger.info('Creating sample temporary order', {
                context: 'test-script'
            });
            createdOrder = temporaryOrderService_1.temporaryOrderService.storeOrder(sampleOrder);
            logger_1.logger.info('Created temporary order', {
                context: 'test-script',
                data: { orderId: createdOrder.id }
            });
            retrievedOrder = temporaryOrderService_1.temporaryOrderService.getOrder(createdOrder.id);
            if (!retrievedOrder) {
                logger_1.logger.error('Failed to retrieve order', {
                    context: 'test-script',
                    data: { orderId: createdOrder.id }
                });
                return [2 /*return*/];
            }
            logger_1.logger.info('Successfully retrieved order', {
                context: 'test-script',
                data: {
                    orderId: retrievedOrder.id,
                    customerName: retrievedOrder.customerName,
                    total: retrievedOrder.total
                }
            });
            updatedOrder = temporaryOrderService_1.temporaryOrderService.updateOrder(createdOrder.id, {
                customerName: 'Updated Customer Name',
                metadata: {
                    note: 'This order was updated during testing'
                }
            });
            if (!updatedOrder) {
                logger_1.logger.error('Failed to update order', {
                    context: 'test-script',
                    data: { orderId: createdOrder.id }
                });
                return [2 /*return*/];
            }
            logger_1.logger.info('Successfully updated order', {
                context: 'test-script',
                data: {
                    orderId: updatedOrder.id,
                    customerName: updatedOrder.customerName,
                    metadata: updatedOrder.metadata
                }
            });
            allOrders = temporaryOrderService_1.temporaryOrderService.listOrders();
            logger_1.logger.info("Found ".concat(allOrders.length, " temporary orders"), {
                context: 'test-script'
            });
            // Test 5: Force save to disk
            temporaryOrderService_1.temporaryOrderService.forceSaveToDisk();
            logger_1.logger.info('Forced save to disk', {
                context: 'test-script'
            });
            deleted = temporaryOrderService_1.temporaryOrderService.deleteOrder(createdOrder.id);
            logger_1.logger.info("Order deletion ".concat(deleted ? 'successful' : 'failed'), {
                context: 'test-script',
                data: { orderId: createdOrder.id }
            });
            deletedOrder = temporaryOrderService_1.temporaryOrderService.getOrder(createdOrder.id);
            if (deletedOrder) {
                logger_1.logger.error('Order still exists after deletion', {
                    context: 'test-script',
                    data: { orderId: createdOrder.id }
                });
            }
            else {
                logger_1.logger.info('Order successfully deleted', {
                    context: 'test-script',
                    data: { orderId: createdOrder.id }
                });
            }
            shortExpirationOrder = temporaryOrderService_1.temporaryOrderService.storeOrder(__assign(__assign({}, sampleOrder), { customerName: 'Expiration Test Customer' }));
            pastExpiration = Date.now() - 1000;
            temporaryOrderService_1.temporaryOrderService.updateOrder(shortExpirationOrder.id, {
                expiresAt: pastExpiration
            });
            logger_1.logger.info('Created order with past expiration date', {
                context: 'test-script',
                data: {
                    orderId: shortExpirationOrder.id,
                    expiresAt: new Date(pastExpiration).toISOString()
                }
            });
            // Wait a moment and then check if the cleanup function removed it
            logger_1.logger.info('Waiting for cleanup to run...', {
                context: 'test-script'
            });
            // Force cleanup manually for testing
            // This would normally be called by the interval timer
            // @ts-ignore - Accessing private function for testing
            if (typeof temporaryOrderService_1.temporaryOrderService['cleanupExpiredOrders'] === 'function') {
                // @ts-ignore
                temporaryOrderService_1.temporaryOrderService['cleanupExpiredOrders']();
            }
            expiredOrder = temporaryOrderService_1.temporaryOrderService.getOrder(shortExpirationOrder.id);
            if (expiredOrder) {
                logger_1.logger.error('Expired order still exists after cleanup', {
                    context: 'test-script',
                    data: { orderId: shortExpirationOrder.id }
                });
            }
            else {
                logger_1.logger.info('Expired order successfully cleaned up', {
                    context: 'test-script',
                    data: { orderId: shortExpirationOrder.id }
                });
            }
            logger_1.logger.info('Temporary order storage test completed', {
                context: 'test-script'
            });
            return [2 /*return*/];
        });
    });
}
// Run the test
testTemporaryOrderStorage()
    .then(function () {
    logger_1.logger.info('Test script completed successfully', {
        context: 'test-script'
    });
    process.exit(0);
})
    .catch(function (error) {
    logger_1.logger.error('Test script failed', {
        context: 'test-script',
        error: error
    });
    process.exit(1);
});
