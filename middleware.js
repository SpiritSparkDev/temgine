import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  // Development Mode: Authentifizierung überspringen
  const devMode = process.env.DEV_MODE === 'true';
  
  if (devMode) {
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
