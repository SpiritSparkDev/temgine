import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  // Development Mode: Nur lokal und niemals in Production bypassen
  const devMode = process.env.DEV_MODE === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  const hostname = req.nextUrl.hostname;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  if (devMode && !isProduction && isLocalHost) {
    console.log('⚠️  DEV_MODE aktiv - Authentifizierung deaktiviert');
    return NextResponse.next();
  }

  // Production: Authentifizierung erforderlich
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
