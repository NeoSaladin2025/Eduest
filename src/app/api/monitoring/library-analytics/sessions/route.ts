import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  StudentLibrarySessionRecord, 
  LibrarySessionActivityItem,
  getKSTDateString 
} from '@/lib/libraryAnalyticsTypes';

const SESSIONS_DRIVE_ID = 'library_analytics_sessions';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

interface StoredLibraryAnalyticsData {
  records: Record<string, StudentLibrarySessionRecord>;
  updated_at: string;
}

async function getStoredRecords(): Promise<Record<string, StudentLibrarySessionRecord>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('exam_library')
    .select('file_data')
    .eq('drive_id', SESSIONS_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) return {};
  try {
    const parsed: StoredLibraryAnalyticsData = JSON.parse(data.file_data);
    return parsed.records || {};
  } catch {
    return {};
  }
}

async function saveStoredRecords(records: Record<string, StudentLibrarySessionRecord>) {
  const supabase = getSupabase();

  // 성능 최적화: 최근 90일치 레코드만 유지
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pruned: Record<string, StudentLibrarySessionRecord> = {};
  
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
      name: 'library_analytics_sessions.json',
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
    const startDateParam = searchParams.get('startDate'); // YYYY-MM-DD
    const endDateParam = searchParams.get('endDate');     // YYYY-MM-DD
    const daysParam = searchParams.get('days');           // e.g. "30"
    const gradeParam = searchParams.get('grade');
    const studentIdParam = searchParams.get('studentId');

    const recordsMap = await getStoredRecords();
    let records = Object.values(recordsMap);

    if (studentIdParam) {
      records = records.filter(r => r.student_id === studentIdParam);
    }

    if (gradeParam && gradeParam !== 'ALL' && gradeParam !== '전체') {
      records = records.filter(r => r.student_grade && r.student_grade.startsWith(gradeParam));
    }

    // 날짜 범위 필터링 (시작일 ~ 종료일 달력 지원)
    if (startDateParam && endDateParam) {
      records = records.filter(r => r.date >= startDateParam && r.date <= endDateParam);
    } else if (startDateParam) {
      records = records.filter(r => r.date >= startDateParam);
    } else if (daysParam) {
      const numDays = parseInt(daysParam, 10) || 30;
      const cutoffDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      records = records.filter(r => r.date >= cutoffDate);
    }

    // 최신 날짜 및 총 체류시간 내림차순 정렬
    records.sort((a, b) => b.date.localeCompare(a.date) || b.total_duration_sec - a.total_duration_sec);

    return NextResponse.json({ success: true, records });
  } catch (err: any) {
    console.error('Failed to get library analytics sessions:', err);
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

    if (!studentId || !session || !Array.isArray(session.items) || session.items.length === 0) {
      return NextResponse.json({ success: false, error: 'studentId and valid session with items required' }, { status: 400 });
    }

    // 1초 이상의 실질적 열람이 있는 아이템들만 필터링
    const validItems: LibrarySessionActivityItem[] = session.items.filter(
      (item: any) => (item.durationSec || 0) > 0 || (item.openCount || 0) > 0
    );

    if (validItems.length === 0) {
      return NextResponse.json({ success: true, message: 'No valid duration items to record' });
    }

    const sessionStartDate = session.started_at 
      ? getKSTDateString(new Date(session.started_at))
      : getKSTDateString();

    const recordKey = `${studentId}_${sessionStartDate}`;
    const recordsMap = await getStoredRecords();

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
        items_summary: {},
        updated_at: new Date().toISOString(),
      };
    }

    // 세션 총 체류시간 계산
    const sessionDuration = validItems.reduce((acc, cur) => acc + (cur.durationSec || 0), 0);

    const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    record.sessions.push({
      id: sessionId,
      started_at: session.started_at || new Date().toISOString(),
      ended_at: session.ended_at || new Date().toISOString(),
      duration_sec: sessionDuration,
      items: validItems,
    });

    record.total_duration_sec += sessionDuration;
    record.last_access_at = session.ended_at || new Date().toISOString();
    record.updated_at = new Date().toISOString();

    // 문항별/폴더별 누적 요약(items_summary) 갱신
    validItems.forEach(item => {
      const summaryKey = `${item.folderDriveId}___${item.fileName}`;
      if (!record.items_summary[summaryKey]) {
        record.items_summary[summaryKey] = {
          folderDriveId: item.folderDriveId,
          folderName: item.folderName,
          fileName: item.fileName,
          totalDurationSec: 0,
          totalOpenCount: 0,
          totalSolutionViews: 0,
        };
      }
      const sum = record.items_summary[summaryKey];
      sum.totalDurationSec += (item.durationSec || 0);
      sum.totalOpenCount += (item.openCount || 0);
      sum.totalSolutionViews += (item.solutionViews || 0);
    });

    recordsMap[recordKey] = record;
    await saveStoredRecords(recordsMap);

    return NextResponse.json({ success: true, recordId: recordKey });
  } catch (err: any) {
    console.error('Failed to save library analytics session:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
