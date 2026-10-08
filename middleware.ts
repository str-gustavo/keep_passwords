import { NextResponse, type NextRequest } from 'next/server';

// Only protects the vault. Auth pages are never bounced to /cofre: the cookie may be stale and is
// simply overwritten at sign-in.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/cofre') && !req.cookies.has('keep_session')) {
    const url = req.nextUrl.clone(); url.pathname = '/entrar'; url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/cofre/:path*'] };
