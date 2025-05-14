# Restaurant Email Notification System Implementation Plan

## Overview
This plan outlines the steps to implement an email-based notification system that will send order details to respective restaurants after payment confirmation. Each restaurant will receive information only about their portion of the order.

## Implementation Steps

### 1. Database Structure Review
- [x] Ensure Restaurant entity has an `email` field
- [x] Verify OrderItem links to Restaurant ID
- [x] Confirm Order entity has relationships to OrderItems

### 2. Create Restaurant Notification Service
- [x] Create `restaurantNotificationService.ts` file
- [x] Implement `sendRestaurantOrderNotifications` function to:
  - [x] Query the database for order details
  - [x] Group order items by restaurant
  - [x] Format email content for each restaurant
  - [x] Send emails using existing email service

### 3. Update Webhook Handler
- [x] Modify Stripe webhook handler for `checkout.session.completed` events
- [x] Add restaurant notification call after payment confirmation
- [x] Ensure error handling doesn't interrupt the main payment flow

### 4. Email Template Design
- [x] Create professional HTML email template for restaurant orders
- [x] Include:
  - [x] Order number and timestamp
  - [x] Customer details (name only, for privacy)
  - [x] Restaurant-specific items only
  - [x] Pricing and quantity information
  - [x] Special instructions if any
  - [x] Clear call-to-action for order preparation

### 5. Testing
- [ ] Test with sample orders containing items from multiple restaurants
- [ ] Verify emails are correctly sent to each restaurant
- [ ] Ensure only relevant items are included in each restaurant's email
- [ ] Test with various edge cases (missing email, failed delivery, etc.)

### 6. Monitoring
- [ ] Add logging for notification success/failure
- [ ] Track email delivery status through SendGrid webhooks
- [ ] Create dashboard view for monitoring notification status

### 7. Error Handling
- [ ] Implement retry mechanism for failed notifications
- [ ] Ensure main payment flow continues even if notifications fail
- [ ] Add fallback notification method if needed

## Technical Considerations

### Data Flow
1. Customer completes payment via Stripe
2. Stripe webhook triggers `checkout.session.completed` event
3. Backend updates order status to PAID
4. System sends customer receipt email
5. System queries order details and groups by restaurant
6. System sends separate emails to each restaurant with their relevant items

### Email Content
- **Subject**: "New Paid Order #[OrderNumber] - Action Required"
- **Body**:
  - Restaurant name and order details
  - Customer name
  - Order date and time
  - List of items with quantities and prices
  - Total amount for this restaurant
  - Special instructions if any
  - Estimated pickup time

### Security Considerations
- No sensitive customer information (phone, address) in restaurant emails
- Secure handling of email addresses
- Proper email authentication (SPF, DKIM) to prevent spoofing

## Timeline
- Development: 2-3 days
- Testing: 1 day
- Deployment: 1 day
- Monitoring and adjustments: Ongoing

## Future Enhancements
- SMS notifications option
- Restaurant portal for order management
- Mobile app notifications
- Order status updates from restaurant to customer
