import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { DirectAlertPayload } from "@/lib/directAlertTypes";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

const DIRECT_ALERTS_DRIVE_ID = "monitoring_direct_alerts_data";

interface StoredDirectAlerts {
  alerts: Record<string, DirectAlertPayload>; // student_id -> latest alert
  updated_at: string;
}

async function getStoredAlerts(): Promise<Record<string, DirectAlertPayload>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", DIRECT_ALERTS_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) return {};
  try {
    const parsed: StoredDirectAlerts = JSON.parse(data.file_data);
    return parsed.alerts && typeof parsed.alerts === "object" ? parsed.alerts : {};
  } catch {
    return {};
  }
}

async function saveStoredAlerts(alerts: Record<string, DirectAlertPayload>) {
  const supabase = getSupabase();
  const nowMs = Date.now();
  const cleaned: Record<string, DirectAlertPayload> = {};

  // 만료된 확인 기록(2시간 경과) 및 종료된 챌린지(종료 후 30분 경과) 자동 정리
  Object.entries(alerts).forEach(([studentId, alert]) => {
    if (!alert) return;
    const createdMs = new Date(alert.created_at).getTime() || nowMs;
    if (alert.status === "acked") {
      const ackMs = alert.acked_at ? new Date(alert.acked_at).getTime() : createdMs;
      if (nowMs - ackMs > 2 * 60 * 60 * 1000) return;
    } else if (alert.status === "challenge" && alert.challenge_end_at) {
      const endMs = new Date(alert.challenge_end_at).getTime();
      if (nowMs - endMs > 30 * 60 * 1000) return;
    } else if (nowMs - createdMs > 12 * 60 * 60 * 1000) {
      return;
    }
    cleaned[studentId] = alert;
  });

  const jsonString = JSON.stringify({
    alerts: cleaned,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: DIRECT_ALERTS_DRIVE_ID,
      name: "monitoring_direct_alerts_data.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    throw new Error(`다이렉트 경고 저장 실패: ${error.message}`);
  }
}

// GET: 전체 또는 특정 학생의 활성 다이렉트 경고 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");

    const alerts = await getStoredAlerts();

    if (studentId) {
      const alert = alerts[studentId] || null;
      // 이미 챌린지가 끝났으면 완료 상태 처리
      if (alert && alert.status === "challenge" && alert.challenge_end_at) {
        if (Date.now() >= new Date(alert.challenge_end_at).getTime()) {
          alert.status = "acked";
        }
      }
      return NextResponse.json({ success: true, alert });
    }

    return NextResponse.json({ success: true, alerts });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: 경고 발송(단일/단체), 학생 확인(ACK), 교사 해제(CLEAR), 챌린지 이탈 보고
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const alerts = await getStoredAlerts();

    if (action === "send") {
      const incoming: DirectAlertPayload[] = Array.isArray(body.alerts)
        ? body.alerts
        : body.alert
        ? [body.alert]
        : [];

      if (incoming.length === 0) {
        return NextResponse.json({ success: false, error: "발송할 경고 데이터가 없습니다." }, { status: 400 });
      }

      const savedList: DirectAlertPayload[] = [];
      incoming.forEach((item) => {
        if (!item?.student_id) return;
        const normalized: DirectAlertPayload = {
          ...item,
          created_at: item.created_at || new Date().toISOString(),
          status: item.mode === "SNIPER_WATCH" ? "watching" : "pending",
        };
        alerts[item.student_id] = normalized;
        savedList.push(normalized);
      });

      await saveStoredAlerts(alerts);
      return NextResponse.json({ success: true, alerts: savedList });
    }

    if (action === "ack") {
      const { studentId, alertId, ackElapsedSec, ackNote } = body;
      if (!studentId) {
        return NextResponse.json({ success: false, error: "studentId가 필요합니다." }, { status: 400 });
      }

      const existing = alerts[studentId];
      if (!existing || (alertId && existing.id !== alertId)) {
        return NextResponse.json({ success: true, alert: existing || null });
      }

      const nowIso = new Date().toISOString();
      const shouldStartChallenge =
        existing.mode === "FOCUS_CHALLENGE" || Boolean(existing.attach_focus_challenge);
      const challengeMin = Math.max(1, Number(existing.challenge_duration_min) || 10);

      const updated: DirectAlertPayload = shouldStartChallenge
        ? {
            ...existing,
            status: "challenge",
            acked_at: nowIso,
            ack_elapsed_sec: typeof ackElapsedSec === "number" ? ackElapsedSec : undefined,
            ack_note: ackNote,
            challenge_started_at: nowIso,
            challenge_end_at: new Date(Date.now() + challengeMin * 60 * 1000).toISOString(),
            challenge_violations: existing.challenge_violations || 0,
          }
        : {
            ...existing,
            status: "acked",
            acked_at: nowIso,
            ack_elapsed_sec: typeof ackElapsedSec === "number" ? ackElapsedSec : undefined,
            ack_note: ackNote,
          };

      alerts[studentId] = updated;
      await saveStoredAlerts(alerts);
      return NextResponse.json({ success: true, alert: updated });
    }

    if (action === "challenge_violation") {
      const { studentId, awaySec } = body;
      if (!studentId || !alerts[studentId]) {
        return NextResponse.json({ success: false, error: "대상 경고 없음" }, { status: 404 });
      }
      const existing = alerts[studentId];
      const nextViolations = (existing.challenge_violations || 0) + 1;
      const retriggered: DirectAlertPayload = {
        ...existing,
        id: `alert_viol_${Date.now()}`,
        mode: "SILENT_LOCKDOWN",
        message: `${existing.student_name} 학생! 집중 검증 도중 또 화면을 이탈(${awaySec || 0}초)했다. 검증 실패 — 즉시 집중해라!`,
        ambush_on_return: true,
        ambush_away_sec: awaySec,
        attach_focus_challenge: true,
        status: "pending",
        challenge_violations: nextViolations,
        created_at: new Date().toISOString(),
      };
      alerts[studentId] = retriggered;
      await saveStoredAlerts(alerts);
      return NextResponse.json({ success: true, alert: retriggered });
    }

    if (action === "clear") {
      const studentIds: string[] = Array.isArray(body.studentIds)
        ? body.studentIds
        : body.studentId
        ? [body.studentId]
        : [];
      studentIds.forEach((id) => {
        delete alerts[id];
      });
      await saveStoredAlerts(alerts);
      return NextResponse.json({ success: true, clearedIds: studentIds });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
