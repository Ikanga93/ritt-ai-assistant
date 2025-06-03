/**
 * Price Calculator Service
 * Handles consistent price calculations across the platform
 */

export interface PriceBreakdown {
  subtotal: number;
  tax: number;
  processingFee: number;
  total: number;
  totalWithFees: number;
}

export class PriceCalculator {
  private static instance: PriceCalculator;
  private TAX_RATE = 0.115; // 11.5% tax
  private PROCESSING_FEE_PERCENTAGE = 0.029; // 2.9%
  private PROCESSING_FEE_FIXED = 0.40; // $0.40 fixed fee

  private constructor() {}

  public static getInstance(): PriceCalculator {
    if (!PriceCalculator.instance) {
      PriceCalculator.instance = new PriceCalculator();
    }
    return PriceCalculator.instance;
  }

  /**
   * Calculate prices for an order
   * @param subtotal The subtotal amount before tax and fees
   * @returns {PriceBreakdown} The complete price breakdown
   */
  calculateOrderPrices(subtotal: number): PriceBreakdown {
    // Calculate tax
    const tax = parseFloat((subtotal * this.TAX_RATE).toFixed(2));
    
    // Calculate subtotal plus tax
    const subtotalPlusTax = parseFloat((subtotal + tax).toFixed(2));
    
    // Calculate processing fee based on subtotal + tax
    const processingFee = parseFloat(((subtotalPlusTax * this.PROCESSING_FEE_PERCENTAGE) + this.PROCESSING_FEE_FIXED).toFixed(2));
    
    // Calculate total before fees
    const total = subtotalPlusTax;
    
    // Calculate total with fees
    const totalWithFees = parseFloat((subtotalPlusTax + processingFee).toFixed(2));
    
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax,
      processingFee,
      total,
      totalWithFees
    };
  }

  /**
   * Calculate prices for a single item
   * @param price The item price
   * @param quantity The quantity of the item
   * @returns {PriceBreakdown} The price breakdown for the item
   */
  calculateItemPrices(price: number, quantity: number): PriceBreakdown {
    const subtotal = price * quantity;
    return this.calculateOrderPrices(subtotal);
  }
}

// Export the singleton instance
export const priceCalculator = PriceCalculator.getInstance();
