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

// 🌟 즐겨찾기 조합 (필터 프리셋) 인터페이스
export interface FilterPreset {
  id: string;
  name: string;
  chip_ids: string[];
  match_mode: 'AND' | 'OR';
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

// 헬퍼: DB에 필터칩 + 즐겨찾기 프리셋 목록 저장하기 (필수 컬럼 name, type, grade 반드시 포함)
async function saveFilterChipsData(
  chips: ExamFilterChip[],
  presets: FilterPreset[] = []
): Promise<void> {
  const payload = JSON.stringify({
    chips,
    presets,
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
    console.error("Failed to save filter chips data:", error);
    throw new Error(`필터칩 데이터베이스 저장 실패: ${error.message}`);
  }
}

// 헬퍼: DB에서 필터칩 + 즐겨찾기 프리셋 목록 가져오기
async function getFilterChipsData(): Promise<{
  chips: ExamFilterChip[];
  presets: FilterPreset[];
}> {
  try {
    const { data, error } = await supabase
      .from("exam_library")
      .select("file_data")
      .eq("drive_id", RECORD_DRIVE_ID)
      .maybeSingle();

    if (error) {
      console.error("DB query error for filter chips:", error);
      return { chips: DEFAULT_FILTER_CHIPS, presets: [] };
    }

    // DB에 레코드가 아직 없거나 file_data가 없는 경우에만 초기 프리셋 저장
    if (!data || !data.file_data) {
      try {
        await saveFilterChipsData(DEFAULT_FILTER_CHIPS, []);
      } catch (saveErr) {
        console.error("Initial save error:", saveErr);
      }
      return { chips: DEFAULT_FILTER_CHIPS, presets: [] };
    }

    const parsed = JSON.parse(data.file_data);
    const chips: ExamFilterChip[] = Array.isArray(parsed.chips) ? parsed.chips : DEFAULT_FILTER_CHIPS;
    const presets: FilterPreset[] = Array.isArray(parsed.presets) ? parsed.presets : [];

    return {
      chips: chips.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      presets: presets.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    };
  } catch (e) {
    console.error("Failed to load filter chips data:", e);
    return { chips: DEFAULT_FILTER_CHIPS, presets: [] };
  }
}

// 하위 호환 헬퍼
async function saveFilterChips(chips: ExamFilterChip[]): Promise<void> {
  const { presets } = await getFilterChipsData();
  await saveFilterChipsData(chips, presets);
}

async function getFilterChips(): Promise<ExamFilterChip[]> {
  const { chips } = await getFilterChipsData();
  return chips;
}

// GET: 필터칩 목록 및 즐겨찾기 프리셋 조회
export async function GET() {
  try {
    const { chips, presets } = await getFilterChipsData();
    return NextResponse.json(
      { success: true, chips, presets },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// POST: 새 필터칩 생성 또는 즐겨찾기 조합(프리셋) 생성
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 🌟 1) 즐겨찾기 조합(프리셋) 저장인 경우
    if (body.type === 'preset') {
      const { name, chip_ids, match_mode } = body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { success: false, error: "즐겨찾기 이름을 입력해주세요." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      if (!Array.isArray(chip_ids) || chip_ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "즐겨찾기에 포함할 필터칩을 1개 이상 선택해주세요." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const { chips, presets } = await getFilterChipsData();
      const newPreset: FilterPreset = {
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        chip_ids,
        match_mode: match_mode === 'OR' ? 'OR' : 'AND',
        created_at: new Date().toISOString(),
      };

      const updatedPresets = [newPreset, ...presets];
      await saveFilterChipsData(chips, updatedPresets);

      return NextResponse.json(
        { success: true, preset: newPreset, presets: updatedPresets },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 🌟 2) 일반 필터칩 생성인 경우
    const { name, icon, color, effect } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "필터칩 이름을 입력해주세요." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { chips: currentChips, presets } = await getFilterChipsData();
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
    await saveFilterChipsData(updatedChips, presets);

    return NextResponse.json(
      { success: true, chip: newChip, chips: updatedChips, presets },
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

// PUT: 필터칩/프리셋 수정 또는 순서 일괄 갱신
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // 🌟 1) 즐겨찾기 프리셋 수정인 경우
    if (body.type === 'preset') {
      const { chips, presets } = await getFilterChipsData();

      // 프리셋 일괄 갱신
      if (Array.isArray(body.presets)) {
        await saveFilterChipsData(chips, body.presets);
        return NextResponse.json(
          { success: true, presets: body.presets },
          { headers: NO_CACHE_HEADERS }
        );
      }

      // 단일 프리셋 수정
      const { preset } = body;
      if (!preset || !preset.id) {
        return NextResponse.json(
          { success: false, error: "수정할 즐겨찾기 ID가 필요합니다." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const idx = presets.findIndex(p => p.id === preset.id);
      if (idx === -1) {
        return NextResponse.json(
          { success: false, error: "수정할 즐겨찾기를 찾을 수 없습니다." },
          { status: 404, headers: NO_CACHE_HEADERS }
        );
      }

      const updatedPreset: FilterPreset = {
        ...presets[idx],
        name: preset.name !== undefined ? preset.name.trim() : presets[idx].name,
        chip_ids: Array.isArray(preset.chip_ids) ? preset.chip_ids : presets[idx].chip_ids,
        match_mode: preset.match_mode || presets[idx].match_mode,
        updated_at: new Date().toISOString(),
      };

      presets[idx] = updatedPreset;
      await saveFilterChipsData(chips, presets);

      return NextResponse.json(
        { success: true, preset: updatedPreset, presets },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 🌟 2) 필터칩 전체 순서 갱신인 경우 ({ chips: ExamFilterChip[] })
    const { presets } = await getFilterChipsData();
    if (Array.isArray(body.chips)) {
      const sanitizedChips: ExamFilterChip[] = body.chips.map((c: any, idx: number) => ({
        ...c,
        order: idx + 1,
        updated_at: new Date().toISOString(),
      }));
      await saveFilterChipsData(sanitizedChips, presets);
      return NextResponse.json(
        { success: true, chips: sanitizedChips },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 🌟 3) 단일 필터칩 수정인 경우 ({ chip: Partial<ExamFilterChip> & { id: string } })
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
    await saveFilterChipsData(currentChips, presets);

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

// DELETE: 필터칩 삭제 또는 즐겨찾기 프리셋 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const presetId = searchParams.get("preset_id");

    // 🌟 1) 즐겨찾기 프리셋 삭제인 경우
    if (presetId) {
      const { chips, presets } = await getFilterChipsData();
      const updatedPresets = presets.filter(p => p.id !== presetId);
      await saveFilterChipsData(chips, updatedPresets);
      return NextResponse.json(
        { success: true, presets: updatedPresets },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // 🌟 2) 필터칩 삭제인 경우
    const chipId = searchParams.get("id");
    if (!chipId) {
      return NextResponse.json(
        { success: false, error: "삭제할 칩 ID가 필요합니다." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const decodedChipId = decodeURIComponent(chipId);
    const { chips: currentChips, presets } = await getFilterChipsData();
    const targetChip = currentChips.find(c => c.id === chipId || c.id === decodedChipId);
    if (!targetChip) {
      return NextResponse.json(
        { success: false, error: "삭제할 필터칩을 찾을 수 없습니다." },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    const effectiveId = targetChip.id;

    // 1. 필터칩 목록에서 해당 칩 제거
    const updatedChips = currentChips.filter(c => c.id !== effectiveId);

    // 2. 프리셋에서도 해당 필터칩 ID 안전하게 제거
    const cleanedPresets = presets.map(p => ({
      ...p,
      chip_ids: p.chip_ids.filter(id => id !== effectiveId && id !== chipId),
    }));

    await saveFilterChipsData(updatedChips, cleanedPresets);

    // 3. 🛡️ [핵심 안전 보장]: 기존 시험지 목록에서 이 필터칩 ID만 안전하게 제거 (시험지 자체는 절대 삭제 안 됨!)
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
      { success: true, chips: updatedChips, presets: cleanedPresets },
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
