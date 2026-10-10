import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = "test2_exam_papers_data";
const SUBMISSIONS_RECORD_DRIVE_ID = "test2_student_submissions_data";

export interface ExamSubQuestion {
  label: string;
  answer: string;
}

export interface ExamQuestion {
  id: string;
  drive_id: string;
  name: string;
  image_url: string;
  answer: string;
  raw_answer: string;
  solution_drive_id: string;
  points?: number;
  folder_name?: string | null;
  question_number?: number | null;
  display_name?: string | null;
  is_descriptive?: boolean;
  question_type?: 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE';
  sub_questions?: ExamSubQuestion[];
}

export interface StudentOverrideConfig {
  enable_lockdown?: boolean;
  require_proof_image?: boolean;
}

export interface ExamPaper {
  id: string;
  title: string;
  grade: string;
  duration_min: number;
  questions: ExamQuestion[];
  assigned_student_ids: string[];
  is_wrong_review?: boolean;
  is_special?: boolean;
  require_proof_image?: boolean;
  enable_lockdown?: boolean;
  student_overrides?: Record<string, StudentOverrideConfig>;
  parent_exam_id?: string;
  created_at: string;
  updated_at: string;
}

// 헬퍼: DB에서 전체 시험지 목록 가져오기
async function getExamPapers(): Promise<ExamPaper[]> {
  const { data, error } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", RECORD_DRIVE_ID)
    .maybeSingle();

  if (error || !data || !data.file_data) {
    return [];
  }

  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.exams) ? parsed.exams : [];
  } catch (e) {
    console.error("Failed to parse exam papers:", e);
    return [];
  }
}

