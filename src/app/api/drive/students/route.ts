import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1️⃣ Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// [기존 코드 유지] 학생 목록 가져오기
export async function GET() {
  try {
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

// 🚀 [신규 추가] 학생 잠금 상태 업데이트 (PATCH)
export async function PATCH(req: Request) {
  try {
    const { studentId, isUnlocked } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 🔥 Supabase DB의 is_unlocked 컬럼 업데이트
    const { data, error } = await supabase
      .from('students')
      .update({ is_unlocked: isUnlocked })
      .eq('id', studentId)
      .select();

    if (error) {
      console.error('Supabase Update Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `잠금 상태가 ${isUnlocked ? '해제' : '설정'}되었습니다.`,
      student: data[0] 
    });

  } catch (error: any) {
    console.error('Update API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
