import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const AWAY_LOGS_DRIVE_ID = "monitoring_away_logs";

export interface StudentAwayLog {
  id: string; // `away_${Date.now()}_${random}`
  student_id: string;
  student_name: string;
  student_grade: string;
  started_at: string; // ISO string
  ended_at: string; // ISO string
  duration_sec: number; // in seconds
  context: 'test' | 'library' | 'review' | 'video' | 'homework' | 'idle';
  location_title?: string;
  exam_title?: string;
  question_idx?: number;
  is_archived?: boolean; // 상담용 영구 보관 여부
  created_at: string;
}

async function getAwayLogs(): Promise<StudentAwayLog[]> {
  const { data, error } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", AWAY_LOGS_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.logs) ? parsed.logs : [];
  } catch {
    return [];
  }
}

async function saveAwayLogs(logs: StudentAwayLog[]) {
  // 최신 1,000건만 유지 (용량 및 성능 최적화, 보관된 로그는 우선 보존)
  const archived = logs.filter(l => l.is_archived);
  const regular = logs.filter(l => !l.is_archived).slice(-800);
  const pruned = [...archived, ...regular].sort((a, b) => 
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  const jsonString = JSON.stringify({
    logs: pruned,
    updated_at: new Date().toISOString(),
  });

  await supabase.from("exam_library").upsert(
    {
      drive_id: AWAY_LOGS_DRIVE_ID,
      name: "monitoring_away_logs.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const date = searchParams.get("date"); // YYYY-MM-DD

    let logs = await getAwayLogs();

    if (studentId) {
      logs = logs.filter(l => l.student_id === studentId);
    }

    if (date) {
      logs = logs.filter(l => l.started_at.startsWith(date) || l.ended_at.startsWith(date));
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, log, logId, studentId } = body;

    let logs = await getAwayLogs();

    if (action === "create" && log) {
      // 3초 미만의 미세 깜빡임은 필터링
      if (typeof log.duration_sec === "number" && log.duration_sec < 3) {
        return NextResponse.json({ success: true, ignored: true });
      }

      const newLog: StudentAwayLog = {
        id: `away_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        student_id: log.student_id,
        student_name: log.student_name || "학생",
        student_grade: log.student_grade || "",
        started_at: log.started_at || new Date().toISOString(),
        ended_at: log.ended_at || new Date().toISOString(),
        duration_sec: Math.max(1, log.duration_sec || 1),
        context: log.context || "idle",
        location_title: log.location_title || "",
        exam_title: log.exam_title || "",
        question_idx: log.question_idx,
        is_archived: false,
        created_at: new Date().toISOString(),
      };

      logs.unshift(newLog);
      await saveAwayLogs(logs);

      return NextResponse.json({ success: true, log: newLog });
    }

    if (action === "delete" && logId) {
      logs = logs.filter(l => l.id !== logId);
      await saveAwayLogs(logs);
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_archive" && logId) {
      logs = logs.map(l => l.id === logId ? { ...l, is_archived: !l.is_archived } : l);
      await saveAwayLogs(logs);
      return NextResponse.json({ success: true });
    }

    if (action === "clear_today" && studentId) {
      const today = new Date().toISOString().slice(0, 10);
      logs = logs.filter(l => !(l.student_id === studentId && l.started_at.startsWith(today) && !l.is_archived));
      await saveAwayLogs(logs);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
