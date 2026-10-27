import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = 'student_session_guard_config_data';

export interface SessionGuardConfig {
  disabled_student_ids: string[];
  updated_at: string;
}

// 헬퍼: DB에서 설정 로드
async function getConfig(): Promise<SessionGuardConfig> {
  const { data, error } = await supabase
    .from('exam_library')
    .select('file_data')
    .eq('drive_id', RECORD_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) {
    return { disabled_student_ids: [], updated_at: new Date().toISOString() };
  }

  try {
    const parsed = JSON.parse(data.file_data);
    return {
      disabled_student_ids: Array.isArray(parsed.disabled_student_ids) ? parsed.disabled_student_ids : [],
      updated_at: parsed.updated_at || new Date().toISOString(),
    };
  } catch {
    return { disabled_student_ids: [], updated_at: new Date().toISOString() };
  }
}

// 헬퍼: DB에 설정 저장
async function saveConfig(config: SessionGuardConfig) {
  const jsonString = JSON.stringify(config);
  const { error } = await supabase.from('exam_library').upsert(
    {
      drive_id: RECORD_DRIVE_ID,
      name: 'student_session_guard_config.json',
      type: 'file',
      grade: '공통',
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'drive_id' }
  );

  if (error) {
    console.error('Failed to save session guard config:', error);
    throw new Error(`설정 저장 실패: ${error.message}`);
  }
}

// GET: 전체 해제 학생 ID 목록 또는 특정 학생 해제 여부 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    const config = await getConfig();

    if (studentId) {
      const isDisabled = config.disabled_student_ids.includes(studentId);
      return NextResponse.json({ success: true, isDisabled });
    }

    return NextResponse.json({ success: true, disabledStudentIds: config.disabled_student_ids });
  } catch (error: any) {
    console.error('session-guard-config GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 개별 학생 토글 또는 전체 일괄 변경
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, disabled, action, allStudentIds } = body;

    const currentConfig = await getConfig();
    let currentSet = new Set<string>(currentConfig.disabled_student_ids);

    if (action === 'DISABLE_ALL' && Array.isArray(allStudentIds)) {
      // 전체 학생 9분 해제
      allStudentIds.forEach((id: string) => currentSet.add(id));
    } else if (action === 'ENABLE_ALL') {
      // 전체 학생 9분 보호 켜기 (해제 목록 비움)
      currentSet.clear();
    } else if (studentId) {
      // 개별 학생 토글
      if (disabled) {
        currentSet.add(studentId);
      } else {
        currentSet.delete(studentId);
      }
    }

    const nextConfig: SessionGuardConfig = {
      disabled_student_ids: Array.from(currentSet),
      updated_at: new Date().toISOString(),
    };

    await saveConfig(nextConfig);

    return NextResponse.json({
      success: true,
      disabledStudentIds: nextConfig.disabled_student_ids,
    });
  } catch (error: any) {
    console.error('session-guard-config POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
