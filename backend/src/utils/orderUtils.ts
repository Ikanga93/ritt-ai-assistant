/**
 * Generates a unique order number for a new order
 * Format: RITT-YYYYMMDD-XXXXX where XXXXX is a random 5-digit number
 */
export function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  
  return `RITT-${year}${month}${day}-${random}`;
}

/**
 * Generates a receipt number for an order
 * Format: RCPT-YYYYMMDD-HHMMSS-XXXX where XXXX is a random 4-digit number
 */
export function generateReceiptNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `RCPT-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
} 