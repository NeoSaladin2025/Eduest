import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HomeStudyRulesConfig, DEFAULT_HOME_STUDY_RULES } from '@/lib/homeStudyTypes';

const RULES_DRIVE_ID = 'home_study_rules';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RULES_DRIVE_ID)
      .maybeSingle();

    if (error || !data?.file_data) {
      // 초기 기본 규칙 반환
      return NextResponse.json({
        success: true,
        rules: DEFAULT_HOME_STUDY_RULES,
      });
    }

    try {
      const parsed: HomeStudyRulesConfig = JSON.parse(data.file_data);
      return NextResponse.json({
        success: true,
        rules: parsed,
      });
    } catch {
      return NextResponse.json({
        success: true,
        rules: DEFAULT_HOME_STUDY_RULES,
      });
    }
  } catch (err: any) {
    console.error('Failed to get home study rules:', err);
    return NextResponse.json({ success: false, error: err.message, rules: DEFAULT_HOME_STUDY_RULES }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rules: HomeStudyRulesConfig = body.rules;

    if (!rules || typeof rules !== 'object') {
      return NextResponse.json({ success: false, error: '유효한 rules 데이터가 필요합니다.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const jsonString = JSON.stringify({
      ...rules,
      updated_at: new Date().toISOString(),
    });

    const { error: upsertErr } = await supabase.from('exam_library').upsert(
      {
        drive_id: RULES_DRIVE_ID,
        name: 'home_study_rules.json',
        type: 'file',
        grade: '공통',
        file_data: jsonString,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'drive_id' }
    );

    if (upsertErr) {
      console.error('Failed to save home study rules:', upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rules });
  } catch (err: any) {
    console.error('Save rules error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
