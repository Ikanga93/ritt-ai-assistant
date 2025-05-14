# Simple Restaurant Dashboard Implementation Plan

## Overview
This plan outlines the steps to implement a simple dashboard interface for restaurants to view and manage their orders after payment confirmation. The system will use restaurant email addresses as the primary identifier to route orders to the correct restaurant dashboard. The dashboard will be created in a new `ritt-dashboard` directory within the main project.

## Goals
- Provide restaurants with a simple view of their paid orders
- Enable automatic thermal receipt printing
- Create a straightforward authentication system
- Complement the existing email notification system

## Implementation Steps

### 0. Project Setup
- [ ] Create new `ritt-dashboard` directory in the main project
  - [ ] Initialize new Node.js project with `pnpm init`
  - [ ] Set up basic Express.js server
  - [ ] Configure project structure (routes, controllers, models, views)
  - [ ] Set up connection to existing database 
  - [ ] Create basic README with setup instructions

### 1. Authentication System with Auth0
- [ ] Set up Auth0 integration
  - [ ] Create Auth0 account and application
  - [ ] Configure Auth0 application settings
  - [ ] Set up Auth0 API and permissions
  - [ ] Configure callback URLs and logout URLs
- [ ] Implement Auth0 login flow
  - [ ] Add Auth0 SDK to the project
  - [ ] Create login button with Auth0 redirect
  - [ ] Handle authentication callback
  - [ ] Store and manage JWT tokens
- [ ] Create restaurant profile collection
  - [ ] Store additional restaurant data (name, phone, etc.)
  - [ ] Link Auth0 user IDs with restaurant profiles
  - [ ] Create API to update restaurant profiles

### 2. Dashboard Interface
- [ ] Develop simple dashboard layout
  - [ ] Left panel: Order queue with customer names and order numbers
  - [ ] Right panel: Selected order details
  - [ ] Header with restaurant name and logout option
- [ ] Implement order details view
  - [ ] Order number and payment status indicator
  - [ ] Customer name display
  - [ ] Order timestamp
  - [ ] Item list with quantities, prices, and special instructions
  - [ ] Order totals (subtotal, tax, processing fees, final total)
- [ ] Add basic notifications
  - [ ] Sound alert for new orders
  - [ ] Visual indicators for new orders

### 3. Database Updates
- [ ] Create restaurant accounts table
  - [ ] Restaurant name
  - [ ] Owner name
  - [ ] Email (primary key for matching with menu items)
  - [ ] Phone number
  - [ ] Hashed password
  - [ ] Account creation timestamp
  - [ ] Last login timestamp
- [ ] Add simple order status options
  - [ ] New (default)

### 4. Automatic Thermal Printer Integration
- [ ] Implement browser-based thermal printer solution
  - [ ] Integrate with plugin-impresora-termica (free thermal printer plugin)
  - [ ] Install local printer service on restaurant computers
  - [ ] Configure background printing service
- [ ] Set up fully automatic printing workflow
  - [ ] Create event listener for new order arrivals
  - [ ] Trigger immediate printing without user interaction
  - [ ] Implement silent printing (no dialogs or confirmations)
- [ ] Design comprehensive receipt template
  - [ ] Restaurant branding and header
  - [ ] Order number and timestamp
  - [ ] Customer details
  - [ ] Itemized order with quantities, prices, and special instructions
  - [ ] Order totals and payment information
  - [ ] QR code for order tracking (optional)
- [ ] Provide detailed printer setup documentation
  - [ ] Step-by-step printer sharing instructions
  - [ ] Troubleshooting guide for common issues
  - [ ] Testing and verification procedures

### 5. Integration with Existing System
- [ ] Connect with email notification system
  - [ ] Use email address to match restaurants with their orders
  - [ ] Include dashboard login link in email notifications
- [ ] Integrate with payment processing
  - [ ] Only show paid orders in dashboard
  - [ ] Display payment status clearly
- [ ] Email-based order routing
  - [ ] Match menu items to restaurants via email address
  - [ ] Route orders to correct restaurant dashboard

### 6. Security Implementation
- [ ] Auth0 security configuration
  - [ ] Configure proper Auth0 security settings
  - [ ] Set up appropriate user roles and permissions
  - [ ] Enable MFA for restaurant accounts (optional)
- [ ] Data isolation
  - [ ] Restaurant-specific data access
  - [ ] Email-based filtering of orders
- [ ] API security
  - [ ] Secure API endpoints with Auth0 JWT validation
  - [ ] Input validation for all API requests
  - [ ] HTTPS enforcement

### 7. Testing and Deployment
- [ ] Basic testing
  - [ ] Authentication flow testing
  - [ ] Order display testing
  - [ ] Thermal printer integration testing
- [ ] Simple deployment
  - [ ] Deploy alongside existing application
  - [ ] Provide setup documentation for restaurants
  - [ ] Test with actual thermal printers

## Technical Architecture

### Project Structure
```
ritt-drive-thru/
├── backend/            # Existing backend
├── new-frontend/       # Existing frontend
└── ritt-dashboard/     # New dashboard application
    ├── public/         # Static assets
    │   ├── css/
    │   ├── js/
    │   └── images/
    ├── src/            # Source code
    │   ├── routes/     # API routes
    │   ├── controllers/# Business logic
    │   ├── models/     # Data models
    │   ├── views/      # EJS templates
    │   └── utils/      # Helper functions
    ├── .env            # Environment variables
    ├── package.json    # Dependencies
    └── server.js       # Entry point
```

### Backend
- Node.js with Express
- Auth0 for authentication
- PostgreSQL database (existing)

### Frontend
- Simple HTML/CSS/JavaScript
- EJS templates for server-side rendering
- Minimal dependencies
- tablet-responsive design

### Thermal Printing
- Browser-based printing plugin
- Local printer connection
- Receipt template system

## User Flow
1. Restaurant signs up with their email, name, and other details
2. Restaurant logs into dashboard using email and password
3. Dashboard displays paid orders with customer details
4. New orders appear with sound alert and visual indicator
5. Restaurant staff can view order details
6. Staff can print receipt directly from browser to thermal printer
7. Staff can update order status (In Preparation, Ready, Completed)

## Timeline
- Authentication System with Auth0: 1-2 days
- Dashboard Interface: 2-3 days
- Database Updates: 1-2 days
- Thermal Printer Integration: 2-3 days
- Integration & Security: 2-3 days
- Testing & Deployment: 2 days

**Total Estimated Time**: 10-12 days

## Future Enhancements
- Order history and reporting
- Customer notification on status changes
- Kitchen display system integration
- Mobile app version
- Multiple printer support
