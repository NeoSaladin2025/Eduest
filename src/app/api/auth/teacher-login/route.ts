import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { signAdminToken } from '@/lib/authUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { identifier, password } = await req.json();

    const trimmedId = (identifier || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId || !trimmedPw) {
      return NextResponse.json({ error: '아이디/성함과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    // 1. managers 테이블에서 성함(name) 또는 login_id 일치 확인
    const { data: manager, error } = await supabase
      .from('managers')
      .select('id, name, login_id, password, role')
      .or(`name.eq.${trimmedId},login_id.eq.${trimmedId}`)
      .eq('password', trimmedPw)
      .maybeSingle();

    if (error || !manager) {
      return NextResponse.json(
        { error: '등록된 성함/아이디 또는 비밀번호가 일치하지 않습니다! 😢' },
        { status: 401 }
      );
    }

    const isSuperAdmin = manager.name === '곽명용' || manager.login_id === 'master_kwak';
    const role = isSuperAdmin ? 'SUPER_ADMIN' : (manager.role || 'TEACHER');

    // 2. 변조 불가능한 암호화 서명 세션 토큰 생성 (24시간 유효)
    const token = signAdminToken(manager.name, role);

    const response = NextResponse.json({
      success: true,
      adminName: manager.name,
      role,
    });

    // 3. 서명된 보안 쿠키 설정 (HttpOnly & Secure)
    response.cookies.set('admin_session_token', token, {
      path: '/',
      maxAge: 86400, // 24시간
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    // 기존 프론트엔드 호환용 currentAdminName 쿠키 (표시용)
    response.cookies.set('currentAdminName', manager.name, {
      path: '/',
      maxAge: 86400,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Teacher login API error:', error);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
