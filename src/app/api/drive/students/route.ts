import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';

// 1️⃣ Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// [선생님 인증 헬퍼]
async function checkAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session_token')?.value;
  return verifyAdminToken(token);
}

// [학생 목록 가져오기 - 교직원 전용]
export async function GET() {
  try {
    const session = await checkAuth();
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다. (로그인 필요)' }, { status: 401 });
    }

    // 2️⃣ 🔥 Supabase에서 모든 학생 목록 가져오기
    // 생성일(created_at) 기준으로 내림차순(최신순) 정렬!
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase Fetch Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3️⃣ 클라이언트가 기대하는 형식 { students: [...] } 으로 반환
    return NextResponse.json({ students });

  } catch (error: any) {
    console.error('List API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 🚀 [학생 잠금 상태 업데이트 (PATCH)]
export async function PATCH(req: Request) {
  try {
    const session = await checkAuth();
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다. (로그인 필요)' }, { status: 401 });
    }

    const { studentId, isUnlocked } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 🔥 Supabase DB의 is_unlocked 컬럼 업데이트
    const { data, error } = await supabase
      .from('students')
      .update({ is_unlocked: isUnlocked })
      .eq('id', studentId)
      .select('id, name, grade, drive_folder_id, is_unlocked, unlocked_folders, created_at, updated_at');

    if (error) {
      console.error('Supabase Update Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `잠금 상태가 ${isUnlocked ? '해제' : '설정'}되었습니다.`,
      student: data?.[0] 
    });

  } catch (error: any) {
    console.error('Update API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
