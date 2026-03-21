import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1️⃣ Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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