import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = "test2_filter_chips_data";
const EXAMS_RECORD_DRIVE_ID = "test2_exam_papers_data";

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export type FilterChipColor = 
  | 'violet' 
  | 'indigo' 
  | 'blue' 
  | 'cyan' 
  | 'emerald' 
  | 'lime' 
  | 'amber' 
  | 'rose' 
  | 'pink' 
  | 'fuchsia' 
  | 'cloud' 
  | 'slate';

export type FilterChipEffect = 
  | 'clean' 
  | 'glow' 
  | 'pulse' 
  | 'sparkle' 
  | 'ring' 
  | 'gradient';

export interface ExamFilterChip {
  id: string;
  name: string;
  icon?: string;
  color: FilterChipColor;
  effect: FilterChipEffect;
  order: number;
  isSystem?: boolean;
  created_at: string;
  updated_at?: string;
}

// 🌟 기본 권장 프리셋 필터칩
const DEFAULT_FILTER_CHIPS: ExamFilterChip[] = [
  {
    id: 'chip_default_normal',
    name: '단일 시험지',
    icon: '📝',
    color: 'violet',
    effect: 'clean',
    order: 1,
    isSystem: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'chip_default_wrong',
    name: '오답 시험지',
    icon: '🔄',
    color: 'rose',
    effect: 'clean',
    order: 2,
    isSystem: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'chip_default_midterm',
    name: '2학기 지필대비',
    icon: '🎯',
    color: 'indigo',
    effect: 'glow',
    order: 3,
    isSystem: false,
    created_at: new Date().toISOString(),
  },
];

