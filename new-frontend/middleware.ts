import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// TEMPORARILY BYPASS AUTHENTICATION
export async function middleware(request: NextRequest) {
  // Allow all requests
  return NextResponse.next();
  
  /* Original authentication logic - commented out temporarily
  // Skip API routes, auth routes, and static assets
  if (request.nextUrl.pathname.startsWith('/api') || 
      request.nextUrl.pathname.includes('/auth') || 
      request.nextUrl.pathname.startsWith('/_next') || 
      request.nextUrl.pathname.includes('.')) {
    return NextResponse.next();
  }
  
  // Check for auth0 session cookie
  const auth0Session = request.cookies.get('auth0.session');
  
  // If no session cookie, redirect to Auth0 login
  if (!auth0Session) {
    console.log('No auth session, redirecting to login');
    const loginUrl = '/api/auth/login?returnTo=' + encodeURIComponent(request.nextUrl.pathname);
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }
  
  // If session exists, allow access
  return NextResponse.next();
  */
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
