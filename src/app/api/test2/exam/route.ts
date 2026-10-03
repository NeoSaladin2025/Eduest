import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = "test2_exam_papers_data";

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
    const { title, grade, duration_min, questions, assigned_student_ids, is_wrong_review, is_special, require_proof_image, parent_exam_id } = body;

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
      questions: questions.map((q: any, idx: number) => ({
        id: q.id || `q_${idx + 1}_${Date.now()}`,
        drive_id: q.drive_id,
        name: q.name,
        image_url: q.image_url || "",
        answer: String(q.answer ?? "").trim(),
        raw_answer: String(q.raw_answer ?? "").trim(),
        solution_drive_id: q.solution_drive_id || q.drive_id,
        points: q.points || Math.round(100 / questions.length),
      })),
      assigned_student_ids: Array.isArray(assigned_student_ids) ? assigned_student_ids : [],
      is_wrong_review: !!is_wrong_review,
      is_special: !!is_special,
      require_proof_image: !!require_proof_image,
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
    const { examId, title, grade, duration_min, questions, assigned_student_ids } = body;

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
      questions: questions !== undefined ? questions : current.questions,
      assigned_student_ids:
        assigned_student_ids !== undefined ? assigned_student_ids : current.assigned_student_ids,
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

// DELETE: 시험지 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");

    if (!examId) {
      return NextResponse.json({ success: false, error: "examId가 필요합니다." }, { status: 400 });
    }

    const existingExams = await getExamPapers();
    const filteredExams = existingExams.filter((e) => e.id !== examId);

    await saveExamPapers(filteredExams);

    return NextResponse.json({ success: true, message: "시험지가 삭제되었습니다." });
  } catch (error: any) {
    console.error("Exam DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
