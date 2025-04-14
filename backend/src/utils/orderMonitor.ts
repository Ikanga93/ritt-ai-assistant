/**
 * Order monitoring system for tracking order-related operations and alerting on issues
 */

import paymentMonitor, { AlertLevel, AlertType } from './paymentMonitor.js';
import paymentLogger from './paymentLogger.js';

/**
 * Extended alert types for order-specific monitoring
 */
export enum OrderAlertType {
  ORDER_CREATION_FAILURE = 'ORDER_CREATION_FAILURE',
  ORDER_STORAGE_FAILURE = 'ORDER_STORAGE_FAILURE',
  ORDER_RETRIEVAL_FAILURE = 'ORDER_RETRIEVAL_FAILURE',
  ORDER_RECOVERY_SUCCESS = 'ORDER_RECOVERY_SUCCESS',
  ORDER_VALIDATION_FAILURE = 'ORDER_VALIDATION_FAILURE',
  FILE_SYSTEM_FALLBACK = 'FILE_SYSTEM_FALLBACK'
}

/**
 * Monitor order creation and alert on failures
 * @param result The order creation result
 * @param orderNumber The order number
 */
export async function monitorOrderCreation(result: any, orderNumber: string) {
  if (!result.success) {
    await paymentMonitor.createAlert(
      AlertLevel.WARNING,
      OrderAlertType.ORDER_CREATION_FAILURE as unknown as AlertType,
      `Failed to create order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { error: result.error }
      }
    );
    
    await paymentLogger.error('ORDER_MONITOR', `Order creation failure for #${orderNumber}: ${result.error}`, {
      orderId: orderNumber,
      data: { error: result.error }
    });
  } else {
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} created successfully`, {
      orderId: orderNumber
    });
  }
}

/**
 * Monitor order storage operations and alert on failures
 * @param result The order storage result
 * @param orderNumber The order number
 */
export async function monitorOrderStorage(result: any, orderNumber: string) {
  if (!result.success) {
    await paymentMonitor.createAlert(
      AlertLevel.WARNING,
      OrderAlertType.ORDER_STORAGE_FAILURE as unknown as AlertType,
      `Failed to store order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { error: result.error }
      }
    );
    
    await paymentLogger.error('ORDER_MONITOR', `Order storage failure for #${orderNumber}: ${result.error}`, {
      orderId: orderNumber,
      data: { error: result.error }
    });
  } else if (result.inMemoryOnly) {
    await paymentMonitor.createAlert(
      AlertLevel.INFO,
      OrderAlertType.FILE_SYSTEM_FALLBACK as unknown as AlertType,
      `Order #${orderNumber} stored in memory only`,
      {
        orderId: orderNumber,
        data: { error: result.error }
      }
    );
    
    await paymentLogger.warning('ORDER_MONITOR', `Order #${orderNumber} stored in memory only: ${result.error}`, {
      orderId: orderNumber,
      data: { error: result.error }
    });
  } else {
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} stored successfully`, {
      orderId: orderNumber
    });
  }
}

/**
 * Monitor order retrieval operations and alert on failures
 * @param result The order retrieval result
 * @param orderNumber The order number
 */
export async function monitorOrderRetrieval(result: any, orderNumber: string) {
  if (!result.success) {
    await paymentMonitor.createAlert(
      AlertLevel.WARNING,
      OrderAlertType.ORDER_RETRIEVAL_FAILURE as unknown as AlertType,
      `Failed to retrieve order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { error: result.error }
      }
    );
    
    await paymentLogger.error('ORDER_MONITOR', `Order retrieval failure for #${orderNumber}: ${result.error}`, {
      orderId: orderNumber,
      data: { error: result.error }
    });
  } else if (result.recovered) {
    await paymentMonitor.createAlert(
      AlertLevel.INFO,
      OrderAlertType.ORDER_RECOVERY_SUCCESS as unknown as AlertType,
      `Successfully recovered order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { fromCache: result.fromCache }
      }
    );
    
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} recovered successfully`, {
      orderId: orderNumber,
      data: { fromCache: result.fromCache }
    });
  } else if (result.fromCache) {
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} retrieved from cache`, {
      orderId: orderNumber
    });
  } else {
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} retrieved successfully`, {
      orderId: orderNumber
    });
  }
}

/**
 * Monitor order validation and alert on failures
 * @param result The validation result
 * @param orderNumber The order number
 */
export async function monitorOrderValidation(result: any, orderNumber: string) {
  if (!result.valid) {
    await paymentMonitor.createAlert(
      AlertLevel.WARNING,
      OrderAlertType.ORDER_VALIDATION_FAILURE as unknown as AlertType,
      `Validation failed for order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { errors: result.errors }
      }
    );
    
    await paymentLogger.error('ORDER_MONITOR', `Order validation failure for #${orderNumber}: ${result.errors.join(', ')}`, {
      orderId: orderNumber,
      data: { errors: result.errors }
    });
  } else {
    await paymentLogger.info('ORDER_MONITOR', `Order #${orderNumber} validated successfully`, {
      orderId: orderNumber
    });
  }
}

// Export a default object with all monitoring functions
export default {
  monitorOrderCreation,
  monitorOrderStorage,
  monitorOrderRetrieval,
  monitorOrderValidation
};
