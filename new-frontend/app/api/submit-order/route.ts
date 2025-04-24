// Using cookies directly for session management since Auth0 edge imports are causing issues
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get order details from request body
    const orderDetails = await request.json();
    
    // Get user info from cookies if available
    // This is a simplified approach - in production you'd want proper session validation
    const cookieStore = cookies();
    
    // Try to get user from auth0.session cookie first (our custom implementation)
    const sessionCookie = cookieStore.get('auth0.session');
    let auth0User = null;
    
    if (sessionCookie) {
      try {
        const session = JSON.parse(decodeURIComponent(sessionCookie.value));
        auth0User = session.user;
      } catch (error) {
        console.error('Error parsing auth0.session cookie:', error);
      }
    }
    
    // Fallback to auth0.user cookie (used by the Auth0 SDK)
    if (!auth0User) {
      const userCookie = cookieStore.get('auth0.user');
      auth0User = userCookie ? JSON.parse(decodeURIComponent(userCookie.value)) : null;
    }
    
    // Forward the order to your backend API
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8081'}/api/submit-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...orderDetails,
        auth0User,
        // Include additional user metadata to ensure it's stored with the order
        userMetadata: {
          isAuthenticated: !!auth0User,
          timestamp: new Date().toISOString(),
          source: 'voice-ordering-system'
        }
      })
    });
    
    // If the user is authenticated, ensure they're synced with our database
    if (auth0User) {
      try {
        const syncResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8081'}/api/sync-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: auth0User })
        });
        
        if (!syncResponse.ok) {
          console.error('Failed to sync user during order submission:', await syncResponse.text());
        } else {
          console.log('User successfully synced with database during order submission');
        }
      } catch (error) {
        console.error('Error syncing user during order submission:', error);
      }
    }
    
    // Return the response from the backend
    const result = await response.json();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error submitting order:', error);
    return NextResponse.json(
      { error: 'Failed to submit order', message: (error as Error).message },
      { status: 500 }
    );
  }
}
