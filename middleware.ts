import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const has = req.cookies.has('keep_session');
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/cofre') && !has) {
    const url = req.nextUrl.clone(); url.pathname = '/entrar'; url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === '/entrar' || pathname === '/cadastro') && has) {
    const url = req.nextUrl.clone(); url.pathname = '/cofre'; url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/cofre/:path*', '/entrar', '/cadastro'] };
