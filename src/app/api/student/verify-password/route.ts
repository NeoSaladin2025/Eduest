import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { signStudentToken } from '@/lib/authUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { studentId, password } = await req.json();

    const trimmedId = (studentId || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. students 테이블에서 학생 조회 (서버 측에서 안전하게 대조)
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, password')
      .eq('id', trimmedId)
      .maybeSingle();

    if (error || !student) {
      return NextResponse.json({ error: '해당 학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비밀번호가 설정되어 있지 않은 학생은 무조건 통과
    if (!student.password) {
      const token = signStudentToken(trimmedId);
      const res = NextResponse.json({ success: true, verified: true });
      res.cookies.set(`student_session_${trimmedId}`, token, {
        path: `/student/${trimmedId}`,
        maxAge: 28800, // 8시간
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return res;
    }

    // 비밀번호 대조 (서버 측)
    if (student.password.trim() !== trimmedPw) {
      return NextResponse.json(
        { success: false, error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 2. 인증 성공: 암호화된 학생 세션 서명 토큰 발급
    const token = signStudentToken(trimmedId);

    const response = NextResponse.json({
      success: true,
      verified: true,
    });

    response.cookies.set(`student_session_${trimmedId}`, token, {
      path: `/student/${trimmedId}`,
      maxAge: 28800, // 8시간
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Verify student password error:', error);
    return NextResponse.json({ error: '비밀번호 검증 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
