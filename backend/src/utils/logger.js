"use strict";
// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevel = void 0;
exports.createCorrelationId = createCorrelationId;
exports.removeCorrelationId = removeCorrelationId;
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.fatal = fatal;
/**
 * Structured logging utility with correlation ID support
 * Provides consistent logging format and error tracking
 */
var crypto_1 = require("crypto");
// Log levels
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["FATAL"] = "FATAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// Store active correlation IDs
var activeCorrelationIds = new Map();
/**
 * Create a new correlation ID for tracking operations
 * @param orderId Optional order ID to associate with this correlation
 * @param orderNumber Optional order number to associate with this correlation
 * @returns The generated correlation ID
 */
function createCorrelationId(orderId, orderNumber) {
    // Convert orderId to string if it's a number
    var orderIdStr = orderId !== undefined ? String(orderId) : undefined;
    var correlationId = "corr-".concat((0, crypto_1.randomUUID)());
    // Store the correlation ID with order information if provided
    if (orderIdStr || orderNumber) {
        activeCorrelationIds.set(correlationId, JSON.stringify({
            orderId: orderIdStr,
            orderNumber: orderNumber,
            createdAt: new Date().toISOString()
        }));
    }
    return correlationId;
}
/**
 * Remove a correlation ID from active tracking
 * @param correlationId The correlation ID to remove
 */
function removeCorrelationId(correlationId) {
    activeCorrelationIds.delete(correlationId);
}
/**
 * Format an error object for logging
 * @param error The error to format
 * @returns A formatted error object
 */
function formatError(error) {
    if (!error)
        return undefined;
    // If it's an Error object, extract useful properties
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause ? formatError(error.cause) : undefined
        };
    }
    // If it's already an object, return as is
    return error;
}
/**
 * Create a structured log entry
 * @param level Log level
 * @param message Log message
 * @param options Additional logging options
 * @returns Formatted log entry
 */
function createLogEntry(level, message, options) {
    // Convert orderId to string if it's a number
    var orderIdStr = (options === null || options === void 0 ? void 0 : options.orderId) !== undefined ? String(options.orderId) : undefined;
    return {
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
        orderId: orderIdStr,
        orderNumber: options === null || options === void 0 ? void 0 : options.orderNumber,
        context: options === null || options === void 0 ? void 0 : options.context,
        data: options === null || options === void 0 ? void 0 : options.data,
        error: (options === null || options === void 0 ? void 0 : options.error) ? formatError(options.error) : undefined
    };
}
/**
 * Output a log entry to the console
 * @param entry The log entry to output
 */
function outputLogEntry(entry) {
    // Convert to JSON string for structured logging
    var logString = JSON.stringify(entry);
    // Add visual separator and timestamp for better visibility
    var timestamp = new Date().toLocaleTimeString();
    var separator = '='.repeat(80);
    // Output to appropriate console method based on level
    switch (entry.level) {
        case LogLevel.DEBUG:
            console.debug("\n".concat(separator, "\n[").concat(timestamp, "] DEBUG:\n").concat(logString, "\n").concat(separator, "\n"));
            break;
        case LogLevel.INFO:
            console.info("\n".concat(separator, "\n[").concat(timestamp, "] INFO:\n").concat(logString, "\n").concat(separator, "\n"));
            break;
        case LogLevel.WARN:
            console.warn("\n".concat(separator, "\n[").concat(timestamp, "] WARN:\n").concat(logString, "\n").concat(separator, "\n"));
            break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
            console.error("\n".concat(separator, "\n[").concat(timestamp, "] ERROR:\n").concat(logString, "\n").concat(separator, "\n"));
            break;
        default:
            console.log("\n".concat(separator, "\n[").concat(timestamp, "] LOG:\n").concat(logString, "\n").concat(separator, "\n"));
    }
}
/**
 * Log at DEBUG level
 */
function debug(message, options) {
    var entry = createLogEntry(LogLevel.DEBUG, message, options);
    outputLogEntry(entry);
}
/**
 * Log at INFO level
 */
function info(message, options) {
    var entry = createLogEntry(LogLevel.INFO, message, options);
    outputLogEntry(entry);
}
/**
 * Log at WARN level
 */
function warn(message, options) {
    var entry = createLogEntry(LogLevel.WARN, message, options);
    outputLogEntry(entry);
}
/**
 * Log at ERROR level
 */
function error(message, options) {
    var entry = createLogEntry(LogLevel.ERROR, message, options);
    outputLogEntry(entry);
}
/**
 * Log at FATAL level
 */
function fatal(message, options) {
    var entry = createLogEntry(LogLevel.FATAL, message, options);
    outputLogEntry(entry);
}
// Default export for convenience
exports.default = {
    createCorrelationId: createCorrelationId,
    removeCorrelationId: removeCorrelationId,
    debug: debug,
    info: info,
    warn: warn,
    error: error,
    fatal: fatal
};
