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
  "test_twin_problems_data",
  "textbook_builder_list_data",
  "textbook_builder_items_data"
];

// 헬퍼: 1000개 행 제한 없이 특정 학년의 전체 데이터 수집 (페이지네이션)
async function fetchAllRowsForGrade(targetGrade: string): Promise<ExamLibraryRow[]> {
  const rowMap = new Map<string, ExamLibraryRow>();
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("exam_library")
      .select("drive_id, parent_id, name, type, grade, question_image_drive_id")
      .not("drive_id", "in", `(${EXCLUDED_IDS.map(id => `"${id}"`).join(",")})`)
      .range(from, from + PAGE_SIZE - 1)
      // 고유 키(drive_id) 2차 정렬을 반드시 포함해야 동명이인 파일(0013.html 등)이 페이지 경계에서 누락/중복되지 않음
      .order("name", { ascending: true })
      .order("drive_id", { ascending: true });

    if (targetGrade && targetGrade !== "ALL") {
      query = query.eq("grade", targetGrade);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      break;
    }

    for (const row of data as ExamLibraryRow[]) {
      if (!rowMap.has(row.drive_id)) {
        rowMap.set(row.drive_id, row);
      }
    }

    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  return Array.from(rowMap.values());
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "중3";
    const includeGradeRoot = searchParams.get("includeGradeRoot") === "1";

    const rows = await fetchAllRowsForGrade(grade);

    // 트리 구성
    const tree = buildExamLibraryTree(rows);

    // 학생 화면과 동일한 규칙: 학년 이름이 포함된 최상위 폴더가 있으면 그 하위 폴더들을 루트로 노출
    // 예: "중3" 폴더 하위의 "중간", "기말", "개별질문" 등을 바로 보여줌
    // 단, includeGradeRoot=1 요청 시(폴더 미세 동기화 등) 학년 루트 폴더 자체도 선택할 수 있게 유지
    let displayNodes: ExamLibraryNode[] = tree;

    if (grade !== "ALL" && !includeGradeRoot) {
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
