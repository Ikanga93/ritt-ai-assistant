# Simple Payment Button Plan

## Overview
Add a payment button in the chat interface that opens the Stripe payment link in a new tab.

## Implementation Steps

### 1. Create Payment Button
- Create a simple button component
- Style to match chat interface
- Opens payment link in new tab when clicked
- Shows only after order confirmation

### 2. Update Chat Messages
- Detect payment link in chat messages
- Format: `payment_link:https://stripe.com/...`
- Show payment button when link is detected
- Keep regular messages unchanged

### 3. Testing Plan
- Test button appearance in chat
- Verify payment link opens correctly
- Test full order flow:
  1. Place order
  2. Confirm order
  3. Click payment button
  4. Complete payment
  5. Verify order status

## Notes
- Keep it simple - just a button that opens payment link
- No state management needed
- Use existing payment link generation
- Maintain current chat experience
