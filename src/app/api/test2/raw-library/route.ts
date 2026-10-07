import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildExamLibraryTree, ExamLibraryNode, ExamLibraryRow } from "@/lib/examLibraryTree";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXCLUDED_IDS = [
  "class_schedule_root_data",
  "student_menu_config_data",
  "test2_exam_papers_data",
  "test2_student_submissions_data",
  "test_bank_categories_data",
  "test_bank_items_data",
  "test_twin_problems_data"
];

// 헬퍼: 1000개 행 제한 없이 특정 학년의 전체 데이터 수집 (페이지네이션)
async function fetchAllRowsForGrade(targetGrade: string): Promise<ExamLibraryRow[]> {
  const allRows: ExamLibraryRow[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("exam_library")
      .select("drive_id, parent_id, name, type, grade, question_image_drive_id")
      .not("drive_id", "in", `(${EXCLUDED_IDS.map(id => `"${id}"`).join(",")})`)
      .range(from, from + PAGE_SIZE - 1)
      .order("name", { ascending: true });

    if (targetGrade && targetGrade !== "ALL") {
      query = query.eq("grade", targetGrade);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      break;
    }

    allRows.push(...(data as ExamLibraryRow[]));

    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  return allRows;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "중3";

    const rows = await fetchAllRowsForGrade(grade);

    // 트리 구성
    const tree = buildExamLibraryTree(rows);

    // 학생 화면과 동일한 규칙: 학년 이름이 포함된 최상위 폴더가 있으면 그 하위 폴더들을 루트로 노출
    // 예: "중3" 폴더 하위의 "중간", "기말", "개별질문" 등을 바로 보여줌
    let displayNodes: ExamLibraryNode[] = tree;

    if (grade !== "ALL") {
      const gradeRootFolder = tree.find(node => node.name.includes(grade));
      if (gradeRootFolder && (gradeRootFolder.subFolders.length > 0 || gradeRootFolder.files.length > 0)) {
        displayNodes = [
          ...gradeRootFolder.subFolders,
          ...(gradeRootFolder.files.length > 0 ? [gradeRootFolder] : [])
        ];
      }
    }

    return NextResponse.json({
      success: true,
      grade,
      totalCount: rows.length,
      fileCount: rows.filter(r => r.type === "file").length,
      folderCount: rows.filter(r => r.type === "folder").length,
      tree: displayNodes,
    });
  } catch (error: any) {
    console.error("raw-library GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
