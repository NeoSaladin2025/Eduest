import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 1️⃣ 학년별 라이브러리 목록 불러오기
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get('grade');

  if (!grade) {
    return NextResponse.json({ error: 'Grade is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('*')
      .eq('grade', grade)
      .eq('type', 'folder')
      .not('name', 'ilike', '%쌍둥이%');

    if (error) throw error;

    return NextResponse.json({ items: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2️⃣ 학생의 개별 회차 권한(배열) 저장하기
export async function PATCH(request: Request) {
  try {
    // 🛡️ 관리자 권한 확인 (외부 무단 호출 차단)
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session_token')?.value;
    const session = verifyAdminToken(token);
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다. (로그인 필요)' }, { status: 401 });
    }

    const { studentId, unlockedFolders } = await request.json();

    if (!studentId || !Array.isArray(unlockedFolders)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('students')
      .update({ 
        unlocked_folders: unlockedFolders
      })
      .eq('id', studentId)
      .select('id, unlocked_folders');

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Permission Update Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
