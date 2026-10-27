import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/authUtils";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = "test2_temp_progress_data";

export interface StudentTempProgress {
  exam_id: string;
  student_id: string;
  student_name?: string;
  answers: Record<string, any>;
  current_question_idx?: number;
  total_questions?: number;
  answered_count?: number;
  time_left?: number;
  updated_at: string;
  updated_by?: "student" | "teacher";
}

// 헬퍼: DB에서 전체 임시 진행 상태 맵 로드
async function getAllTempProgress(): Promise<Record<string, StudentTempProgress>> {
  const { data, error } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", RECORD_DRIVE_ID)
    .maybeSingle();

  if (error || !data?.file_data) return {};
  try {
    const parsed = JSON.parse(data.file_data);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// 헬퍼: DB에 전체 임시 진행 상태 맵 저장
async function saveAllTempProgress(map: Record<string, StudentTempProgress>) {
  const jsonString = JSON.stringify(map);
  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: RECORD_DRIVE_ID,
      name: "test2_temp_progress.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    console.error("Failed to save temp progress:", error);
    throw new Error(`임시 저장 실패: ${error.message}`);
  }
}

// GET: 특정 시험지의 모든 학생 임시 진행 상태 또는 특정 학생 상태 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    const studentId = searchParams.get("studentId");

    if (!examId) {
      return NextResponse.json({ success: false, error: "examId가 필요합니다." }, { status: 400 });
    }

    const allMap = await getAllTempProgress();
    
    // 특정 시험지의 학생별 맵 추출
    const examProgressMap: Record<string, StudentTempProgress> = {};
    Object.entries(allMap).forEach(([key, val]) => {
      if (val && val.exam_id === examId) {
        examProgressMap[val.student_id] = val;
      }
    });

    if (studentId) {
      const single = examProgressMap[studentId] || null;
      return NextResponse.json({ success: true, progress: single });
    }

    return NextResponse.json({ success: true, progressMap: examProgressMap });
  } catch (error: any) {
    console.error("temp-progress GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 임시 답안 저장 (학생 실시간 전송 or 선생님 수동 입력)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      examId,
      studentId,
      studentName,
      answers,
      currentQuestionIndex,
      totalQuestions,
      timeLeft,
      updatedBy = "student",
    } = body;

    if (!examId || !studentId) {
      return NextResponse.json({ success: false, error: "examId와 studentId는 필수입니다." }, { status: 400 });
    }

    // 답안 작성 개수 계산
    const cleanAnswers = typeof answers === "object" && answers !== null ? answers : {};
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

    const key = `${examId}_${studentId}`;
    const allMap = await getAllTempProgress();

    const progressItem: StudentTempProgress = {
      exam_id: examId,
      student_id: studentId,
      student_name: studentName || allMap[key]?.student_name || "",
      answers: cleanAnswers,
      current_question_idx: typeof currentQuestionIndex === "number" ? currentQuestionIndex : allMap[key]?.current_question_idx || 0,
      total_questions: typeof totalQuestions === "number" ? totalQuestions : allMap[key]?.total_questions || 0,
      answered_count: answeredCount,
      time_left: typeof timeLeft === "number" ? timeLeft : allMap[key]?.time_left,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    allMap[key] = progressItem;
    await saveAllTempProgress(allMap);

    return NextResponse.json({ success: true, data: progressItem });
  } catch (error: any) {
    console.error("temp-progress POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 제출 완료 시 임시 저장 레코드 정리
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    const studentId = searchParams.get("studentId");

    if (!examId || !studentId) {
      return NextResponse.json({ success: false, error: "examId와 studentId가 필요합니다." }, { status: 400 });
    }

    const key = `${examId}_${studentId}`;
    const allMap = await getAllTempProgress();
    if (allMap[key]) {
      delete allMap[key];
      await saveAllTempProgress(allMap);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("temp-progress DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