// 헬퍼: DB에 전체 시험지 목록 저장하기
async function saveExamPapers(exams: ExamPaper[]) {
  const jsonString = JSON.stringify({
    exams,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: RECORD_DRIVE_ID,
      name: "test2_exam_papers.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    throw new Error(`시험지 데이터 저장 실패: ${error.message}`);
  }
}

// 헬퍼: Google Drive 클라이언트
function getDriveClient() {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) return null;
  try {
    const credentials = JSON.parse(keyString);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch (e) {
    console.error("Google Auth initialization error:", e);
    return null;
  }
}

// 헬퍼: 제출 기록 목록 가져오기
async function getSubmissions(): Promise<any[]> {
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
async function saveSubmissions(submissions: any[]) {
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
    console.error("제출 데이터 갱신 저장 실패:", error.message);
  }
}

// GET: 시험지 목록 또는 특정 시험지 상세 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");

    const exams = await getExamPapers();

    if (examId) {
      const exam = exams.find((e) => e.id === examId);
      if (!exam) {
        return NextResponse.json({ success: false, error: "시험지를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ success: true, exam });
    }

    return NextResponse.json({ success: true, exams });
  } catch (error: any) {
    console.error("Exam GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 신규 시험지 생성
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      title, 
      grade, 
      duration_min, 
      questions, 
      assigned_student_ids, 
      is_wrong_review, 
      is_special, 
      require_proof_image, 
      enable_lockdown,
      student_overrides,
      parent_exam_id 
    } = body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { success: false, error: "시험지 제목과 1개 이상의 문제가 필요합니다." },
        { status: 400 }
      );
    }

    const newExam: ExamPaper = {
      id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      grade: grade || "공통",
      duration_min: Number(duration_min) || 50,
      questions: questions.map((q: any, idx: number) => {
        const ans = String(q.answer ?? "").trim();
        const derivedType = q.question_type || (q.is_descriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(ans) ? 'MULTIPLE' : 'SHORT'));
        return {
          id: q.id || `q_${idx + 1}_${Date.now()}`,
          drive_id: q.drive_id,
          name: q.name,
          image_url: q.image_url || "",
          answer: ans,
          raw_answer: String(q.raw_answer ?? "").trim(),
          solution_drive_id: q.solution_drive_id || q.drive_id,
          points: typeof q.points === 'number' && !isNaN(q.points) ? q.points : (questions.length > 0 ? Math.floor(1000 / questions.length) / 10 : 0),
          folder_name: q.folder_name || null,
          question_number: typeof q.question_number === 'number' ? q.question_number : null,
          display_name: q.display_name || null,
          is_descriptive: derivedType === 'DESCRIPTIVE' || !!q.is_descriptive,
          question_type: derivedType,
          sub_questions: Array.isArray(q.sub_questions) && q.sub_questions.length > 0 ? q.sub_questions : undefined,
        };
      }),
      assigned_student_ids: Array.isArray(assigned_student_ids) ? assigned_student_ids : [],
      is_wrong_review: !!is_wrong_review,
      is_special: !!is_special,
      require_proof_image: !!require_proof_image,
      enable_lockdown: !!enable_lockdown,
      student_overrides: typeof student_overrides === 'object' && student_overrides !== null ? student_overrides : {},
      parent_exam_id: parent_exam_id || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingExams = await getExamPapers();
    const updatedExams = [newExam, ...existingExams];

    await saveExamPapers(updatedExams);

    return NextResponse.json({ success: true, exam: newExam });
  } catch (error: any) {
    console.error("Exam POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: 기존 시험지 수정 (제목, 학생 배정, 문제 등)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      examId, 
      title, 
      grade, 
      duration_min, 
      questions, 
      assigned_student_ids,
      require_proof_image,
      enable_lockdown,
      student_overrides
    } = body;

    if (!examId) {
      return NextResponse.json({ success: false, error: "examId가 필요합니다." }, { status: 400 });
    }

    const existingExams = await getExamPapers();
    const idx = existingExams.findIndex((e) => e.id === examId);

    if (idx === -1) {
      return NextResponse.json({ success: false, error: "수정할 시험지를 찾을 수 없습니다." }, { status: 404 });
    }

    const current = existingExams[idx];
    const updatedExam: ExamPaper = {
      ...current,
      title: title !== undefined ? title.trim() : current.title,
      grade: grade !== undefined ? grade : current.grade,
      duration_min: duration_min !== undefined ? Number(duration_min) : current.duration_min,
      questions: questions !== undefined ? questions.map((q: any) => {
        const ans = String(q.answer ?? "").trim();
        const derivedType = q.question_type || (q.is_descriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(ans) ? 'MULTIPLE' : 'SHORT'));
        return {
          ...q,
          is_descriptive: derivedType === 'DESCRIPTIVE' || !!q.is_descriptive,
          question_type: derivedType,
          sub_questions: Array.isArray(q.sub_questions) && q.sub_questions.length > 0 ? q.sub_questions : undefined,
        };
      }) : current.questions,
      assigned_student_ids:
        assigned_student_ids !== undefined ? assigned_student_ids : current.assigned_student_ids,
      require_proof_image: require_proof_image !== undefined ? !!require_proof_image : current.require_proof_image,
      enable_lockdown: enable_lockdown !== undefined ? !!enable_lockdown : current.enable_lockdown,
      student_overrides: student_overrides !== undefined ? student_overrides : current.student_overrides,
      updated_at: new Date().toISOString(),
    };

    existingExams[idx] = updatedExam;
    await saveExamPapers(existingExams);

    return NextResponse.json({ success: true, exam: updatedExam });
  } catch (error: any) {
    console.error("Exam PUT error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 시험지 삭제 및 연동된 제출 기록 / 구글 드라이브 인증샷 일괄 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");

    if (!examId) {
      return NextResponse.json({ success: false, error: "examId가 필요합니다." }, { status: 400 });
    }

    // 1. 기존 시험지 목록에서 삭제
    const existingExams = await getExamPapers();
    const filteredExams = existingExams.filter((e) => e.id !== examId);
    await saveExamPapers(filteredExams);

    // 2. 제출 기록 확인 및 삭제할 구글 드라이브 인증샷 fileId 수집
    const allSubmissions = await getSubmissions();
    const relatedSubmissions = allSubmissions.filter((s: any) => s.exam_id === examId);
    const remainingSubmissions = allSubmissions.filter((s: any) => s.exam_id !== examId);

    const proofDriveIds = new Set<string>();

    for (const sub of relatedSubmissions) {
      // 2-1. sub.proof_images 배열 검사
      if (Array.isArray(sub.proof_images)) {
        for (const p of sub.proof_images) {
          if (p?.drive_id && typeof p.drive_id === "string" && p.drive_id.trim()) {
            proofDriveIds.add(p.drive_id.trim());
          }
        }
      }
      // 2-2. sub.answers 객체 내부 proof_image_drive_id 검사
      if (sub.answers && typeof sub.answers === "object") {
        for (const key of Object.keys(sub.answers)) {
          const ans = sub.answers[key];
          if (
            ans?.proof_image_drive_id &&
            typeof ans.proof_image_drive_id === "string" &&
            ans.proof_image_drive_id.trim()
          ) {
            proofDriveIds.add(ans.proof_image_drive_id.trim());
          }
        }
      }
    }

    // 3. 구글 드라이브에서 인증 사진 파일 영구 삭제 또는 학생 폴더에서 연결 해제
    let deletedProofsCount = 0;
    if (proofDriveIds.size > 0) {
      try {
        const drive = getDriveClient();
        if (drive) {
          const deletePromises = Array.from(proofDriveIds).map(async (fileId) => {
            // 1단계: 영구 삭제 시도
            try {
              await drive.files.delete({ fileId, supportsAllDrives: true });
              deletedProofsCount++;
              console.log(`✅ Google Drive proof image permanently deleted: ${fileId}`);
              return;
            } catch (delErr: any) {
              // 2단계: 휴지통 이동 시도
              try {
                await drive.files.update({
                  fileId,
                  requestBody: { trashed: true },
                  supportsAllDrives: true,
                });
                deletedProofsCount++;
                console.log(`✅ Google Drive proof image moved to trash: ${fileId}`);
                return;
              } catch (trashErr: any) {
                // 3단계: 소유권 제약 시 부모 폴더(학생 폴더)에서 완전히 분리(removeParents)
                try {
                  const fileMeta = await drive.files.get({
                    fileId,
                    fields: "id, parents",
                    supportsAllDrives: true,
                  });
                  const parents = fileMeta.data.parents;
                  if (parents && parents.length > 0) {
                    for (const parentId of parents) {
                      await drive.files.update({
                        fileId,
                        removeParents: parentId,
                        supportsAllDrives: true,
                      });
                    }
                    deletedProofsCount++;
                    console.log(`✅ Google Drive proof image detached from parents (removed from student folder): ${fileId}`);
                    return;
                  }
                } catch (detachErr: any) {
                  console.warn(`⚠️ Failed to detach Google Drive file ${fileId}:`, detachErr?.message);
                }
              }
            }
          });
          await Promise.allSettled(deletePromises);

          // 4단계: 학생 드라이브 폴더의 list.json에서도 해당 인증샷 레코드 정리
          const relatedStudentIds = Array.from(new Set(relatedSubmissions.map((s: any) => s.student_id).filter(Boolean)));
          if (relatedStudentIds.length > 0) {
            try {
              const { data: students } = await supabase
                .from("students")
                .select("id, drive_folder_id")
                .in("id", relatedStudentIds);

              if (students && students.length > 0) {
                for (const st of students) {
                  if (!st.drive_folder_id) continue;
                  try {
                    const listRes = await drive.files.list({
                      q: `'${st.drive_folder_id}' in parents and name = 'list.json' and trashed = false`,
                      fields: "files(id, name)",
                      supportsAllDrives: true,
                    });
                    for (const f of listRes.data.files || []) {
                      if (!f.id) continue;
                      try {
                        const contentRes: any = await (drive.files.get as any)({ fileId: f.id, alt: "media" });
                        let records = contentRes?.data;
                        if (typeof records === "string") {
                          try { records = JSON.parse(records); } catch {}
                        }
                        if (Array.isArray(records)) {
                          const originalLen = records.length;
                          const filteredRecords = records.filter((r: any) => !proofDriveIds.has(r.id));
                          if (filteredRecords.length !== originalLen) {
                            await (drive.files.update as any)({
                              fileId: f.id,
                              media: {
                                mimeType: "application/json",
                                body: JSON.stringify(filteredRecords, null, 2),
                              },
                              supportsAllDrives: true,
                            });
                            console.log(`✅ Cleaned up ${originalLen - filteredRecords.length} records in student list.json (${f.id})`);
                          }
                        }
                      } catch (readErr: any) {
                        console.warn(`Failed reading/updating list.json ${f.id}:`, readErr?.message);
                      }
                    }
                  } catch (folderErr: any) {
                    console.warn(`Failed checking student folder ${st.drive_folder_id}:`, folderErr?.message);
                  }
                }
              }
            } catch (stErr: any) {
              console.warn("Error fetching students for list.json cleanup:", stErr?.message);
            }
          }
        }
      } catch (driveErr) {
        console.error("Google Drive deletion processing error:", driveErr);
      }
    }

    // 5. 연동된 제출 기록이 있다면 DB에서 정리 저장
    if (relatedSubmissions.length > 0) {
      await saveSubmissions(remainingSubmissions);
    }

    return NextResponse.json({
      success: true,
      message: `시험지가 삭제되었습니다.${proofDriveIds.size > 0 ? ` (연동된 인증샷 ${deletedProofsCount}장 구글 드라이브 삭제 및 정리 완료)` : ""}`,
      deletedProofsCount,
    });
  } catch (error: any) {
    console.error("Exam DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
