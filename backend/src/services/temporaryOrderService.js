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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.temporaryOrderService = void 0;
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var logger_1 = require("../utils/logger");
// In-memory storage for temporary orders
var tempOrdersMap = new Map();
// File storage configuration
var TEMP_ORDERS_DIR = path_1.default.join(process.cwd(), 'data', 'temp-orders');
var TEMP_ORDERS_INDEX = path_1.default.join(TEMP_ORDERS_DIR, 'index.json');
// Ensure the directory exists
if (!fs_1.default.existsSync(TEMP_ORDERS_DIR)) {
    fs_1.default.mkdirSync(TEMP_ORDERS_DIR, { recursive: true });
}
// Default expiration time: 48 hours (in milliseconds)
var DEFAULT_EXPIRATION_MS = 48 * 60 * 60 * 1000;
/**
 * Generates a unique temporary order ID with "TEMP-" prefix
 */
function generateTempOrderId() {
    var timestamp = Date.now();
    var random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return "TEMP-".concat(timestamp, "-").concat(random);
}
/**
 * Saves temporary orders to disk
 */
function saveOrdersToDisk() {
    try {
        // Create an index of all order IDs
        var orderIds = Array.from(tempOrdersMap.keys());
        fs_1.default.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
        // Save each order to its own file
        for (var _i = 0, _a = tempOrdersMap.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], order = _b[1];
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(id, ".json"));
            fs_1.default.writeFileSync(orderFilePath, JSON.stringify(order), 'utf8');
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to save temporary orders to disk', {
            context: 'temporaryOrderService',
            error: error
        });
    }
}
/**
 * Loads temporary orders from disk
 */
function loadOrdersFromDisk() {
    try {
        if (!fs_1.default.existsSync(TEMP_ORDERS_INDEX)) {
            return;
        }
        var orderIds = JSON.parse(fs_1.default.readFileSync(TEMP_ORDERS_INDEX, 'utf8'));
        for (var _i = 0, orderIds_1 = orderIds; _i < orderIds_1.length; _i++) {
            var id = orderIds_1[_i];
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(id, ".json"));
            if (fs_1.default.existsSync(orderFilePath)) {
                var orderData = JSON.parse(fs_1.default.readFileSync(orderFilePath, 'utf8'));
                // Only load non-expired orders
                if (orderData.expiresAt > Date.now()) {
                    tempOrdersMap.set(id, orderData);
                }
                else {
                    // Clean up expired order files
                    fs_1.default.unlinkSync(orderFilePath);
                }
            }
        }
        logger_1.logger.info("Loaded ".concat(tempOrdersMap.size, " temporary orders from disk"), {
            context: 'temporaryOrderService'
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to load temporary orders from disk', {
            context: 'temporaryOrderService',
            error: error
        });
    }
}
/**
 * Cleans up expired orders
 */
