import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/auth/signin', req.url);
  const callbackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  signInUrl.searchParams.set('callbackUrl', callbackPath);
  signInUrl.searchParams.set('reason', 'auth_required');

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/chat/:path*', '/plaza/:path*', '/order/:path*', '/profile/:path*', '/seller/:path*', '/schemes/:path*'],
};
