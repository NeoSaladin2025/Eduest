import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface StudentTempProgress {
  exam_id: string;
  student_id: string;
  student_name?: string;
  answers: Record<string, any>;
  unknown_questions?: number[];
  current_question_idx?: number;
  total_questions?: number;
  answered_count?: number;
  time_left?: number;
  installment_set_index?: number | null;
  installment_set_round?: number | null;
  updated_at: string;
  updated_by?: "student" | "teacher";
}

// GET: 특정 시험지의 모든 학생 임시 진행 상태 또는 특정 학생 상태 조회 (단일 행 / 인덱스 조회)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    const studentId = searchParams.get("studentId");

    if (!examId && !studentId) {
      return NextResponse.json({ success: false, error: "examId 또는 studentId가 필요합니다." }, { status: 400 });
    }

    // 1) 특정 시험지 + 특정 학생 단건 조회
    if (examId && studentId) {
      const id = `${examId}_${studentId}`;
      const { data, error } = await supabase
        .from("student_temp_progress")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ success: true, progress: data || null });
    }

    // 2) 특정 시험지의 학생별 맵 추출 (응시 현황 모달용, key: student_id)
    if (examId) {
      const { data, error } = await supabase
        .from("student_temp_progress")
        .select("*")
        .eq("exam_id", examId);

      if (error) throw error;
      const examProgressMap: Record<string, StudentTempProgress> = {};
      (data || []).forEach((val: any) => {
        if (val?.student_id) {
          examProgressMap[val.student_id] = val;
        }
      });
      return NextResponse.json({ success: true, progressMap: examProgressMap });
    }

    // 3) 특정 학생의 시험지별 맵 추출 (학생 필터 카드 목록용, key: exam_id)
    if (studentId) {
      const { data, error } = await supabase
        .from("student_temp_progress")
        .select("*")
        .eq("student_id", studentId);

      if (error) throw error;
      const studentProgressMap: Record<string, StudentTempProgress> = {};
      (data || []).forEach((val: any) => {
        if (val?.exam_id) {
          studentProgressMap[val.exam_id] = val;
        }
      });
      return NextResponse.json({ success: true, progressMap: studentProgressMap });
    }

    return NextResponse.json({ success: true, progressMap: {} });
  } catch (error: any) {
    console.error("temp-progress GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 임시 답안 저장 (단일 행 upsert -> 동시성 덮어쓰기 원천 차단)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      examId,
      studentId,
      studentName,
      answers,
      unknownQuestions,
      unknown_questions,
      currentQuestionIndex,
      totalQuestions,
      timeLeft,
      installmentSetIndex,
      installmentSetRound,
      updatedBy = "student",
    } = body;

    if (!examId || !studentId) {
      return NextResponse.json({ success: false, error: "examId와 studentId는 필수입니다." }, { status: 400 });
    }

    const id = `${examId}_${studentId}`;
    const { data: existing } = await supabase
      .from("student_temp_progress")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const cleanAnswers = typeof answers === "object" && answers !== null
      ? answers
      : (existing?.answers || {});

    let answeredCount = 0;
    Object.values(cleanAnswers).forEach((ans: any) => {
      if (ans === undefined || ans === null || ans === "") return;
      if (typeof ans === "object") {
        if (Object.values(ans).some((v) => Boolean(String(v || "").trim()))) {
          answeredCount++;
        }
      } else if (String(ans).trim()) {
        answeredCount++;
      }
    });

    const resolvedUnknowns = Array.isArray(unknownQuestions)
      ? unknownQuestions
      : Array.isArray(unknown_questions)
      ? unknown_questions
      : existing?.unknown_questions || [];

    const progressItem = {
      id,
      exam_id: examId,
      student_id: studentId,
      student_name: studentName || existing?.student_name || "",
      answers: cleanAnswers,
      unknown_questions: resolvedUnknowns,
      current_question_idx:
        typeof currentQuestionIndex === "number"
          ? currentQuestionIndex
          : existing?.current_question_idx || 0,
      total_questions:
        typeof totalQuestions === "number"
          ? totalQuestions
          : existing?.total_questions || 0,
      answered_count: answeredCount,
      time_left:
        typeof timeLeft === "number"
          ? Math.round(timeLeft)
          : existing?.time_left ?? null,
      installment_set_index:
        typeof installmentSetIndex === "number"
          ? installmentSetIndex
          : existing?.installment_set_index ?? null,
      installment_set_round:
        typeof installmentSetRound === "number"
          ? installmentSetRound
          : existing?.installment_set_round ?? null,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    const { error: upsertErr } = await supabase
      .from("student_temp_progress")
      .upsert(progressItem, { onConflict: "id" });

    if (upsertErr) {
      throw new Error(`임시 저장 실패: ${upsertErr.message}`);
    }

    return NextResponse.json({ success: true, data: progressItem });
  } catch (error: any) {
    console.error("temp-progress POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 제출 완료/새 회차 시작 시 임시 저장 레코드 정리 (쿼리 파라미터 & JSON 바디 둘 다 지원)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let examId = searchParams.get("examId");
    let studentId = searchParams.get("studentId");

    if (!examId || !studentId) {
      try {
        const body = await req.json();
        examId = examId || body?.examId || null;
        studentId = studentId || body?.studentId || null;
      } catch {}
    }

    if (!examId || !studentId) {
      return NextResponse.json({ success: false, error: "examId와 studentId가 필요합니다." }, { status: 400 });
    }

    const id = `${examId}_${studentId}`;
    const { error } = await supabase
      .from("student_temp_progress")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("temp-progress DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
