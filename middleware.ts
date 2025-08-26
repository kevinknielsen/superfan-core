import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MANAGER_ROUTES } from '@/lib/feature-flags';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;
  const appType = hostname.startsWith('manager.') ? 'manager' : 'main';
  const isProduction = process.env.NODE_ENV === 'production';
  const userAgent = request.headers.get('user-agent') || '';
  
  // Skip redirects for external crawlers and bots (including Farcaster)
  const isBotOrCrawler = userAgent.includes('farcaster') || 
                         userAgent.includes('Farcaster') ||
                         userAgent.includes('frame-sdk') ||
                         userAgent.includes('bot') ||
                         userAgent.includes('Bot') ||
                         userAgent.includes('crawler') ||
                         userAgent.includes('Crawler') ||
                         userAgent.includes('spider') ||
                         userAgent.includes('Spider') ||
                         userAgent.includes('scraper') ||
                         userAgent.includes('Scraper') ||
                         userAgent.includes('facebook') ||
                         userAgent.includes('twitter') ||
                         userAgent.includes('linkedin') ||
                         userAgent.includes('telegram') ||
                         userAgent.includes('discord') ||
                         userAgent.includes('warpcast') ||
                         userAgent.includes('Warpcast') ||
                         userAgent.includes('MetaBot') ||
                         userAgent.includes('OpenGraph') ||
                         userAgent.includes('embed') ||
                         pathname.includes('og-image') ||
                         request.headers.get('sec-fetch-dest') === 'image' ||
                         request.headers.get('sec-fetch-site') === 'cross-site';
  
  // Manager-only routes with specific logic for /projects
  const isManagerRoute = MANAGER_ROUTES.some((route) => {
    if (route === '/projects') {
      // Only redirect /projects (exact match), not /projects/[id]
      return pathname === '/projects';
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  });
  
  // Skip redirects in development to avoid CORS issues
  if (!isProduction) {
    return NextResponse.next();
  }
  
  // Redirect any external/bot requests from manager to main app
  if (isBotOrCrawler && appType === 'manager') {
    const url = request.nextUrl.clone();
    url.hostname = 'app.superfan.one';
    url.port = '';
    return NextResponse.redirect(url);
  }
  
  // Skip other redirects for bots on main app
  if (isBotOrCrawler) {
    return NextResponse.next();
  }
  
  // If this is a manager route but we're on main app, redirect to manager
  if (isManagerRoute && appType === 'main') {
    const url = request.nextUrl.clone();
    url.hostname = 'manager.superfan.one';
    url.port = ''; // Remove port for production
    return NextResponse.redirect(url);
  }
  
  // Always redirect individual project pages from manager to main app (since manager is internal-only)
  if (appType === 'manager' && pathname.startsWith('/projects/')) {
    const url = request.nextUrl.clone();
    url.hostname = 'app.superfan.one';
    url.port = '';
    return NextResponse.redirect(url);
  }
  
  // If this is a main app route but we're on manager app, redirect to main
  if (!isManagerRoute && appType === 'manager' && pathname !== '/' && pathname !== '/login' && pathname !== '/profile') {
    const url = request.nextUrl.clone();
    url.hostname = 'app.superfan.one';
    url.port = ''; // Remove port for production
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .well-known (domain verification files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|\\.well-known).*)',
  ],
}; 