# Auth0 Setup for Ritt Drive-Thru

This document explains how to set up Auth0 authentication for the Ritt Drive-Thru application.

## Prerequisites

1. Create an Auth0 account at [https://auth0.com](https://auth0.com) if you don't have one already.

## Setting Up Auth0

1. Log in to your Auth0 dashboard at [https://manage.auth0.com](https://manage.auth0.com).

2. Create a new application:
   - Click on "Applications" in the sidebar
   - Click "Create Application"
   - Name it "Ritt Drive-Thru"
   - Select "Single Page Web Applications"
   - Click "Create"

3. In your application settings:
   - Add the following URLs to "Allowed Callback URLs":
     ```
     http://localhost:3000
     ```
   - Add the following URLs to "Allowed Logout URLs":
     ```
     http://localhost:3000
     ```
   - Add the following URLs to "Allowed Web Origins":
     ```
     http://localhost:3000
     ```
   - Save changes

4. Get your Auth0 credentials:
   - Domain: Find this in your application settings (e.g., `your-tenant.auth0.com`)
   - Client ID: Find this in your application settings

5. Update the Auth0 configuration in your application:
   - Open `/app/layout.tsx`
   - Replace `YOUR_AUTH0_DOMAIN` with your Auth0 domain
   - Replace `YOUR_AUTH0_CLIENT_ID` with your Auth0 client ID

## How Authentication Works

1. When a user tries to access the voice chat, the `AuthGuard` component checks if they're authenticated.
2. If not authenticated, they're redirected to the login page.
3. On the login page, users can choose to log in or sign up.
4. After successful authentication, users are redirected back to the voice chat.

## Testing Authentication

1. Start your application with `pnpm dev`
2. Try to access the voice chat - you should be redirected to the login page
3. Log in or sign up with Auth0
4. After successful authentication, you should be able to access the voice chat
