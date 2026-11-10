import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  StudentHomeStudyDayRecord, 
  HomeStudySessionItem, 
  getKoreanDateString 
} from '@/lib/homeStudyTypes';

const SESSIONS_DRIVE_ID = 'home_study_sessions';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

interface StoredSessionsData {
  records: Record<string, StudentHomeStudyDayRecord>;
  updated_at: string;
}

async function getStoredSessions(): Promise<Record<string, StudentHomeStudyDayRecord>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('exam_library')
    .select('file_data')
    .eq('drive_id', SESSIONS_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) return {};
  try {
    const parsed: StoredSessionsData = JSON.parse(data.file_data);
    return parsed.records || {};
  } catch {
    return {};
  }
}

async function saveStoredSessions(records: Record<string, StudentHomeStudyDayRecord>) {
  const supabase = getSupabase();

  // 성능 최적화: 최근 90일치 레코드만 유지 (오래된 데이터 자동 정리)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pruned: Record<string, StudentHomeStudyDayRecord> = {};
  
  Object.keys(records).forEach(key => {
    const rec = records[key];
    if (rec && rec.date >= cutoff) {
      pruned[key] = rec;
    }
  });

  const jsonString = JSON.stringify({
    records: pruned,
    updated_at: new Date().toISOString(),
  });

  await supabase.from('exam_library').upsert(
    {
      drive_id: SESSIONS_DRIVE_ID,
      name: 'home_study_sessions.json',
      type: 'file',
      grade: '공통',
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'drive_id' }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD
    const gradeParam = searchParams.get('grade');
    const studentIdParam = searchParams.get('studentId');
    const daysParam = searchParams.get('days'); // e.g. "7" for recent 7 days

    const recordsMap = await getStoredSessions();
    let records = Object.values(recordsMap);

    if (studentIdParam) {
      records = records.filter(r => r.student_id === studentIdParam);
    }

    if (gradeParam && gradeParam !== 'ALL' && gradeParam !== '전체') {
      records = records.filter(r => r.student_grade && r.student_grade.startsWith(gradeParam));
    }

    if (dateParam) {
      records = records.filter(r => r.date === dateParam);
    } else if (daysParam) {
      const numDays = parseInt(daysParam, 10) || 7;
      const cutoffDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      records = records.filter(r => r.date >= cutoffDate);
    }

    // 최신 날짜순 정렬
    records.sort((a, b) => b.date.localeCompare(a.date) || b.total_duration_sec - a.total_duration_sec);

    return NextResponse.json({ success: true, records });
  } catch (err: any) {
    console.error('Failed to get home study sessions:', err);
    return NextResponse.json({ success: false, error: err.message, records: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { studentId, studentName, studentGrade, session } = body;

    if (!studentId || !session || typeof session.duration_sec !== 'number') {
      return NextResponse.json({ success: false, error: 'studentId and valid session required' }, { status: 400 });
    }

    // 10초 미만의 미세 체류는 노이즈로 보고 무시
    if (session.duration_sec < 10) {
      return NextResponse.json({ success: true, message: 'Ignored too short duration (<10s)' });
    }

    const sessionStartDate = session.started_at 
      ? getKoreanDateString(new Date(session.started_at))
      : getKoreanDateString();

    const recordKey = `${studentId}_${sessionStartDate}`;
    const recordsMap = await getStoredSessions();

    let record = recordsMap[recordKey];
    if (!record) {
      record = {
        id: recordKey,
        student_id: studentId,
        student_name: studentName || '학생',
        student_grade: studentGrade || '공통',
        date: sessionStartDate,
        total_duration_sec: 0,
        first_access_at: session.started_at || new Date().toISOString(),
        last_access_at: session.ended_at || new Date().toISOString(),
        sessions: [],
        activities_summary: {
          library_sec: 0,
          review_sec: 0,
          test_sec: 0,
          video_sec: 0,
          homework_sec: 0,
          other_sec: 0,
        },
        updated_at: new Date().toISOString(),
      };
    }

    // 세션 추가
    const sessionItem: HomeStudySessionItem = {
      id: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      started_at: session.started_at || new Date().toISOString(),
      ended_at: session.ended_at || new Date().toISOString(),
      duration_sec: Math.round(session.duration_sec),
      activities: Array.isArray(session.activities) ? session.activities : [],
    };

    record.sessions.push(sessionItem);
    record.total_duration_sec += sessionItem.duration_sec;

    if (sessionItem.started_at < record.first_access_at) {
      record.first_access_at = sessionItem.started_at;
    }
    if (sessionItem.ended_at > record.last_access_at) {
      record.last_access_at = sessionItem.ended_at;
    }

    // 활동별 누적 합계 재계산
    sessionItem.activities.forEach(act => {
      const dur = Math.round(act.duration_sec || 0);
      if (act.mode === 'library') record.activities_summary.library_sec += dur;
      else if (act.mode === 'review') record.activities_summary.review_sec += dur;
      else if (act.mode === 'test') record.activities_summary.test_sec += dur;
      else if (act.mode === 'video') record.activities_summary.video_sec += dur;
      else if (act.mode === 'homework') record.activities_summary.homework_sec += dur;
      else record.activities_summary.other_sec += dur;
    });

    record.updated_at = new Date().toISOString();
    recordsMap[recordKey] = record;

    await saveStoredSessions(recordsMap);

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    console.error('Save session error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
