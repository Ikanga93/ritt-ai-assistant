import { NextRequest, NextResponse } from 'next/server';

// TEMPORARILY DISABLED - Auth0 authentication routes disabled
// Create Auth0 handlers for the App Router
export async function GET(request: NextRequest) {
  console.log('Auth0 route called but authentication is temporarily disabled');
  
  // Always redirect to home page instead of processing authentication
  const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(baseUrl);
  
  /* ORIGINAL AUTH0 LOGIC - TEMPORARILY DISABLED
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle login
  if (pathname.endsWith('/login')) {
    const domain = process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || process.env.AUTH0_DOMAIN || '';
    const clientId = process.env.AUTH0_CLIENT_ID || '';
    const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnTo = url.searchParams.get('returnTo') || '/';
    
    const redirectUrl = `https://${domain}/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(baseUrl + '/api/auth/callback')}` +
      `&response_type=code` +
      `&scope=openid profile email` +
      `&state=${encodeURIComponent(JSON.stringify({ returnTo }))}` +
      `&prompt=login`;
    
    return NextResponse.redirect(redirectUrl);
  }
  
  // Handle logout
  if (pathname.endsWith('/logout')) {
    const domain = process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || process.env.AUTH0_DOMAIN || '';
    const clientId = process.env.AUTH0_CLIENT_ID || '';
    const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnTo = url.searchParams.get('returnTo') || '/';
    
    const redirectUrl = `https://${domain}/v2/logout?` +
      `client_id=${clientId}` +
      `&returnTo=${encodeURIComponent(baseUrl + returnTo)}`;
    
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete('auth0.session');
    
    return response;
  }
  
  // Handle callback
  if (pathname.endsWith('/callback')) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code) {
      const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(baseUrl);
    }
    
    try {
      // Exchange code for tokens
      const domain = process.env.AUTH0_ISSUER_BASE_URL || `https://${process.env.AUTH0_DOMAIN}` || '';
      const clientId = process.env.AUTH0_CLIENT_ID || '';
      const clientSecret = process.env.AUTH0_CLIENT_SECRET || '';
      const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      const tokenResponse = await fetch(`${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${baseUrl}/api/auth/callback`
        })
      });
      
      const tokens = await tokenResponse.json();
      
      if (!tokens.access_token) {
        return NextResponse.redirect(baseUrl);
      }
      
      // Get user info
      const userInfoResponse = await fetch(`${domain}/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      
      const userInfo = await userInfoResponse.json();
      
      // Set user session cookie
      const parsedState = state ? JSON.parse(decodeURIComponent(state)) : { returnTo: '/' };
      const returnTo = parsedState.returnTo || '/';
      
      const response = NextResponse.redirect(baseUrl + returnTo);
      response.cookies.set('auth0.session', JSON.stringify({
        user: userInfo,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in
      }), {
        httpOnly: false, // Changed to false so client-side JS can read it
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      });
      
      // Log successful authentication
      console.log('Auth0 authentication successful, redirecting to:', returnTo);
      
      return response;
    } catch (error) {
      console.error('Error in Auth0 callback:', error);
      const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(baseUrl);
    }
  }
  
  // Default case - redirect to home
  const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(baseUrl);
  */
}

export async function POST(request: NextRequest) {
  return GET(request);
}
