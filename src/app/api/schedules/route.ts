import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SCHEDULE_RECORD_DRIVE_ID = 'academy_calendar_schedules_root_data';

export interface ScheduleItem {
  id: string;
  type: 'ACADEMIC' | 'SPECIAL'; // ACADEMIC: 학교 시험 등 학사일정, SPECIAL: 특이사항 포스트잇 메모
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  schoolName?: string; // 학사일정인 경우 (예: '반포중', '서초고' 등)
  grade?: string; // 학년 (예: '중2', '고1' 등)
  examType?: string; // 중간고사, 기말고사, 모의고사 등
  color: string; // rose, indigo, amber, emerald, purple, yellow, cyan, pink 등
  effect?: 'normal' | 'glow' | 'shake' | 'sparkle' | 'stamp'; // 시각 효과
  content?: string; // 상세 메모 내용
  author?: string;
  createdAt: string;
  updatedAt: string;
}

// GET: 일정 전체 목록 가져오기
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', SCHEDULE_RECORD_DRIVE_ID)
      .maybeSingle();

    if (error || !data || !data.file_data) {
      return NextResponse.json({ schedules: [] });
    }

    const parsed = JSON.parse(data.file_data);
    return NextResponse.json({ 
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [] 
    });
  } catch (error: any) {
    console.error('Schedules GET error:', error);
    return NextResponse.json({ schedules: [] });
  }
}

// POST: 일정 전체 목록 저장 / 동기화
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const schedules: ScheduleItem[] = body.schedules || [];

    const jsonString = JSON.stringify({ 
      schedules, 
      updated_at: new Date().toISOString() 
    });

    const { error } = await supabase
      .from('exam_library')
      .upsert({
        drive_id: SCHEDULE_RECORD_DRIVE_ID,
        name: 'academy_calendar_schedules_data.json',
        type: 'file',
        grade: '공통',
        file_data: jsonString,
        updated_at: new Date().toISOString()
      }, { onConflict: 'drive_id' });

    if (error) {
      console.error('Schedules save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: schedules.length });
  } catch (error: any) {
    console.error('Schedules POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
