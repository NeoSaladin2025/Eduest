import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  StudentHomeStudyDayRecord,
  HomeStudySessionItem,
  getKoreanDateString,
} from '@/lib/homeStudyTypes';

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
    const dateParam = searchParams.get('date'); // YYYY-MM-DD
    const gradeParam = searchParams.get('grade');
    const studentIdParam = searchParams.get('studentId');
    const daysParam = searchParams.get('days'); // e.g. "7" for recent 7 days

    let query = supabase
      .from('student_home_study_daily')
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

    if (dateParam) {
      query = query.eq('date', dateParam);
    } else if (daysParam) {
      const numDays = parseInt(daysParam, 10) || 7;
      const cutoffDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.gte('date', cutoffDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const records: StudentHomeStudyDayRecord[] = (data || []).map((row: any) => ({
      id: row.id,
      student_id: row.student_id,
      student_name: row.student_name || '학생',
      student_grade: row.student_grade || '공통',
      date: row.date,
      total_duration_sec: row.total_duration_sec || 0,
      first_access_at: row.first_access_at,
      last_access_at: row.last_access_at,
      sessions: Array.isArray(row.sessions) ? row.sessions : [],
      activities_summary: row.activities_summary || {
        library_sec: 0,
        review_sec: 0,
        test_sec: 0,
        video_sec: 0,
        homework_sec: 0,
        other_sec: 0,
      },
      updated_at: row.updated_at,
    }));

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

    if (session.duration_sec < 10) {
      return NextResponse.json({ success: true, message: 'Ignored too short duration (<10s)' });
    }

    const sessionStartDate = session.started_at
      ? getKoreanDateString(new Date(session.started_at))
      : getKoreanDateString();

    const recordKey = `${studentId}_${sessionStartDate}`;
    const supabase = getSupabase();

    // 해당 학생 + 날짜 단일 행만 조회 (기존 547KB 전체 JSON 왕복 제거)
    const { data: existingRow, error: readErr } = await supabase
      .from('student_home_study_daily')
      .select('*')
      .eq('id', recordKey)
      .maybeSingle();

    if (readErr) throw readErr;

    const record: StudentHomeStudyDayRecord = existingRow
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
          activities_summary: {
            library_sec: existingRow.activities_summary?.library_sec || 0,
            review_sec: existingRow.activities_summary?.review_sec || 0,
            test_sec: existingRow.activities_summary?.test_sec || 0,
            video_sec: existingRow.activities_summary?.video_sec || 0,
            homework_sec: existingRow.activities_summary?.homework_sec || 0,
            other_sec: existingRow.activities_summary?.other_sec || 0,
          },
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

    sessionItem.activities.forEach((act) => {
      const dur = Math.round(act.duration_sec || 0);
      if (act.mode === 'library') record.activities_summary.library_sec += dur;
      else if (act.mode === 'review') record.activities_summary.review_sec += dur;
      else if (act.mode === 'test') record.activities_summary.test_sec += dur;
      else if (act.mode === 'video') record.activities_summary.video_sec += dur;
      else if (act.mode === 'homework') record.activities_summary.homework_sec += dur;
      else record.activities_summary.other_sec += dur;
    });

    record.updated_at = new Date().toISOString();

    const { error: upsertErr } = await supabase
      .from('student_home_study_daily')
      .upsert(record, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    console.error('Save session error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
