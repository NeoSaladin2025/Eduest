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
  has_pending_review?: boolean;
  pending_count?: number;
  answers: {
    [questionId: string]: {
      user_answer: string;
      is_correct: boolean | null;
      correct_answer: string;
      raw_answer: string;
      solution_drive_id: string;
      time_spent_sec?: number;
      proof_image_drive_id?: string;
      proof_image_url?: string;
      is_descriptive?: boolean;
      question_type?: 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE';
      sub_questions?: Array<{ label: string; answer?: string }>;
      sub_answers?: Record<string, string>;
      sub_results?: Record<string, boolean>;
      is_direct_paper?: boolean;
      is_photo_submission?: boolean;
      grading_status?: 'graded' | 'pending' | 'reviewed';
      show_solution?: boolean;
      reviewed_at?: string;
    };
  };
  proof_images?: Array<{
    question_id?: string;
    question_number?: number;
    drive_id: string;
    url?: string;
    file_name?: string;
  }>;
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

// 원형 숫자 및 선분/변 기호 등 정규화
function cleanAnswerString(str: string): string {
  if (!str) return "";
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str
    .replace(/[①②③④⑤❶❷❸❹❺]/g, (m) => circledMap[m] || m)
    .replace(/\u0305/g, "") // 🌟 결합 윗줄(선분 기호) 제거하여 동일 취급
    .replace(/[―—‾¯]/g, "") // 🌟 대시/오버라인 기호 제거
    .replace(/([a-zA-Z])-(?=[^0-9]|$)/g, "$1") // 🌟 알파벳 뒤 하이픈 제거
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 스마트 단위 및 부가 기호 제거 (주관식/소문항 채점 보정)
function stripUnitsAndExtras(str: string): string {
  if (!str) return "";
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };

  let s = str
    .replace(/[①②③④⑤❶❷❸❹❺]/g, (m) => circledMap[m] || m)
    .replace(/\u0305/g, "") // 🌟 결합 윗줄(선분 기호) 제거
    .replace(/[―—‾¯]/g, "") // 🌟 대시/오버라인 기호 제거
    .replace(/([a-zA-Z])-(?=[^0-9]|$)/g, "$1") // 🌟 알파벳 뒤 하이픈 제거
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/,/g, "") // 천 단위 콤마 제거
    // 🌟 대응변, 대응각, 대응점 접두사 제거
    .replace(/^(?:대응변|대응각|대응점)\s*[:：]?\s*/i, "")
    // 🌟 선분, 변 키워드 제거 (예: 선분AB -> ab, 변AB -> ab)
    .replace(/(?:선분|변)\s*/g, "")
    // 미지수 접두사 제거 (예: x=12, y=-3, a=5)
    .replace(/^[a-z]\s*=\s*/i, "")
    // 소문항 라벨 접두사 제거 (예: (1)4 -> 4)
    .replace(/^(?:\([1-9]\)|[1-9]\)|\[[1-9]\]|[①-⑤])\s*/, "")
    // 괄호로 둘러싸인 단위 제거 (예: 12(cm) -> 12)
    .replace(/\((?:cm[23]?|mm[23]?|m[23]?|km[23]?|kg|mg|g|ml|l|°|도|개|명|원|초|분)\)$/i, "");

  // 단위 접미사 제거 (한국어 및 영문 물리/수학 단위)
  const unitSuffixRegex = /(?:cm[23]?|mm[23]?|km[23]?|m[23]?|kg|mg|g|ml|l|°|도|개|명|원|자루|권|마리|대|점|번|초|분|시간|s|sec|min|hr|h|%|퍼센트|배)$/i;
  s = s.replace(unitSuffixRegex, "");

  return s.trim();
}