// 헬퍼: DB에 필터칩 목록 저장하기 (필수 컬럼 name, type, grade 반드시 포함)
async function saveFilterChips(chips: ExamFilterChip[]): Promise<void> {
  const payload = JSON.stringify({
    chips,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: RECORD_DRIVE_ID,
      name: "test2_filter_chips.json",
      type: "file",
      grade: "공통",
      file_data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) {
    console.error("Failed to save filter chips:", error);
    throw new Error(`필터칩 데이터베이스 저장 실패: ${error.message}`);
  }
}

// 헬퍼: DB에서 필터칩 목록 가져오기
async function getFilterChips(): Promise<ExamFilterChip[]> {
  try {
    const { data, error } = await supabase
      .from("exam_library")
      .select("file_data")
      .eq("drive_id", RECORD_DRIVE_ID)
      .maybeSingle();

    if (error) {
      console.error("DB query error for filter chips:", error);
      return DEFAULT_FILTER_CHIPS;
    }

    // DB에 레코드가 아직 없거나 file_data가 없는 경우에만 초기 프리셋 저장
    if (!data || !data.file_data) {
      try {
        await saveFilterChips(DEFAULT_FILTER_CHIPS);
      } catch (saveErr) {
        console.error("Initial save error:", saveErr);
      }
      return DEFAULT_FILTER_CHIPS;
    }

    const parsed = JSON.parse(data.file_data);
    // 빈 배열([])이어도 사용자가 모든 칩을 삭제한 상태이므로 빈 배열을 정상 유지!
    const chips: ExamFilterChip[] = Array.isArray(parsed.chips) ? parsed.chips : DEFAULT_FILTER_CHIPS;
    return chips.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (e) {
    console.error("Failed to load filter chips:", e);
    return DEFAULT_FILTER_CHIPS;
  }
}

// GET: 필터칩 목록 조회
export async function GET() {
  try {
    const chips = await getFilterChips();
    return NextResponse.json(
      { success: true, chips },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// POST: 새 필터칩 생성
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, icon, color, effect } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "필터칩 이름을 입력해주세요." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const currentChips = await getFilterChips();
    const trimmedName = name.trim();

    // 중복 이름 체크
    if (currentChips.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "이미 동일한 이름의 필터칩이 존재합니다." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const maxOrder = currentChips.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
    const newChip: ExamFilterChip = {
      id: `chip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      icon: icon && typeof icon === 'string' ? icon.trim() : undefined,
      color: color || 'violet',
      effect: effect || 'clean',
      order: maxOrder + 1,
      isSystem: false,
      created_at: new Date().toISOString(),
    };

    const updatedChips = [...currentChips, newChip];
    await saveFilterChips(updatedChips);

    return NextResponse.json(
      { success: true, chip: newChip, chips: updatedChips },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("POST filter-chips error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// PUT: 필터칩 수정 또는 순서 일괄 갱신
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // 1) 전체 칩 목록 순서/데이터 일괄 갱신인 경우 ({ chips: ExamFilterChip[] })
    if (Array.isArray(body.chips)) {
      const sanitizedChips: ExamFilterChip[] = body.chips.map((c: any, idx: number) => ({
        ...c,
        order: idx + 1,
        updated_at: new Date().toISOString(),
      }));
      await saveFilterChips(sanitizedChips);
      return NextResponse.json(
        { success: true, chips: sanitizedChips },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 2) 단일 칩 수정인 경우 ({ chip: Partial<ExamFilterChip> & { id: string } })
    const { chip } = body;
    if (!chip || !chip.id) {
      return NextResponse.json(
        { success: false, error: "수정할 칩 ID가 필요합니다." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const currentChips = await getFilterChips();
    const idx = currentChips.findIndex(c => c.id === chip.id);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: "수정할 필터칩을 찾을 수 없습니다." },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    const current = currentChips[idx];
    const updatedChip: ExamFilterChip = {
      ...current,
      name: chip.name !== undefined ? chip.name.trim() : current.name,
      icon: chip.icon !== undefined ? (chip.icon ? chip.icon.trim() : undefined) : current.icon,
      color: chip.color || current.color,
      effect: chip.effect || current.effect,
      order: typeof chip.order === 'number' ? chip.order : current.order,
      updated_at: new Date().toISOString(),
    };

    currentChips[idx] = updatedChip;
    await saveFilterChips(currentChips);

    return NextResponse.json(
      { success: true, chip: updatedChip, chips: currentChips },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("PUT filter-chips error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// DELETE: 필터칩 삭제 (⚠️ 중요: 시험지는 절대 삭제되지 않음! 오직 시험지의 filter_chip_ids에서만 칩 ID 제거)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chipId = searchParams.get("id");

    if (!chipId) {
      return NextResponse.json(
        { success: false, error: "삭제할 칩 ID가 필요합니다." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const decodedChipId = decodeURIComponent(chipId);
    const currentChips = await getFilterChips();
    const targetChip = currentChips.find(c => c.id === chipId || c.id === decodedChipId);
    if (!targetChip) {
      return NextResponse.json(
        { success: false, error: "삭제할 필터칩을 찾을 수 없습니다." },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    const effectiveId = targetChip.id;

    // 1. 필터칩 목록에서 해당 칩 제거 및 DB 저장
    const updatedChips = currentChips.filter(c => c.id !== effectiveId);
    await saveFilterChips(updatedChips);

    // 2. 🛡️ [핵심 안전 보장]: 기존 시험지 목록에서 이 필터칩 ID만 안전하게 제거 (시험지 자체는 절대 삭제 안 됨!)
    try {
      const { data: examData } = await supabase
        .from("exam_library")
        .select("file_data")
        .eq("drive_id", EXAMS_RECORD_DRIVE_ID)
        .maybeSingle();

      if (examData && examData.file_data) {
        const parsedExams = JSON.parse(examData.file_data);
        if (Array.isArray(parsedExams.exams)) {
          let hasChanges = false;
          const cleanedExams = parsedExams.exams.map((exam: any) => {
            if (Array.isArray(exam.filter_chip_ids) && (exam.filter_chip_ids.includes(effectiveId) || exam.filter_chip_ids.includes(chipId))) {
              hasChanges = true;
              return {
                ...exam,
                filter_chip_ids: exam.filter_chip_ids.filter((id: string) => id !== effectiveId && id !== chipId),
              };
            }
            return exam;
          });

          if (hasChanges) {
            await supabase.from("exam_library").upsert(
              {
                drive_id: EXAMS_RECORD_DRIVE_ID,
                name: "test2_exam_papers.json",
                type: "file",
                grade: "공통",
                file_data: JSON.stringify({ ...parsedExams, exams: cleanedExams }),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "drive_id" }
            );
          }
        }
      }
    } catch (examCleanErr) {
      console.error("Failed to clean up deleted chipId from exams:", examCleanErr);
      // 필터칩 삭제 자체는 이미 성공했으므로 계속 진행
    }

    return NextResponse.json(
      { success: true, chips: updatedChips },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("DELETE filter-chips error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
