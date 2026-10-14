import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { verifyAdminToken } from './lib/authUtils';

export function proxy(request: NextRequest) {
  // /teacher 경로 및 하위 경로로 들어오는 요청 검증
  if (request.nextUrl.pathname.startsWith('/teacher')) {
    const adminToken = request.cookies.get('admin_session_token')?.value;
    const session = verifyAdminToken(adminToken);

    // 서명된 유효 세션 토큰이 없거나 만료/위조된 경우 홈(/)으로 즉시 차단 리다이렉트
    if (!session || !session.adminName) {
      const response = NextResponse.redirect(new URL('/', request.url));
      response.cookies.delete('admin_session_token');
      response.cookies.delete('currentAdminName');
      return response;
    }
  }

  return NextResponse.next();
}

// 프록시가 매칭되어 감시할 대상 경로 지정
export const config = {
  matcher: ['/teacher/:path*'],
};