// 정답 비교 판정 (단위 무관 및 주관식 스마트 매칭 지원)
function checkAnswerMatch(
  userAns: string,
  correctAns: string,
  rawAns: string,
  isMultipleChoice: boolean = false
): boolean {
  const cUser = cleanAnswerString(userAns);
  const cCorrect = cleanAnswerString(correctAns);
  const cRaw = cleanAnswerString(rawAns);

  if (!cUser || cUser === "모름" || cUser === "unknown") return false;

  // 1. 공백 제거 후 완전 일치
  if (cUser === cCorrect || cUser === cRaw) return true;

  // 2. 스마트 단위 제거 후 핵심 값 비교 (단답형 & 소문항 핵심)
  const strippedUser = stripUnitsAndExtras(userAns);
  const strippedCorrect = stripUnitsAndExtras(correctAns);
  const strippedRaw = stripUnitsAndExtras(rawAns);

  if (strippedUser && (strippedUser === strippedCorrect || (strippedRaw && strippedUser === strippedRaw))) {
    return true;
  }

  // 3. 객관식(1~5) 전용 매칭
  // 주관식 단답형(예: 12cm)에서 1이 매칭되는 오판정을 막기 위해 isMultipleChoice일 때만 허용
  if (isMultipleChoice) {
    const correctNumMatch = cCorrect.match(/^([1-5])/);
    if (correctNumMatch && correctNumMatch[1] === cUser) return true;

    const rawNumMatch = cRaw.match(/^([1-5])/);
    if (rawNumMatch && rawNumMatch[1] === cUser) return true;
  }

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
      const sanitizedQuestions = exam.questions.map((q) => {
        const studentAns = submission?.answers?.[q.id];
        // 서술형이고 채점 대기 중인데 show_solution이 허용되지 않은 경우 정답/해설 숨김
        const isDescriptivePending = q.is_descriptive && studentAns?.grading_status === 'pending';
        const canShowSolution = isSubmitted && (!isDescriptivePending || studentAns?.show_solution === true);
        const qType = q.question_type || (q.is_descriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(String(q.answer).trim()) ? 'MULTIPLE' : 'SHORT'));

        return {
          id: q.id,
          drive_id: q.drive_id,
          name: q.name,
          image_url: q.image_url,
          points: q.points,
          is_descriptive: qType === 'DESCRIPTIVE' || !!q.is_descriptive,
          question_type: qType,
          sub_questions: q.sub_questions ? q.sub_questions.map((sq) => ({
            label: sq.label,
            answer: canShowSolution ? sq.answer : undefined,
          })) : undefined,
          answer: canShowSolution ? q.answer : undefined,
          raw_answer: canShowSolution ? q.raw_answer : undefined,
          solution_drive_id: canShowSolution ? q.solution_drive_id : undefined,
        };
      });

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
        is_wrong_review: e.is_wrong_review,
        is_special: e.is_special,
        require_proof_image: e.require_proof_image,
        enable_lockdown: e.enable_lockdown,
        student_overrides: e.student_overrides,
        is_submitted: !!sub,
        submission: sub
          ? {
              submitted_at: sub.submitted_at,
              score: sub.score,
              correct_count: sub.correct_count,
              total_questions: sub.total_questions,
              has_pending_review: !!sub.has_pending_review,
              pending_count: sub.pending_count || 0,
              proof_images: sub.proof_images,
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
    const { studentId, examId, answers, questionTimes, proofImages } = body; // answers: { [qId]: user_answer }, questionTimes: { [qId]: seconds }, proofImages: { [qId]: { drive_id, url } }

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
    let pendingCount = 0;
    const gradedAnswers: StudentSubmission["answers"] = {};
    const collectedProofImages: StudentSubmission["proof_images"] = [];

    exam.questions.forEach((q, idx) => {
      const rawUserAns = answers?.[q.id];
      let userAns = typeof rawUserAns === 'string' ? rawUserAns.trim() : (rawUserAns ? JSON.stringify(rawUserAns) : "");
      const isDirectPaper = userAns === '__DIRECT_PAPER__' || (typeof rawUserAns === 'object' && rawUserAns?.is_direct_paper);
      const isDescriptive = q.question_type === 'DESCRIPTIVE' || !!q.is_descriptive;
      const subQuestions = q.sub_questions;

      let isCorrect: boolean | null = false;
      let gradingStatus: 'graded' | 'pending' | 'reviewed' = 'graded';
      let subAnswers: Record<string, string> | undefined = undefined;
      let subResults: Record<string, boolean> | undefined = undefined;

      if (isDescriptive) {
        // 서술형: 즉시 오답으로 확정하지 않고 선생님 채점 대기(pending)로 설정
        isCorrect = null;
        gradingStatus = 'pending';
        pendingCount++;
        if (isDirectPaper) {
          userAns = '종이 직접 제출';
        }
      } else if (subQuestions && subQuestions.length >= 2) {
        // 소문항이 2개 이상 있는 경우
        let parsedSub: Record<string, string> = {};
        if (typeof rawUserAns === 'object' && rawUserAns !== null) {
          parsedSub = rawUserAns;
        } else {
          try {
            parsedSub = JSON.parse(rawUserAns);
          } catch {
            parsedSub = {};
          }
        }
        subAnswers = parsedSub;
        subResults = {};

        let allMatched = true;
        subQuestions.forEach((sq) => {
          const studentSubVal = parsedSub[sq.label] || '';
          // 소문항은 단답형이므로 isMultipleChoice = false
          const matched = checkAnswerMatch(studentSubVal, sq.answer, sq.answer, false);
          subResults![sq.label] = matched;
          if (!matched) {
            allMatched = false;
          }
        });

        // 사용자 규칙: 부분점수 없음. 모든 소문항 일치 시에만 정답 인정
        isCorrect = allMatched;
        gradingStatus = 'graded';
        if (allMatched) correctCount++;
      } else {
        // 일반 단답/객관식
        const isMultiple = q.question_type === 'MULTIPLE' || (/^[1-5]$/.test(cleanAnswerString(q.answer)) && (!subQuestions || subQuestions.length === 0));
        const matched = checkAnswerMatch(userAns, q.answer, q.raw_answer, isMultiple);
        isCorrect = matched;
        gradingStatus = 'graded';
        if (matched) correctCount++;
      }

      const pImg = proofImages?.[q.id];
      if (pImg) {
        collectedProofImages.push({
          question_id: q.id,
          question_number: idx + 1,
          drive_id: pImg.drive_id || pImg.fileId,
          url: pImg.remote_url || pImg.url,
          file_name: pImg.file_name || pImg.fileName,
        });
      }

      gradedAnswers[q.id] = {
        user_answer: userAns,
        is_correct: isCorrect,
        correct_answer: q.answer,
        raw_answer: q.raw_answer,
        solution_drive_id: q.solution_drive_id,
        time_spent_sec: questionTimes?.[q.id] ? Number(questionTimes[q.id]) : 0,
        proof_image_drive_id: pImg?.drive_id || pImg?.fileId,
        proof_image_url: pImg?.remote_url || pImg?.url,
        is_descriptive: isDescriptive,
        question_type: q.question_type || (isDescriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(q.answer) ? 'MULTIPLE' : 'SHORT')),
        sub_questions: subQuestions,
        sub_answers: subAnswers,
        sub_results: subResults,
        is_direct_paper: isDirectPaper,
        is_photo_submission: userAns === '__PHOTO_SUBMISSION__',
        grading_status: gradingStatus,
        show_solution: !isDescriptive, // 일반 문제는 기본 공개, 서술형은 선생님 승인 시 공개
      };
    });

    const totalQuestions = exam.questions.length;
    // 🌟 문항별 배점(points) 기반 실시간 총점 및 획득 점수 계산
    let earnedPoints10 = 0;
    let totalExamPoints10 = 0;
    exam.questions.forEach((q) => {
      const qPoint = typeof q.points === 'number' && q.points > 0
        ? q.points
        : (totalQuestions > 0 ? 100 / totalQuestions : 0);
      const qPoint10 = Math.round(qPoint * 10);
      totalExamPoints10 += qPoint10;
      const gAns = gradedAnswers[q.id];
      if (gAns && gAns.is_correct === true) {
        earnedPoints10 += qPoint10;
      }
    });

    const calculatedScore = totalExamPoints10 > 0
      ? Math.round((earnedPoints10 / totalExamPoints10) * 1000) / 10
      : (totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0);
    const score = Number.isInteger(calculatedScore) ? calculatedScore : Number(calculatedScore.toFixed(1));

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
      has_pending_review: pendingCount > 0,
      pending_count: pendingCount,
      proof_images: collectedProofImages,
    };

    const allSubmissions = await getSubmissions();
    const existingIdx = allSubmissions.findIndex((s) => s.student_id === studentId && s.exam_id === examId);

    if (existingIdx !== -1) {
      allSubmissions[existingIdx] = newSubmission;
    } else {
      allSubmissions.push(newSubmission);
    }

    await saveSubmissions(allSubmissions);

    // 학생 상태 DB 동기화: 시험 완료 상태로 변경
    try {
      await supabase
        .from("students")
        .update({
          test_status: "FINISHED",
          test_remaining_sec: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", studentId);
    } catch (e) {
      console.warn("Failed to update student test_status in DB:", e);
    }

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

// PATCH: 선생님의 문항별 채점 결과 수동 수정 (맞음/틀림 토글 및 점수 실시간 재계산)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, examId, questionId, isCorrect } = body;

    if (!studentId || !examId || !questionId || typeof isCorrect !== "boolean") {
      return NextResponse.json(
        { success: false, error: "studentId, examId, questionId, isCorrect(boolean)가 필요합니다." },
        { status: 400 }
      );
    }

    const allSubmissions = await getSubmissions();
    const subIdx = allSubmissions.findIndex(
      (s) => s.student_id === studentId && s.exam_id === examId
    );

    if (subIdx === -1) {
      return NextResponse.json(
        { success: false, error: "해당 학생의 시험 제출 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const submission = allSubmissions[subIdx];
    if (!submission.answers || !submission.answers[questionId]) {
      return NextResponse.json(
        { success: false, error: "해당 문항의 답안 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 1. 해당 문항 채점 상태 수동 변경
    submission.answers[questionId] = {
      ...submission.answers[questionId],
      is_correct: isCorrect,
      grading_status: "reviewed",
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
    const newScore = totalQuestions > 0 ? Math.round((newCorrectCount / totalQuestions) * 100) : 0;

    submission.correct_count = newCorrectCount;
    submission.score = newScore;
    submission.has_pending_review = remainingPending > 0;
    submission.pending_count = remainingPending;

    allSubmissions[subIdx] = submission;
    await saveSubmissions(allSubmissions);

    return NextResponse.json({
      success: true,
      submission,
      message: isCorrect ? "해당 문항이 [정답 인정]으로 수정되었습니다." : "해당 문항이 [오답 처리]로 수정되었습니다.",
    });
  } catch (error: any) {
    console.error("Student exam grade override error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
