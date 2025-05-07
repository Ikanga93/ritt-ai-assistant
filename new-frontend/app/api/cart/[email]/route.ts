import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to proxy cart requests to the backend
 * GET /api/cart/[email] - Get cart items for a customer
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { email: string } }
) {
  try {
    const { email } = params;
    
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get the API URL from environment variables or use default
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const backendUrl = `${apiUrl}/api/cart/${encodeURIComponent(email)}`;
    
    console.log(`Proxying request to backend: ${backendUrl}`);
    
    const response = await fetch(backendUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Disable caching to ensure fresh data
    });

    if (!response.ok) {
      console.error(`Backend returned error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch cart data from backend',
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in cart API route:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
