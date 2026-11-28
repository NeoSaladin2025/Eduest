import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  StudentLibrarySessionRecord,
  LibrarySessionActivityItem,
  getKSTDateString,
} from '@/lib/libraryAnalyticsTypes';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate'); // YYYY-MM-DD
    const endDateParam = searchParams.get('endDate');     // YYYY-MM-DD
    const daysParam = searchParams.get('days');           // e.g. "30"
    const gradeParam = searchParams.get('grade');
    const studentIdParam = searchParams.get('studentId');

    let query = supabase
      .from('student_library_daily')
      .select('*')
      .order('date', { ascending: false })
      .order('total_duration_sec', { ascending: false })
      .limit(1000);

    if (studentIdParam) {
      query = query.eq('student_id', studentIdParam);
    }

    if (gradeParam && gradeParam !== 'ALL' && gradeParam !== '전체') {
      query = query.ilike('student_grade', `${gradeParam}%`);
    }

    if (startDateParam && endDateParam) {
      query = query.gte('date', startDateParam).lte('date', endDateParam);
    } else if (startDateParam) {
      query = query.gte('date', startDateParam);
    } else if (daysParam) {
      const numDays = parseInt(daysParam, 10) || 30;
      const cutoffDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.gte('date', cutoffDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const records: StudentLibrarySessionRecord[] = (data || []).map((row: any) => ({
      id: row.id,
      student_id: row.student_id,
      student_name: row.student_name || '학생',
      student_grade: row.student_grade || '공통',
      date: row.date,
      total_duration_sec: row.total_duration_sec || 0,
      first_access_at: row.first_access_at,
      last_access_at: row.last_access_at,
      sessions: Array.isArray(row.sessions) ? row.sessions : [],
      items_summary: row.items_summary || {},
      updated_at: row.updated_at,
    }));

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
    const supabase = getSupabase();

    // 해당 학생 + 날짜 단일 행만 조회 (기존 752KB 전체 JSON 왕복 제거)
    const { data: existingRow, error: readErr } = await supabase
      .from('student_library_daily')
      .select('*')
      .eq('id', recordKey)
      .maybeSingle();

    if (readErr) throw readErr;

    const record: StudentLibrarySessionRecord = existingRow
      ? {
          id: existingRow.id,
          student_id: existingRow.student_id,
          student_name: studentName || existingRow.student_name || '학생',
          student_grade: studentGrade || existingRow.student_grade || '공통',
          date: existingRow.date,
          total_duration_sec: existingRow.total_duration_sec || 0,
          first_access_at: existingRow.first_access_at || session.started_at || new Date().toISOString(),
          last_access_at: existingRow.last_access_at || session.ended_at || new Date().toISOString(),
          sessions: Array.isArray(existingRow.sessions) ? [...existingRow.sessions] : [],
          items_summary: existingRow.items_summary ? { ...existingRow.items_summary } : {},
          updated_at: existingRow.updated_at || new Date().toISOString(),
        }
      : {
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

    validItems.forEach((item) => {
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
      sum.totalDurationSec += item.durationSec || 0;
      sum.totalOpenCount += item.openCount || 0;
      sum.totalSolutionViews += item.solutionViews || 0;
    });

    const { error: upsertErr } = await supabase
      .from('student_library_daily')
      .upsert(record, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ success: true, recordId: recordKey });
  } catch (err: any) {
    console.error('Failed to save library analytics session:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
