# Order Chat Saving System

This system automatically saves all order conversations in text format for later review. Each chat is saved with complete order details, payment status, and the full conversation transcript.

## Features

- **Automatic Saving**: Chats are automatically saved when orders are completed
- **Complete Order Details**: Includes order number, customer info, items, prices, and payment status
- **Full Conversation**: Captures the entire conversation between customer and assistant
- **Separate Storage**: Saved in a dedicated `data/order-chats/` folder, separate from other order data
- **Text Format**: Easy-to-read text files that can be opened with any text editor
- **Management Tools**: Scripts to view, list, and manage saved chats

## File Structure

Saved chat files are stored in: `backend/data/order-chats/`

File naming format: `ORDER-{orderNumber}-{timestamp}.txt`

Example: `ORDER-RITT-20250602-51789-1748924754322.txt`

## Chat File Contents

Each saved chat file contains:

```
================================================================================
ORDER CHAT LOG
================================================================================

ORDER DETAILS:
Order Number: RITT-20250602-51789
Customer Name: John Doe
Customer Email: john@example.com
Restaurant: Niro's Gyros
Order Total: $15.47
Payment Status: PENDING
Order Status: COMPLETED
Created At: 2025-01-02T10:30:00.000Z
Completed At: 2025-01-02T10:35:00.000Z

ORDER ITEMS:
1. Gyro Sandwich
   Quantity: 1
   Price: $8.99
   Special Instructions: Extra tzatziki sauce

2. Greek Fries
   Quantity: 1
   Price: $4.99

--------------------------------------------------------------------------------
CHAT CONVERSATION:
--------------------------------------------------------------------------------

[1/2/2025, 10:30:15 AM] ASSISTANT:
Hi! Welcome to Niro's Gyros. How can I help you today?

[1/2/2025, 10:30:22 AM] CUSTOMER:
I'd like to order a gyro sandwich please

[1/2/2025, 10:30:25 AM] ASSISTANT:
Great! Adding one gyro sandwich to your order. Would you like anything else?

... (full conversation continues)

================================================================================
END OF CHAT LOG
================================================================================
```

## Management Commands

Use these commands from the `backend/` directory:

### List All Saved Chats
```bash
npm run view-chats list
```

### View a Specific Chat
```bash
npm run view-chats view ORDER-123-1234567890.txt
```

### View the Latest Chat
```bash
npm run view-chats latest
```

### Create a Summary Report
```bash
npm run view-chats summary
```

### Help
```bash
npm run view-chats
```

## Payment Status Tracking

The system tracks payment status:
- **pending**: Order placed, payment not yet completed
- **paid**: Payment successfully processed
- **failed**: Payment attempt failed
- **not_completed**: Order not completed or session ended early

## Order Status Tracking

The system tracks order status:
- **confirmed**: Order successfully placed
- **cancelled**: Order was cancelled
- **in_progress**: Order is being processed
- **completed**: Order fully completed

## Automatic Cleanup

The system includes automatic cleanup of old inactive chats:
- Chats older than 24 hours are automatically saved and cleaned up
- This prevents memory leaks from long-running sessions

## Integration Points

The chat saving system integrates with:
1. **Agent Session**: Tracks all user and assistant messages
2. **Order Placement**: Triggers saving when orders are completed
3. **Conversation State**: Captures order details and customer information
4. **Session Management**: Handles cleanup when sessions end

## File Locations

- **Chat Saver Service**: `backend/src/services/chatSaver.ts`
- **Chat Collector Service**: `backend/src/services/chatCollector.ts`
- **View Script**: `backend/src/scripts/view-chats.ts`
- **Saved Chats**: `backend/data/order-chats/`

## Error Handling

- Chat saving failures don't affect order processing
- Errors are logged but don't interrupt the customer experience
- Fallback mechanisms ensure chats are saved even if sessions disconnect unexpectedly

## Privacy and Security

- Chat files contain customer information - ensure proper access controls
- Consider implementing data retention policies
- Files are stored locally and not transmitted externally
- Customer email and personal information are included in the logs

## Monitoring

Check the console logs for chat saving activity:
- `Started chat tracking for participant: {id}`
- `Added {role} message to chat {id}`
- `Order completed, saving chat...`
- `Chat saved successfully: {filepath}`

## Troubleshooting

### No Chats Being Saved
1. Check if the `data/order-chats/` directory exists
2. Verify file permissions
3. Check console logs for error messages

### Missing Messages
1. Ensure the session event handlers are properly attached
2. Check if messages are being filtered out (payment links, empty messages)
3. Verify conversation state is being updated

### File Access Issues
1. Check file permissions on the `data/order-chats/` directory
2. Ensure the Node.js process has write access
3. Verify disk space availability 