import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 쿠키에서 currentAdminName 가져오기
  const adminName = request.cookies.get('currentAdminName')?.value;

  // /teacher 경로 및 하위 경로로 들어오는 요청 검증
  if (request.nextUrl.pathname.startsWith('/teacher')) {
    if (!adminName) {
      // 쿠키가 없거나 유효하지 않다면 홈 화면(/)으로 즉시 리다이렉트
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

// 프록시가 매칭되어 감시할 대상 경로 지정
export const config = {
  matcher: ['/teacher/:path*'],
};
