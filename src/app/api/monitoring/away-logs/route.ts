import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export interface StudentAwayLog {
  id: string;
  student_id: string;
  student_name: string;
  student_grade: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  context: "test" | "library" | "review" | "video" | "homework" | "idle";
  location_title?: string;
  exam_title?: string;
  question_idx?: number | null;
  is_archived?: boolean;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const date = searchParams.get("date"); // YYYY-MM-DD

    let query = supabase
      .from("student_away_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1000);

    if (studentId) {
      query = query.eq("student_id", studentId);
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const startIso = `${date}T00:00:00.000Z`;
      const endDate = new Date(`${date}T00:00:00.000Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      query = query.gte("started_at", startIso).lt("started_at", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, logs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { action, log, logId, studentId } = body;

    if (action === "create" && log) {
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
        duration_sec: Math.max(1, Math.round(Number(log.duration_sec) || 1)),
        context: log.context || "idle",
        location_title: log.location_title || "",
        exam_title: log.exam_title || "",
        question_idx: typeof log.question_idx === "number" ? log.question_idx : null,
        is_archived: false,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("student_away_logs").insert(newLog);
      if (error) throw error;

      return NextResponse.json({ success: true, log: newLog });
    }

    if (action === "delete" && logId) {
      const { error } = await supabase.from("student_away_logs").delete().eq("id", logId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_archive" && logId) {
      const { data: existing, error: fetchErr } = await supabase
        .from("student_away_logs")
        .select("is_archived")
        .eq("id", logId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (existing) {
        const { error: updErr } = await supabase
          .from("student_away_logs")
          .update({ is_archived: !existing.is_archived })
          .eq("id", logId);
        if (updErr) throw updErr;
      }
      return NextResponse.json({ success: true });
    }

    if (action === "clear_today" && studentId) {
      const today = new Date().toISOString().slice(0, 10);
      const startIso = `${today}T00:00:00.000Z`;
      const nextDay = new Date(`${today}T00:00:00.000Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const { error } = await supabase
        .from("student_away_logs")
        .delete()
        .eq("student_id", studentId)
        .eq("is_archived", false)
        .gte("started_at", startIso)
        .lt("started_at", nextDay.toISOString());

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "clear_under_seconds" && studentId) {
      const maxSeconds = Math.max(1, Number(body.maxSeconds) || 5);
      const scope: "today" | "all" = body.scope === "all" ? "all" : "today";
      const preserveArchived = body.preserveArchived !== false;

      let delQuery = supabase
        .from("student_away_logs")
        .delete()
        .eq("student_id", studentId)
        .lte("duration_sec", maxSeconds);

      if (preserveArchived) {
        delQuery = delQuery.eq("is_archived", false);
      }

      if (scope === "today") {
        const today = new Date().toISOString().slice(0, 10);
        const startIso = `${today}T00:00:00.000Z`;
        const nextDay = new Date(`${today}T00:00:00.000Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        delQuery = delQuery.gte("started_at", startIso).lt("started_at", nextDay.toISOString());
      }

      const { data: removedRows, error: delErr } = await delQuery.select("id");
      if (delErr) throw delErr;

      const { data: remainingLogs, error: remErr } = await supabase
        .from("student_away_logs")
        .select("*")
        .eq("student_id", studentId)
        .order("started_at", { ascending: false })
        .limit(500);
      if (remErr) throw remErr;

      return NextResponse.json({
        success: true,
        removedCount: (removedRows || []).length,
        maxSeconds,
        logs: remainingLogs || [],
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