function cleanupExpiredOrders() {
    var now = Date.now();
    var expiredCount = 0;
    for (var _i = 0, _a = tempOrdersMap.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], id = _b[0], order = _b[1];
        if (order.expiresAt < now) {
            tempOrdersMap.delete(id);
            // Also remove from disk
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(id, ".json"));
            if (fs_1.default.existsSync(orderFilePath)) {
                fs_1.default.unlinkSync(orderFilePath);
            }
            expiredCount++;
        }
    }
    if (expiredCount > 0) {
        logger_1.logger.info("Cleaned up ".concat(expiredCount, " expired temporary orders"), {
            context: 'temporaryOrderService'
        });
        // Update the index file after cleanup
        saveOrdersToDisk();
    }
}
// Initialize: load existing orders from disk
loadOrdersFromDisk();
// Set up periodic cleanup (every hour)
setInterval(cleanupExpiredOrders, 60 * 60 * 1000);
// Set up periodic saving to disk (every 5 minutes)
setInterval(saveOrdersToDisk, 5 * 60 * 1000);
// Export the service
exports.temporaryOrderService = {
    /**
     * Stores a temporary order
     */
    storeOrder: function (orderData) {
        var tempId = generateTempOrderId();
        var now = Date.now();
        var tempOrder = __assign(__assign({}, orderData), { id: tempId, createdAt: now, expiresAt: now + DEFAULT_EXPIRATION_MS });
        // Store in memory
        tempOrdersMap.set(tempId, tempOrder);
        // Save to disk immediately for this new order
        try {
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(tempId, ".json"));
            fs_1.default.writeFileSync(orderFilePath, JSON.stringify(tempOrder), 'utf8');
            // Update the index
            var orderIds = Array.from(tempOrdersMap.keys());
            fs_1.default.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
        }
        catch (error) {
            logger_1.logger.error('Failed to save new temporary order to disk', {
                context: 'temporaryOrderService',
                data: { tempOrderId: tempId },
                error: error
            });
        }
        logger_1.logger.info('Temporary order created', {
            context: 'temporaryOrderService',
            data: { tempOrderId: tempId }
        });
        return tempOrder;
    },
    /**
     * Retrieves a temporary order by ID
     */
    getOrder: function (tempOrderId) {
        // Try to get from memory first
        var order = tempOrdersMap.get(tempOrderId);
        if (order) {
            return order;
        }
        // If not in memory, try to get from disk
        try {
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(tempOrderId, ".json"));
            if (fs_1.default.existsSync(orderFilePath)) {
                var orderData = JSON.parse(fs_1.default.readFileSync(orderFilePath, 'utf8'));
                // Check if expired
                if (orderData.expiresAt > Date.now()) {
                    // Add to memory for future access
                    tempOrdersMap.set(tempOrderId, orderData);
                    return orderData;
                }
                else {
                    // Clean up expired order file
                    fs_1.default.unlinkSync(orderFilePath);
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to load temporary order from disk', {
                context: 'temporaryOrderService',
                data: { tempOrderId: tempOrderId },
                error: error
            });
        }
        return null;
    },
    /**
     * Updates a temporary order
     */
    updateOrder: function (tempOrderId, updates) {
        var existingOrder = this.getOrder(tempOrderId);
        if (!existingOrder) {
            return null;
        }
        var updatedOrder = __assign(__assign({}, existingOrder), updates);
        // Update in memory
        tempOrdersMap.set(tempOrderId, updatedOrder);
        // Update on disk
        try {
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(tempOrderId, ".json"));
            fs_1.default.writeFileSync(orderFilePath, JSON.stringify(updatedOrder), 'utf8');
        }
        catch (error) {
            logger_1.logger.error('Failed to update temporary order on disk', {
                context: 'temporaryOrderService',
                data: { tempOrderId: tempOrderId },
                error: error
            });
        }
        return updatedOrder;
    },
    /**
     * Deletes a temporary order
     */
    deleteOrder: function (tempOrderId) {
        // Remove from memory
        var deleted = tempOrdersMap.delete(tempOrderId);
        // Remove from disk
        try {
            var orderFilePath = path_1.default.join(TEMP_ORDERS_DIR, "".concat(tempOrderId, ".json"));
            if (fs_1.default.existsSync(orderFilePath)) {
                fs_1.default.unlinkSync(orderFilePath);
            }
            // Update the index
            var orderIds = Array.from(tempOrdersMap.keys());
            fs_1.default.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
        }
        catch (error) {
            logger_1.logger.error('Failed to delete temporary order from disk', {
                context: 'temporaryOrderService',
                data: { tempOrderId: tempOrderId },
                error: error
            });
        }
        return deleted;
    },
    /**
     * Lists all temporary orders (for admin purposes)
     */
    listOrders: function () {
        return Array.from(tempOrdersMap.values());
    },
    /**
     * Gets the count of temporary orders
     */
    getOrderCount: function () {
        return tempOrdersMap.size;
    },
    /**
     * Force saves all orders to disk (useful before shutdown)
     */
    forceSaveToDisk: function () {
        saveOrdersToDisk();
    }
};
// Handle graceful shutdown
process.on('SIGTERM', function () {
    logger_1.logger.info('Saving temporary orders before shutdown', {
        context: 'temporaryOrderService'
    });
    saveOrdersToDisk();
});
process.on('SIGINT', function () {
    logger_1.logger.info('Saving temporary orders before shutdown', {
        context: 'temporaryOrderService'
    });
    saveOrdersToDisk();
});
