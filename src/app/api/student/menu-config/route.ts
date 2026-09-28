import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = 'student_menu_config_data';

export interface StudentMenuConfig {
  test: boolean;
  test2: boolean;
  homework: boolean;
  review: boolean;
  library: boolean;
}

export const DEFAULT_MENU_CONFIG: StudentMenuConfig = {
  test: true,
  test2: true,
  homework: true,
  review: true,
  library: true,
};

// GET: 학생 상단 메뉴 노출 설정 불러오기
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RECORD_DRIVE_ID)
      .maybeSingle();

    if (error || !data || !data.file_data) {
      return NextResponse.json({ config: DEFAULT_MENU_CONFIG });
    }

    const parsed = JSON.parse(data.file_data);
    const config: StudentMenuConfig = {
      test: parsed.test ?? true,
      test2: parsed.test2 ?? true,
      homework: parsed.homework ?? true,
      review: parsed.review ?? true,
      library: parsed.library ?? true,
    };

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error('Menu config GET error:', error);
    return NextResponse.json({ config: DEFAULT_MENU_CONFIG });
  }
}

// POST: 학생 상단 메뉴 노출 설정 저장하기
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config: StudentMenuConfig = {
      test: body.test ?? true,
      test2: body.test2 ?? true,
      homework: body.homework ?? true,
      review: body.review ?? true,
      library: body.library ?? true,
    };

    const jsonString = JSON.stringify({
      ...config,
      updated_at: new Date().toISOString()
    });

    const { error } = await supabase
      .from('exam_library')
      .upsert({
        drive_id: RECORD_DRIVE_ID,
        name: 'student_menu_config.json',
        type: 'file',
        grade: '공통',
        file_data: jsonString,
        updated_at: new Date().toISOString()
      }, { onConflict: 'drive_id' });

    if (error) {
      console.error('Menu config save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error('Menu config POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
