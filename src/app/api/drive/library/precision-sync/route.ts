import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/authUtils";
import { detectSubQuestions, detectQuestionType, normalizeOverlines } from "@/lib/extractQuestionUtils";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXAM_PAPERS_RECORD_ID = "test2_exam_papers_data";
const SUBMISSIONS_RECORD_ID = "test2_student_submissions_data";
const TEST_BANK_ITEMS_RECORD_ID = "test_bank_items_data";

// 🔐 관리자 인증 헬퍼
async function checkAdminAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session_token")?.value;
  return verifyAdminToken(token);
}

// 🌐 Google Drive 클라이언트
let driveClientInstance: any = null;
function getDriveClient() {
  if (driveClientInstance) return driveClientInstance;
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) return null;
  try {
    const credentials = JSON.parse(keyString);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    driveClientInstance = google.drive({ version: "v3", auth });
    return driveClientInstance;
  } catch (e) {
    console.error("Google Auth initialization error:", e);
    return null;
  }
}

// 원형 숫자 정규화
function normalizeCircledNumber(str: string): string {
  const circledMap: Record<string, string> = {
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
    "❶": "1", "❷": "2", "❸": "3", "❹": "4", "❺": "5",
  };
  return str.replace(/[①②③④⑤❶❷❸❹❺]/g, (match) => circledMap[match] || match);
}

