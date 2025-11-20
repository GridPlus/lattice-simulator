import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js middleware to handle CORS for all API routes
 */
export function middleware(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // For all other requests, add CORS headers to the response
  const response = NextResponse.next()

  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  )

  return response
}

/**
 * Configure which paths the middleware should run on
 */
export const config = {
  matcher: [
    // Apply to all API routes
    '/api/:path*',
    // Apply to dynamic device routes
    '/:deviceId/:path*',
  ],
}
