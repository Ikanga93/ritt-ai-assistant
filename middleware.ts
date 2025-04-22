import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

export async function middleware(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname;
  
  // Allow public routes
  if (
    path === '/' || 
    path.startsWith('/_next') || 
    path.startsWith('/api/public') ||
    path.startsWith('/auth') ||
    path.startsWith('/chat') // Allow chat without authentication
  ) {
    return NextResponse.next();
  }
  
  // Protect checkout and order routes
  if (
    path.startsWith('/api/checkout') || 
    path.startsWith('/api/orders') ||
    path.startsWith('/profile') ||
    path.startsWith('/orders')
  ) {
    return await auth0.middleware(request);
  }
  
  // Allow all other routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