// HTML 엔티티 디코딩
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// HTML 텍스트 정제
function cleanHtmlContent(rawHtml: string): string {
  if (!rawHtml) return "";
  let processed = normalizeOverlines(rawHtml);
  processed = processed
    .replace(/<mo[^>]*>([≡=≠≤≥≈~+×÷])<\/mo>/gi, " $1 ")
    .replace(/<mo[^>]*>([,])<\/mo>/gi, "$1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  processed = decodeHtmlEntities(processed);
  processed = normalizeOverlines(processed);
  const lines = processed
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
  return lines.join("\n");
}

// HTML에서 정답 및 메타데이터 추출
function parseQuestionFromHtml(html: string, fallbackFile: { drive_id: string; name: string; question_image_drive_id?: string | null }) {
  let imageUrl = "";

  const mDataSrc = html.match(/id=["']report-export-problem-src["'][^>]*data-src=["']([^"']+)["']/i)
                || html.match(/data-src=["']([^"']+)["'][^>]*id=["']report-export-problem-src["']/i);
  if (mDataSrc && mDataSrc[1].trim()) {
    imageUrl = mDataSrc[1].trim();
  }

  if (!imageUrl) {
    const mImg = html.match(/class=["'][^"']*report-original-problem-img[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (mImg && mImg[1].trim()) {
      imageUrl = mImg[1].trim();
    }
  }

  if (!imageUrl && fallbackFile.question_image_drive_id) {
    imageUrl = `https://lh3.googleusercontent.com/d/${fallbackFile.question_image_drive_id}`;
  }

  if (!imageUrl) {
    const driveMatch = html.match(/https?:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (driveMatch) {
      imageUrl = driveMatch[0];
    }
  }

  let extractedRaw = "";
  const mAnsSpan = html.match(/<span[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const mAnsDiv = html.match(/<div[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const mAnsBox = html.match(/<div[^>]*class=["'][^"']*final-answer-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (mAnsSpan) {
    extractedRaw = mAnsSpan[1];
  } else if (mAnsDiv) {
    extractedRaw = mAnsDiv[1];
  } else if (mAnsBox) {
    extractedRaw = mAnsBox[1].replace(/<[^>]*class=["'][^"']*final-answer-label[^"']*["'][^>]*>[\s\S]*?<\/[a-z0-9]+>/i, "");
  } else {
    const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
    if (mAns2) extractedRaw = mAns2[1];
  }

  const rawAnswer = cleanHtmlContent(extractedRaw);
  let cleanAnswer = "";
  if (rawAnswer) {
    const normalized = normalizeCircledNumber(rawAnswer);
    const numMatch = normalized.match(/^([1-5])\b/);
    if (numMatch) {
      cleanAnswer = numMatch[1];
    } else {
      cleanAnswer = normalized.trim();
    }
  }

  const finalAns = cleanAnswer || rawAnswer || "";
  const subQuestions = detectSubQuestions(rawAnswer);
  const questionType = detectQuestionType(cleanAnswer, rawAnswer, subQuestions);
  const isDescriptive = questionType === "DESCRIPTIVE";

  return {
    imageUrl,
    rawAnswer: rawAnswer || "정답 정보 없음",
    answer: finalAns,
    is_descriptive: isDescriptive,
    question_type: questionType,
    sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
  };
}

// 헬퍼: DB 시험지 목록 가져오기 / 저장
async function getExamPapers(): Promise<any[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", EXAM_PAPERS_RECORD_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.exams) ? parsed.exams : [];
  } catch {
    return [];
  }
}

async function saveExamPapers(exams: any[]) {
  const jsonString = JSON.stringify({ exams, updated_at: new Date().toISOString() });
  await supabase.from("exam_library").upsert(
    {
      drive_id: EXAM_PAPERS_RECORD_ID,
      name: "test2_exam_papers.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );
}

// 헬퍼: DB 원천DB 목록 가져오기 / 저장
async function getTestBankItems(): Promise<any[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", TEST_BANK_ITEMS_RECORD_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function saveTestBankItems(items: any[]) {
  const jsonString = JSON.stringify({ items, updated_at: new Date().toISOString() });
  await supabase.from("exam_library").upsert(
    {
      drive_id: TEST_BANK_ITEMS_RECORD_ID,
      name: "test_bank_items.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );
}

// 헬퍼: 학생 제출 기록 가져오기 / 저장
async function getSubmissions(): Promise<any[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", SUBMISSIONS_RECORD_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.submissions) ? parsed.submissions : [];
  } catch {
    return [];
  }
}

async function saveSubmissions(submissions: any[]) {
  const jsonString = JSON.stringify({ submissions, updated_at: new Date().toISOString() });
  await supabase.from("exam_library").upsert(
    {
      drive_id: SUBMISSIONS_RECORD_ID,
      name: "test2_student_submissions.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );
}

// 학생 이름 맵 생성
async function getStudentMap(): Promise<Record<string, string>> {
  const { data } = await supabase.from("students").select("id, name");
  const map: Record<string, string> = {};
  if (Array.isArray(data)) {
    data.forEach((s) => {
      map[s.id] = s.name;
    });
  }
  return map;
}

// 채점 판정 헬퍼
function evaluateAnswer(userAnswer: any, correctAnswer: string, subQuestions?: Array<{ label: string; answer?: string }>, userSubAnswers?: Record<string, string>): boolean | null {
  if (userAnswer === undefined || userAnswer === null || userAnswer === "") return null;
  const userStr = String(userAnswer).trim();
  if (userStr === "?" || userStr === "모름") return false;

  // 소문항이 있는 경우
  if (Array.isArray(subQuestions) && subQuestions.length > 0 && userSubAnswers && typeof userSubAnswers === "object") {
    let allCorrect = true;
    for (const sq of subQuestions) {
      if (!sq.answer) continue;
      const expected = normalizeCircledNumber(sq.answer).trim().toLowerCase();
      const actual = normalizeCircledNumber(userSubAnswers[sq.label] || "").trim().toLowerCase();
      if (expected !== actual) {
        allCorrect = false;
        break;
      }
    }
    return allCorrect;
  }

  // 단일 문항 비교
  const normUser = normalizeCircledNumber(userStr).trim().toLowerCase();
  const normCorrect = normalizeCircledNumber(correctAnswer).trim().toLowerCase();
  return normUser === normCorrect;
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session || !session.adminName) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({ success: false, error: "Google Drive 인증 설정(Service Account)이 올바르지 않습니다." }, { status: 500 });
    }

    // ==========================================
    // ACTION 1: INSPECT (변경사항 검토 & Diff 분석)
    // ==========================================
    if (action === "inspect") {
      const { targetDriveId, fileName, parentId, grade } = body;
      if (!targetDriveId || !fileName || !parentId) {
        return NextResponse.json({ success: false, error: "필수 파라미터(targetDriveId, fileName, parentId)가 누락되었습니다." }, { status: 400 });
      }

      // 1. 현재 DB 레코드 조회
      const { data: currentRecord } = await supabase
        .from("exam_library")
        .select("drive_id, name, parent_id, grade, question_image_drive_id")
        .eq("drive_id", targetDriveId)
        .maybeSingle();

      // 2. Google Drive 부모 폴더 내 최신 동명 파일 검색
      const escapedFileName = fileName.replace(/'/g, "\\'");
      const fileQuery = `'${parentId}' in parents and trashed = false and name = '${escapedFileName}'`;
      const driveFileRes = await drive.files.list({
        q: fileQuery,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
        pageSize: 5,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const foundFiles = driveFileRes.data.files || [];
      if (foundFiles.length === 0) {
        return NextResponse.json({
          success: false,
          error: `구글 드라이브 해당 폴더에서 '${fileName}' 파일을 찾을 수 없습니다. (파일을 업로드했는지 확인해주세요.)`,
        }, { status: 404 });
      }

      const latestFile = foundFiles[0];

      // 3. 짝꿍 이미지(.png) 검색
      const stem = fileName.replace(/\.[^/.]+$/, "");
      const escapedStem = stem.replace(/'/g, "\\'");
      const pngQuery = `'${parentId}' in parents and trashed = false and (name = '${escapedStem}.png' or name = '${escapedStem}.PNG')`;
      const pngRes = await drive.files.list({
        q: pngQuery,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const latestPng = pngRes.data.files?.[0];
      const newQuestionImageDriveId = latestPng ? latestPng.id : null;

      // 4. 새 파일 HTML 읽기
      const fileContentRes = await drive.files.get(
        { fileId: latestFile.id, alt: "media", supportsAllDrives: true },
        { responseType: "text" }
      );
      const rawHtml = typeof fileContentRes.data === "string" ? fileContentRes.data : "";
      const parsedQuestion = parseQuestionFromHtml(rawHtml, {
        drive_id: latestFile.id,
        name: fileName,
        question_image_drive_id: newQuestionImageDriveId,
      });

      // 5. 기존 시험지 목록에서 영향받는 시험지 탐색
      const allExams = await getExamPapers();
      const affectedExams: Array<{ id: string; title: string; grade: string; question_index: number; current_answer: string; points: number }> = [];

      allExams.forEach((exam) => {
        if (!Array.isArray(exam.questions)) return;
        exam.questions.forEach((q: any, idx: number) => {
          if (q.drive_id === targetDriveId || (q.name === fileName && q.folder_name && q.drive_id === currentRecord?.drive_id)) {
            affectedExams.push({
              id: exam.id,
              title: exam.title,
              grade: exam.grade || "공통",
              question_index: idx + 1,
              current_answer: q.answer || "",
              points: q.points || 0,
            });
          }
        });
      });

      // 기존 정답
      const existingAnswer = affectedExams.length > 0 ? affectedExams[0].current_answer : (currentRecord ? "등록됨" : "없음");

      // 6. 영향받는 시험지를 제출한 학생 수 집계
      const allSubmissions = await getSubmissions();
      const affectedExamIdSet = new Set(affectedExams.map((e) => e.id));
      const affectedSubmissions = allSubmissions.filter((s) => affectedExamIdSet.has(s.exam_id));

      return NextResponse.json({
        success: true,
        currentRecord: {
          drive_id: targetDriveId,
          name: fileName,
          parent_id: parentId,
          grade: grade || currentRecord?.grade || "공통",
          question_image_drive_id: currentRecord?.question_image_drive_id || null,
          existing_answer: existingAnswer,
        },
        newDriveFile: {
          drive_id: latestFile.id,
          name: latestFile.name,
          modified_time: latestFile.modifiedTime,
          is_same_id: targetDriveId === latestFile.id,
          new_question_image_drive_id: newQuestionImageDriveId,
          new_answer: parsedQuestion.answer,
          new_raw_answer: parsedQuestion.rawAnswer,
          new_sub_questions: parsedQuestion.sub_questions,
          new_question_type: parsedQuestion.question_type,
          new_image_url: parsedQuestion.imageUrl,
        },
        diff: {
          is_id_changed: targetDriveId !== latestFile.id,
          is_image_changed: (currentRecord?.question_image_drive_id || null) !== newQuestionImageDriveId,
          is_answer_changed: existingAnswer !== parsedQuestion.answer,
          old_answer: existingAnswer,
          new_answer: parsedQuestion.answer,
          new_raw_answer: parsedQuestion.rawAnswer,
        },
        affectedExams,
        totalSubmissionsCount: affectedSubmissions.length,
      });
    }

    // ==========================================
    // ACTION 2: APPLY (최종 승인 및 도미노 동기화 적용)
    // ==========================================
    if (action === "apply") {
      const {
        targetDriveId,
        newDriveId,
        newQuestionImageDriveId,
        fileName,
        parentId,
        grade,
        autoRegrade,
      } = body;

      if (!targetDriveId || !newDriveId || !fileName || !parentId) {
        return NextResponse.json({ success: false, error: "필수 파라미터가 누락되었습니다." }, { status: 400 });
      }

      // 1. 새 파일 HTML 읽어서 최신 문항 정보 확정
      const fileContentRes = await drive.files.get(
        { fileId: newDriveId, alt: "media", supportsAllDrives: true },
        { responseType: "text" }
      );
      const rawHtml = typeof fileContentRes.data === "string" ? fileContentRes.data : "";
      const parsedQuestion = parseQuestionFromHtml(rawHtml, {
        drive_id: newDriveId,
        name: fileName,
        question_image_drive_id: newQuestionImageDriveId,
      });

      // 2. 라이브러리(exam_library) 테이블 갱신
      await supabase.from("exam_library").upsert(
        {
          drive_id: newDriveId,
          parent_id: parentId,
          name: fileName,
          type: "file",
          grade: grade || "공통",
          question_image_drive_id: newQuestionImageDriveId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "drive_id" }
      );

      // ID가 바뀌었다면 기존 레코드 삭제
      if (targetDriveId !== newDriveId) {
        await supabase.from("exam_library").delete().eq("drive_id", targetDriveId);
      }

      // 3. 원천DB(test_bank_items_data) 갱신
      const bankItems = await getTestBankItems();
      let updatedBankCount = 0;
      const updatedBankItems = bankItems.map((item) => {
        if (item.drive_id === targetDriveId || item.drive_id === newDriveId) {
          updatedBankCount++;
          return {
            ...item,
            drive_id: newDriveId,
            question_image_drive_id: newQuestionImageDriveId || null,
          };
        }
        return item;
      });
      if (updatedBankCount > 0) {
        await saveTestBankItems(updatedBankItems);
      }

      // 4. 시험지(test2_exam_papers_data) 문항 스냅샷 갱신
      const allExams = await getExamPapers();
      let updatedExamsCount = 0;
      const affectedExamIds: string[] = [];
      const updatedQuestionMap: Record<string, { newAnswer: string; newRawAnswer: string; subQuestions?: any[]; points: number }> = {};

      const updatedExams = allExams.map((exam) => {
        if (!Array.isArray(exam.questions)) return exam;
        let isExamModified = false;

        const nextQuestions = exam.questions.map((q: any) => {
          if (q.drive_id === targetDriveId || q.drive_id === newDriveId) {
            isExamModified = true;
            updatedQuestionMap[q.id] = {
              newAnswer: parsedQuestion.answer,
              newRawAnswer: parsedQuestion.rawAnswer,
              subQuestions: parsedQuestion.sub_questions,
              points: q.points || 0,
            };

            return {
              ...q,
              drive_id: newDriveId,
              answer: parsedQuestion.answer,
              raw_answer: parsedQuestion.rawAnswer,
              sub_questions: parsedQuestion.sub_questions,
              question_type: parsedQuestion.question_type,
              is_descriptive: parsedQuestion.is_descriptive,
              image_url: parsedQuestion.imageUrl || q.image_url,
              solution_drive_id: newDriveId,
            };
          }
          return q;
        });

        if (isExamModified) {
          updatedExamsCount++;
          affectedExamIds.push(exam.id);
          return {
            ...exam,
            questions: nextQuestions,
            updated_at: new Date().toISOString(),
          };
        }
        return exam;
      });

      if (updatedExamsCount > 0) {
        await saveExamPapers(updatedExams);
      }

      // 5. 학생 제출 답안 자동 재채점 (autoRegrade = true 인 경우)
      const scoreChanges: Array<{
        student_id: string;
        student_name: string;
        exam_id: string;
        exam_title: string;
        old_score: number;
        new_score: number;
        diff: number;
        old_is_correct: boolean | null;
        new_is_correct: boolean | null;
      }> = [];

      let regradedSubmissionsCount = 0;

      if (autoRegrade && affectedExamIds.length > 0) {
        const studentMap = await getStudentMap();
        const allSubmissions = await getSubmissions();
        const affectedExamIdSet = new Set(affectedExamIds);

        // 업데이트된 시험지 객체 맵
        const examObjMap: Record<string, any> = {};
        updatedExams.forEach((e) => {
          examObjMap[e.id] = e;
        });

        const updatedSubmissions = allSubmissions.map((sub) => {
          if (!affectedExamIdSet.has(sub.exam_id) || !sub.answers) return sub;

          const exam = examObjMap[sub.exam_id];
          if (!exam || !Array.isArray(exam.questions)) return sub;

          let isSubModified = false;
          let oldScore = Number(sub.score) || 0;
          let oldCorrectCount = Number(sub.correct_count) || 0;

          // 문항별 채점 재실행
          exam.questions.forEach((q: any) => {
            const updateInfo = updatedQuestionMap[q.id];
            if (!updateInfo) return;

            const existingAnsObj = sub.answers[q.id];
            if (!existingAnsObj) return;

            const oldIsCorrect = existingAnsObj.is_correct;
            const newIsCorrect = evaluateAnswer(
              existingAnsObj.user_answer,
              updateInfo.newAnswer,
              updateInfo.subQuestions,
              existingAnsObj.sub_answers
            );

            existingAnsObj.is_correct = newIsCorrect;
            existingAnsObj.correct_answer = updateInfo.newAnswer;
            existingAnsObj.raw_answer = updateInfo.newRawAnswer;
            existingAnsObj.solution_drive_id = newDriveId;
            if (updateInfo.subQuestions) {
              existingAnsObj.sub_questions = updateInfo.subQuestions;
            }

            isSubModified = true;
          });

          if (isSubModified) {
            // 시험지 총점 및 맞힌 개수 재계산
            let newEarnedPoints10 = 0;
            let totalExamPoints10 = 0;
            let newCorrectCount = 0;

            exam.questions.forEach((q: any) => {
              const qPoint10 = Math.round((Number(q.points) || 0) * 10);
              totalExamPoints10 += qPoint10;
              const ansObj = sub.answers[q.id];
              if (ansObj && ansObj.is_correct === true) {
                newEarnedPoints10 += qPoint10;
                newCorrectCount++;
              }
            });

            const newScore = totalExamPoints10 > 0
              ? Math.min(100, Math.round(newEarnedPoints10 / 10))
              : Math.round((newCorrectCount / exam.questions.length) * 100);

            regradedSubmissionsCount++;

            // 점수 변동 또는 판정 변동이 있는 경우 리포트에 추가
            const diff = newScore - oldScore;
            scoreChanges.push({
              student_id: sub.student_id,
              student_name: studentMap[sub.student_id] || sub.student_id,
              exam_id: sub.exam_id,
              exam_title: sub.exam_title || exam.title,
              old_score: oldScore,
              new_score: newScore,
              diff,
              old_is_correct: sub.answers[Object.keys(updatedQuestionMap)[0]]?.is_correct,
              new_is_correct: true,
            });

            return {
              ...sub,
              score: newScore,
              correct_count: newCorrectCount,
            };
          }

          return sub;
        });

        if (regradedSubmissionsCount > 0) {
          await saveSubmissions(updatedSubmissions);
        }
      }

      return NextResponse.json({
        success: true,
        message: "세밀수정 및 도미노 동기화가 성공적으로 완료되었습니다.",
        updatedBankCount,
        updatedExamsCount,
        regradedSubmissionsCount,
        scoreChanges: scoreChanges.filter((s) => s.diff !== 0), // 실제로 점수가 변동된 학생들 우선
        allRegradedStudents: scoreChanges,
      });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 action입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Precision Sync error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
