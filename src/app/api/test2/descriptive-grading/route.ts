import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { ExamPaper } from "../exam/route";
import { StudentSubmission } from "../student-exams/route";
import {
  getExamPaperByIdDb,
  getExamPapersByIdsDb,
  getPendingDescriptiveSubmissionsDb,
  getSubmissionByStudentAndExamDb,
  upsertSubmissionDb,
} from "@/lib/test2DbStore";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 헬퍼: 학생 이름 맵 생성
async function getStudentsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await supabase.from("students").select("id, name");
    if (data && Array.isArray(data)) {
      data.forEach((st) => map.set(st.id, st.name));
    }
  } catch (e) {
    console.warn("Failed to load students for grading:", e);
  }
  return map;
}

// GET: 서술형 채점 대기 중인 모든 문항 목록 조회 (대기 중인 제출 행만 경량 조회)
export async function GET() {
  try {
    const [pendingSubs, studentsMap] = await Promise.all([
      getPendingDescriptiveSubmissionsDb(),
      getStudentsMap(),
    ]);

    const examIds = Array.from(new Set(pendingSubs.map((s) => s.exam_id).filter(Boolean)));
    const relatedExams = await getExamPapersByIdsDb(examIds);

    const examsMap = new Map<string, ExamPaper>();
    relatedExams.forEach((e) => examsMap.set(e.id, e));

    const pendingItems: Array<{
      submission_id: string;
      student_id: string;
      student_name: string;
      exam_id: string;
      exam_title: string;
      question_id: string;
      question_number: number;
      question_name: string;
      image_url: string;
      user_answer: string;
      correct_answer: string;
      raw_answer: string;
      solution_drive_id: string;
      points: number;
      submitted_at: string;
      proof_image_url?: string;
      is_direct_paper?: boolean;
      is_photo_submission?: boolean;
    }> = [];

    // 최신 제출순으로 정렬
    const sortedSubmissions = [...pendingSubs].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );

    for (const sub of sortedSubmissions) {
      if (!sub.answers) continue;
      const exam = examsMap.get(sub.exam_id);
      const studentName = studentsMap.get(sub.student_id) || sub.student_id;

      for (const [qId, ans] of Object.entries(sub.answers)) {
        if (ans.grading_status === "pending" || (ans.is_descriptive && ans.is_correct === null)) {
          const qIndex = exam ? exam.questions.findIndex((q) => q.id === qId) : -1;
          const examQ = qIndex !== -1 && exam ? exam.questions[qIndex] : null;

          pendingItems.push({
            submission_id: sub.id,
            student_id: sub.student_id,
            student_name: studentName,
            exam_id: sub.exam_id,
            exam_title: sub.exam_title || exam?.title || "시험",
            question_id: qId,
            question_number: qIndex !== -1 ? qIndex + 1 : 1,
            question_name: examQ?.name || "",
            image_url: examQ?.image_url || "",
            user_answer: ans.user_answer,
            correct_answer: ans.correct_answer || examQ?.answer || "",
            raw_answer: ans.raw_answer || examQ?.raw_answer || "",
            solution_drive_id: ans.solution_drive_id || examQ?.solution_drive_id || "",
            points: examQ?.points || 0,
            submitted_at: sub.submitted_at,
            proof_image_url: ans.proof_image_url,
            is_direct_paper: !!ans.is_direct_paper || ans.user_answer === "__DIRECT_PAPER__",
            is_photo_submission: !!ans.is_photo_submission || ans.user_answer === "__PHOTO_SUBMISSION__",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      pending_total: pendingItems.length,
      items: pendingItems,
    });
  } catch (error: any) {
    console.error("Descriptive grading GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 선생님의 서술형 채점 결과 확정 (정답 인정 / 오답 처리 + 모범답안 공개 여부)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { student_id, exam_id, question_id, is_correct, show_solution } = body;

    if (!student_id || !exam_id || !question_id || typeof is_correct !== "boolean") {
      return NextResponse.json(
        { success: false, error: "student_id, exam_id, question_id, is_correct(boolean)가 필요합니다." },
        { status: 400 }
      );
    }

    const submission = await getSubmissionByStudentAndExamDb(student_id, exam_id);

    if (!submission) {
      return NextResponse.json(
        { success: false, error: "해당 학생의 제출 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (!submission.answers || !submission.answers[question_id]) {
      return NextResponse.json(
        { success: false, error: "해당 문항의 답안 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 1. 해당 문항 채점 업데이트
    submission.answers[question_id] = {
      ...submission.answers[question_id],
      is_correct: is_correct,
      grading_status: "reviewed",
      // 선생님이 명시적으로 지정한 값 (기본 true 권장)
      show_solution: show_solution !== undefined ? !!show_solution : true,
      reviewed_at: new Date().toISOString(),
    };

    // 2. 전체 맞은 개수(correct_count) 및 점수(score) 재계산
    let newCorrectCount = 0;
    let remainingPending = 0;
    const answerEntries = Object.values(submission.answers);

    answerEntries.forEach((ans) => {
      if (ans.is_correct === true) {
        newCorrectCount++;
      }
      if (ans.grading_status === "pending") {
        remainingPending++;
      }
    });

    const totalQuestions = submission.total_questions || answerEntries.length;
    // 🌟 시험지의 문항별 배점(points)을 조회하여 실시간 획득 점수 재계산
    let earnedPoints10 = 0;
    let totalExamPoints10 = 0;
    const matchedExam = await getExamPaperByIdDb(submission.exam_id);

    if (matchedExam && Array.isArray(matchedExam.questions)) {
      matchedExam.questions.forEach((q) => {
        const qPoint = typeof q.points === 'number' && q.points > 0
          ? q.points
          : (totalQuestions > 0 ? 100 / totalQuestions : 0);
        const qPoint10 = Math.round(qPoint * 10);
        totalExamPoints10 += qPoint10;
        if (submission.answers[q.id]?.is_correct === true) {
          earnedPoints10 += qPoint10;
        }
      });
    }

    const calculatedScore = totalExamPoints10 > 0
      ? Math.round((earnedPoints10 / totalExamPoints10) * 1000) / 10
      : (totalQuestions > 0 ? Math.round((newCorrectCount / totalQuestions) * 100) : 0);
    const newScore = Number.isInteger(calculatedScore) ? calculatedScore : Number(calculatedScore.toFixed(1));

    submission.correct_count = newCorrectCount;
    submission.score = newScore;
    submission.has_pending_review = remainingPending > 0;
    submission.pending_count = remainingPending;

    await upsertSubmissionDb(submission);

    return NextResponse.json({
      success: true,
      submission,
      message: is_correct ? "정답으로 인정되었습니다." : "오답으로 처리되었습니다.",
      remaining_pending: remainingPending,
    });
  } catch (error: any) {
    console.error("Descriptive grading POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
