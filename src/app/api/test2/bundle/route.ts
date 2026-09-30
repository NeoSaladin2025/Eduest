import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { ExamPaper } from "../exam/route";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUNDLES_RECORD_DRIVE_ID = "test2_exam_bundles_data";
const EXAMS_RECORD_DRIVE_ID = "test2_exam_papers_data";

export interface ExamBundleItem {
  round: number; // 1, 2, 3...
  exam_id: string;
  exam_title: string;
  question_count?: number;
  duration_min?: number;
}

export interface ExamBundle {
  id: string;
  title: string;
  grade: string;
  description?: string;
  items: ExamBundleItem[];
  assigned_student_ids: string[];
  created_at: string;
  updated_at: string;
}

// 헬퍼: 전체 묶음 목록 가져오기
async function getExamBundles(): Promise<ExamBundle[]> {
  const { data, error } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", BUNDLES_RECORD_DRIVE_ID)
    .maybeSingle();

  if (error || !data || !data.file_data) {
    return [];
  }

  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.bundles) ? parsed.bundles : [];
  } catch (e) {
    console.error("Failed to parse exam bundles:", e);
    return [];
  }
}

// 헬퍼: 전체 묶음 목록 저장하기
async function saveExamBundles(bundles: ExamBundle[]) {
  const jsonString = JSON.stringify({
    bundles,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: BUNDLES_RECORD_DRIVE_ID,
      name: "test2_exam_bundles.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    throw new Error(`시험지 묶음 데이터 저장 실패: ${error.message}`);
  }
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

// GET: 전체 묶음 목록 또는 특정 묶음 또는 학생에게 배정된 묶음 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bundleId = searchParams.get("bundleId");
    const studentId = searchParams.get("studentId");

    const bundles = await getExamBundles();

    if (bundleId) {
      const bundle = bundles.find((b) => b.id === bundleId);
      if (!bundle) {
        return NextResponse.json({ success: false, error: "묶음을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ success: true, bundle });
    }

    if (studentId) {
      const assignedBundles = bundles.filter((b) =>
        b.assigned_student_ids && b.assigned_student_ids.includes(studentId)
      );
      return NextResponse.json({ success: true, bundles: assignedBundles });
    }

    return NextResponse.json({ success: true, bundles });
  } catch (error: any) {
    console.error("Bundle GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 새 묶음 생성 또는 기존 묶음 수정
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, grade, description, items, assigned_student_ids } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: "묶음 제목을 입력해주세요." }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "최소 1개 이상의 시험지를 묶음에 포함해야 합니다." }, { status: 400 });
    }

    const bundles = await getExamBundles();
    const allExams = await getExamPapers();
    const examMap = new Map(allExams.map((e) => [e.id, e]));

    // 항목 유효성 및 회차 번호 재정렬
    const formattedItems: ExamBundleItem[] = items.map((item: any, idx: number) => {
      const exam = examMap.get(item.exam_id);
      return {
        round: idx + 1,
        exam_id: item.exam_id,
        exam_title: item.exam_title || exam?.title || `제 ${idx + 1}회 시험`,
        question_count: exam?.questions?.length || item.question_count || 0,
        duration_min: exam?.duration_min || item.duration_min || 60,
      };
    });

    const now = new Date().toISOString();
    let updatedBundle: ExamBundle;

    if (id) {
      // 수정
      const idx = bundles.findIndex((b) => b.id === id);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "수정할 묶음을 찾을 수 없습니다." }, { status: 404 });
      }
      updatedBundle = {
        ...bundles[idx],
        title: title.trim(),
        grade: grade || bundles[idx].grade || "공통",
        description: description ?? bundles[idx].description,
        items: formattedItems,
        assigned_student_ids: Array.isArray(assigned_student_ids) ? assigned_student_ids : bundles[idx].assigned_student_ids || [],
        updated_at: now,
      };
      bundles[idx] = updatedBundle;
    } else {
      // 신규 생성
      updatedBundle = {
        id: `bundle_${Date.now()}`,
        title: title.trim(),
        grade: grade || "공통",
        description: description || "",
        items: formattedItems,
        assigned_student_ids: Array.isArray(assigned_student_ids) ? assigned_student_ids : [],
        created_at: now,
        updated_at: now,
      };
      bundles.unshift(updatedBundle);
    }

    // 또한 묶음에 배정된 학생들을 묶음 내부의 개별 시험지(ExamPaper)의 assigned_student_ids에도 자동 동기화
    if (updatedBundle.assigned_student_ids && updatedBundle.assigned_student_ids.length > 0) {
      let examsModified = false;
      const studentIdsToAdd = updatedBundle.assigned_student_ids;
      for (const item of formattedItems) {
        const targetExam = allExams.find((e) => e.id === item.exam_id);
        if (targetExam) {
          const currentAssigned = new Set(targetExam.assigned_student_ids || []);
          let added = false;
          for (const sId of studentIdsToAdd) {
            if (!currentAssigned.has(sId)) {
              currentAssigned.add(sId);
              added = true;
            }
          }
          if (added) {
            targetExam.assigned_student_ids = Array.from(currentAssigned);
            examsModified = true;
          }
        }
      }
      if (examsModified) {
        // 개별 시험지에도 배정 반영
        const jsonString = JSON.stringify({ exams: allExams, updated_at: now });
        await supabase.from("exam_library").upsert(
          {
            drive_id: EXAMS_RECORD_DRIVE_ID,
            name: "test2_exam_papers.json",
            type: "file",
            grade: "공통",
            file_data: jsonString,
            updated_at: now,
          },
          { onConflict: "drive_id" }
        );
      }
    }

    await saveExamBundles(bundles);
    return NextResponse.json({ success: true, bundle: updatedBundle });
  } catch (error: any) {
    console.error("Bundle POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 묶음 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bundleId = searchParams.get("bundleId");

    if (!bundleId) {
      return NextResponse.json({ success: false, error: "bundleId가 필요합니다." }, { status: 400 });
    }

    const bundles = await getExamBundles();
    const filtered = bundles.filter((b) => b.id !== bundleId);

    if (filtered.length === bundles.length) {
      return NextResponse.json({ success: false, error: "삭제할 묶음을 찾을 수 없습니다." }, { status: 404 });
    }

    await saveExamBundles(filtered);
    return NextResponse.json({ success: true, message: "묶음이 삭제되었습니다." });
  } catch (error: any) {
    console.error("Bundle DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: 학생 배정만 업데이트
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { bundleId, studentIds } = body;

    if (!bundleId || !Array.isArray(studentIds)) {
      return NextResponse.json({ success: false, error: "bundleId와 studentIds 배열이 필요합니다." }, { status: 400 });
    }

    const bundles = await getExamBundles();
    const targetBundle = bundles.find((b) => b.id === bundleId);

    if (!targetBundle) {
      return NextResponse.json({ success: false, error: "묶음을 찾을 수 없습니다." }, { status: 404 });
    }

    targetBundle.assigned_student_ids = studentIds;
    targetBundle.updated_at = new Date().toISOString();

    // 묶음에 포함된 개별 시험지들에도 학생 배정 동기화
    const allExams = await getExamPapers();
    let examsModified = false;
    for (const item of targetBundle.items) {
      const exam = allExams.find((e) => e.id === item.exam_id);
      if (exam) {
        const currentSet = new Set(exam.assigned_student_ids || []);
        for (const sId of studentIds) {
          currentSet.add(sId);
        }
        exam.assigned_student_ids = Array.from(currentSet);
        examsModified = true;
      }
    }
    if (examsModified) {
      await supabase.from("exam_library").upsert(
        {
          drive_id: EXAMS_RECORD_DRIVE_ID,
          name: "test2_exam_papers.json",
          type: "file",
          grade: "공통",
          file_data: JSON.stringify({ exams: allExams, updated_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "drive_id" }
      );
    }

    await saveExamBundles(bundles);
    return NextResponse.json({ success: true, bundle: targetBundle });
  } catch (error: any) {
    console.error("Bundle PUT error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
