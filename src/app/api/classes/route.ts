import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = 'class_schedule_root_data';

// GET: 수업 목록 전체 가져오기
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RECORD_DRIVE_ID)
      .maybeSingle();

    if (error || !data || !data.file_data) {
      return NextResponse.json({ classes: [], custom_reasons: null, custom_actions: null });
    }

    const parsed = JSON.parse(data.file_data);
    return NextResponse.json({ 
      classes: parsed.classes || [],
      custom_reasons: parsed.custom_reasons || null,
      custom_actions: parsed.custom_actions || null
    });
  } catch (error: any) {
    console.error('Classes GET error:', error);
    return NextResponse.json({ classes: [] });
  }
}

// POST: 수업 목록 및 사유/조치 저장 / 업데이트
export async function POST(req: Request) {
  try {
    // 🛡️ 교직원 관리자 권한 검증
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session_token')?.value;
    const session = verifyAdminToken(token);
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다. (로그인 필요)' }, { status: 401 });
    }

    const body = await req.json();
    const classes = body.classes || [];
    const custom_reasons = body.custom_reasons;
    const custom_actions = body.custom_actions;

    const jsonString = JSON.stringify({ 
      classes, 
      custom_reasons,
      custom_actions,
      updated_at: new Date().toISOString() 
    });

    const { error } = await supabase
      .from('exam_library')
      .upsert({
        drive_id: RECORD_DRIVE_ID,
        name: 'class_schedule_data.json',
        type: 'file',
        grade: '공통',
        file_data: jsonString,
        updated_at: new Date().toISOString()
      }, { onConflict: 'drive_id' });

    if (error) {
      console.error('Classes save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: classes.length });
  } catch (error: any) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
