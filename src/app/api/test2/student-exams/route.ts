import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { ExamPaper } from "../exam/route";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXAMS_RECORD_DRIVE_ID = "test2_exam_papers_data";
const SUBMISSIONS_RECORD_DRIVE_ID = "test2_student_submissions_data";

export interface StudentSubmission {
  id: string; // `${studentId}_${examId}`
  student_id: string;
  exam_id: string;
  exam_title: string;
  submitted_at: string;
  score: number;
  total_questions: number;
  correct_count: number;
  answers: {
    [questionId: string]: {
      user_answer: string;
      is_correct: boolean;
      correct_answer: string;
      raw_answer: string;
      solution_drive_id: string;
    };
  };
}

// 헬퍼: 전체 시험지 가져오기
async function getExamPapers(): Promise<ExamPaper[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", EXAMS_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.exams) ? parsed.exams : [];
  } catch {
    return [];
  }
}

// 헬퍼: 제출 기록 목록 가져오기
async function getSubmissions(): Promise<StudentSubmission[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", SUBMISSIONS_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.submissions) ? parsed.submissions : [];
  } catch {
    return [];
  }
}

// 헬퍼: 제출 기록 저장하기
async function saveSubmissions(submissions: StudentSubmission[]) {
  const jsonString = JSON.stringify({
    submissions,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: SUBMISSIONS_RECORD_DRIVE_ID,
      name: "test2_student_submissions.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    throw new Error(`제출 데이터 저장 실패: ${error.message}`);
  }
}

// 원형 숫자 등 정규화
function cleanAnswerString(str: string): string {
  if (!str) return "";
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str
    .replace(/[①②③④⑤❶❷❸❹❺]/g, (m) => circledMap[m] || m)
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 정답 비교 판정
function checkAnswerMatch(userAns: string, correctAns: string, rawAns: string): boolean {
  const cUser = cleanAnswerString(userAns);
  const cCorrect = cleanAnswerString(correctAns);
  const cRaw = cleanAnswerString(rawAns);

  if (!cUser) return false;
  if (cUser === cCorrect) return true;
  if (cUser === cRaw) return true;

  // 번호만 일치하는지 (예: user: '5', correct: '5 83')
  const correctNumMatch = cCorrect.match(/^([1-5])/);
  if (correctNumMatch && correctNumMatch[1] === cUser) return true;

  const rawNumMatch = cRaw.match(/^([1-5])/);
  if (rawNumMatch && rawNumMatch[1] === cUser) return true;

  return false;
}

// GET: 학생에게 배정된 시험지 목록 & 응시 상태
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const examId = searchParams.get("examId");

    if (!studentId) {
      return NextResponse.json({ success: false, error: "studentId가 필요합니다." }, { status: 400 });
    }

    const allExams = await getExamPapers();
    const allSubmissions = await getSubmissions();

    // 이 학생에게 배정된 시험지만 필터링
    const assignedExams = allExams.filter(
      (e) => e.assigned_student_ids && e.assigned_student_ids.includes(studentId)
    );

    const submissionsMap = new Map<string, StudentSubmission>();
    allSubmissions
      .filter((s) => s.student_id === studentId)
      .forEach((s) => submissionsMap.set(s.exam_id, s));

    // 특정 시험지 1개 요청인 경우 (응시용 상세 데이터)
    if (examId) {
      const exam = assignedExams.find((e) => e.id === examId);
      if (!exam) {
        return NextResponse.json(
          { success: false, error: "배정된 시험지를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const submission = submissionsMap.get(examId) || null;
      const isSubmitted = !!submission;

      // 제출 전에는 보안을 위해 정답(answer)을 클라이언트에 노출하지 않음
      const sanitizedQuestions = exam.questions.map((q) => ({
        id: q.id,
        drive_id: q.drive_id,
        name: q.name,
        image_url: q.image_url,
        points: q.points,
        // 제출 후에만 정답 및 해설 공개
        answer: isSubmitted ? q.answer : undefined,
        raw_answer: isSubmitted ? q.raw_answer : undefined,
        solution_drive_id: isSubmitted ? q.solution_drive_id : undefined,
      }));

      return NextResponse.json({
        success: true,
        exam: {
          ...exam,
          questions: sanitizedQuestions,
        },
        submission,
        is_submitted: isSubmitted,
      });
    }

    // 전체 배정 시험지 목록 요약 반환
    const examList = assignedExams.map((e) => {
      const sub = submissionsMap.get(e.id);
      return {
        id: e.id,
        title: e.title,
        grade: e.grade,
        duration_min: e.duration_min,
        question_count: e.questions.length,
        created_at: e.created_at,
        is_submitted: !!sub,
        submission: sub
          ? {
              submitted_at: sub.submitted_at,
              score: sub.score,
              correct_count: sub.correct_count,
              total_questions: sub.total_questions,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, exams: examList });
  } catch (error: any) {
    console.error("Student exams GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 학생 답안 제출 및 자동 채점
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, examId, answers } = body; // answers: { [qId]: user_answer }

    if (!studentId || !examId) {
      return NextResponse.json(
        { success: false, error: "studentId와 examId가 필요합니다." },
        { status: 400 }
      );
    }

    const allExams = await getExamPapers();
    const exam = allExams.find((e) => e.id === examId);

    if (!exam) {
      return NextResponse.json({ success: false, error: "시험지를 찾을 수 없습니다." }, { status: 404 });
    }

    // 채점 진행
    let correctCount = 0;
    const gradedAnswers: StudentSubmission["answers"] = {};

    exam.questions.forEach((q) => {
      const userAns = String(answers?.[q.id] ?? "").trim();
      const isCorrect = checkAnswerMatch(userAns, q.answer, q.raw_answer);

      if (isCorrect) correctCount++;

      gradedAnswers[q.id] = {
        user_answer: userAns,
        is_correct: isCorrect,
        correct_answer: q.answer,
        raw_answer: q.raw_answer,
        solution_drive_id: q.solution_drive_id,
      };
    });

    const totalQuestions = exam.questions.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const newSubmission: StudentSubmission = {
      id: `${studentId}_${examId}`,
      student_id: studentId,
      exam_id: examId,
      exam_title: exam.title,
      submitted_at: new Date().toISOString(),
      score,
      total_questions: totalQuestions,
      correct_count: correctCount,
      answers: gradedAnswers,
    };

    const allSubmissions = await getSubmissions();
    const existingIdx = allSubmissions.findIndex((s) => s.student_id === studentId && s.exam_id === examId);

    if (existingIdx !== -1) {
      allSubmissions[existingIdx] = newSubmission;
    } else {
      allSubmissions.push(newSubmission);
    }

    await saveSubmissions(allSubmissions);

    return NextResponse.json({
      success: true,
      submission: newSubmission,
      message: "시험 답안이 제출 및 채점되었습니다.",
    });
  } catch (error: any) {
    console.error("Student exam submission error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
