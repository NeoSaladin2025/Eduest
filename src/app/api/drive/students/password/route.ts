import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(req: Request) {
  try {
    // 🛡️ 관리자 권한 확인
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session_token')?.value;
    const session = verifyAdminToken(token);
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
    }

    const { studentId, password } = await req.json();

    if (!studentId || !password) {
      return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 });
    }

    // 💡 학생 비밀번호는 선생님 관리 화면에서 식별 및 발급을 위해 평문(4자리 등)으로 저장
    const plainPassword = String(password).trim();

    const { error } = await supabase
      .from('students')
      .update({ password: plainPassword })
      .eq('id', studentId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
