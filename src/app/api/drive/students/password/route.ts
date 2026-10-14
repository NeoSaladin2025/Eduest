import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, hashPassword } from '@/lib/authUtils';

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

    // 🔒 [보안 강화]: 학생 비밀번호도 Bcrypt 해시로 안전하게 암호화하여 저장
    const hashedPassword = await hashPassword(String(password).trim());

    const { error } = await supabase
      .from('students')
      .update({ password: hashedPassword })
      .eq('id', studentId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
