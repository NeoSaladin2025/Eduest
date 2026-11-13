import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Textbook, MajorUnit, MinorUnit, TextbookItem } from "@/lib/textbookTypes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TEXTBOOKS_RECORD_DRIVE_ID = "textbook_builder_list_data";
const TEXTBOOK_ITEMS_RECORD_DRIVE_ID = "textbook_builder_items_data";

// 헬퍼: 교재 목록 로드
async function getTextbooks(): Promise<Textbook[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", TEXTBOOKS_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.textbooks) ? parsed.textbooks : [];
  } catch {
    return [];
  }
}

// 헬퍼: 교재 목록 저장
async function saveTextbooks(textbooks: Textbook[]) {
  const jsonString = JSON.stringify({
    textbooks,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: TEXTBOOKS_RECORD_DRIVE_ID,
      name: "textbook_builder_list.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) throw new Error(`교재 목록 저장 실패: ${error.message}`);
}

// 헬퍼: 교재 수록 문항 목록 로드
async function getTextbookItems(): Promise<TextbookItem[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", TEXTBOOK_ITEMS_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

// 헬퍼: 교재 수록 문항 목록 저장
async function saveTextbookItems(items: TextbookItem[]) {
  const jsonString = JSON.stringify({
    items,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: TEXTBOOK_ITEMS_RECORD_DRIVE_ID,
      name: "textbook_builder_items.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) throw new Error(`교재 문항 저장 실패: ${error.message}`);
}

// GET: 교재 목록 및 아이템 조회 (학년 필터 지원)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade"); // 'ALL' or '중2', etc.

    let textbooks = await getTextbooks();
    let items = await getTextbookItems();

    if (grade && grade !== "ALL") {
      textbooks = textbooks.filter((tb) => tb.grade === grade);
      items = items.filter((item) => item.grade === grade);
    }

    // 각 교재 및 소단원별 문항 수 집계
    const enrichedTextbooks = textbooks.map((tb) => {
      const tbItems = items.filter((i) => i.textbook_id === tb.id);
      return {
        ...tb,
        totalItemCount: tbItems.length,
        major_units: (tb.major_units || []).map((maj) => {
          const majItems = tbItems.filter((i) => i.major_unit_id === maj.id);
          return {
            ...maj,
            itemCount: majItems.length,
            minor_units: (maj.minor_units || []).map((min) => {
              const minItems = majItems.filter((i) => i.minor_unit_id === min.id);
              return {
                ...min,
                itemCount: minItems.length,
              };
            }),
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      textbooks: enrichedTextbooks,
      items,
    });
  } catch (error: any) {
    console.error("Textbook GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 교재, 대단원, 소단원 CRUD 및 문항 조작
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const textbooks = await getTextbooks();
    const items = await getTextbookItems();

    // 1. 새 교재 생성
    if (action === "create_textbook") {
      const { name, grade, description, color_theme, initial_units } = body;
      if (!name || !name.trim()) {
        return NextResponse.json({ success: false, error: "교재명을 입력해주세요." }, { status: 400 });
      }

      const textbookId = `tb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      // 초기 단원 구성 처리 (입력된 경우)
      let majorUnits: MajorUnit[] = [];
      if (Array.isArray(initial_units) && initial_units.length > 0) {
        majorUnits = initial_units.map((maj: any, majIdx: number) => {
          const majId = `maj_${Date.now()}_${majIdx}_${Math.random().toString(36).substring(2, 5)}`;
          const minorUnits: MinorUnit[] = Array.isArray(maj.minor_units)
            ? maj.minor_units.map((min: any, minIdx: number) => ({
                id: `min_${Date.now()}_${majIdx}_${minIdx}_${Math.random().toString(36).substring(2, 5)}`,
                major_unit_id: majId,
                name: (min.name || `소단원 ${minIdx + 1}`).trim(),
                order_index: minIdx + 1,
              }))
            : [];

          return {
            id: majId,
            textbook_id: textbookId,
            name: (maj.name || `대단원 ${majIdx + 1}`).trim(),
            order_index: majIdx + 1,
            minor_units: minorUnits,
          };
        });
      } else {
        // 기본 1개 대단원 & 1개 소단원 생성
        const defaultMajId = `maj_${Date.now()}_1`;
        majorUnits = [
          {
            id: defaultMajId,
            textbook_id: textbookId,
            name: "Ⅰ. 제 1단원",
            order_index: 1,
            minor_units: [
              {
                id: `min_${Date.now()}_1_1`,
                major_unit_id: defaultMajId,
                name: "01. 첫 번째 소단원",
                order_index: 1,
              },
            ],
          },
        ];
      }

      const newTextbook: Textbook = {
        id: textbookId,
        name: name.trim(),
        grade: grade || "중2",
        description: description?.trim() || "",
        color_theme: color_theme || "indigo",
        major_units: majorUnits,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedTextbooks = [...textbooks, newTextbook];
      await saveTextbooks(updatedTextbooks);

      return NextResponse.json({
        success: true,
        textbook: newTextbook,
        textbooks: updatedTextbooks,
      });
    }

    // 2. 교재 정보 수정
    if (action === "update_textbook") {
      const { textbookId, name, grade, description, color_theme } = body;
      if (!textbookId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "교재 ID와 교재명이 필요합니다." }, { status: 400 });
      }

      const idx = textbooks.findIndex((t) => t.id === textbookId);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });
      }

      textbooks[idx] = {
        ...textbooks[idx],
        name: name.trim(),
        grade: grade || textbooks[idx].grade,
        description: description !== undefined ? description.trim() : textbooks[idx].description,
        color_theme: color_theme || textbooks[idx].color_theme,
        updated_at: new Date().toISOString(),
      };

      // 만약 학년이 바뀌었다면 수록 문항들의 학년도 동기화
      let updatedItems = items;
      if (grade && grade !== items.find((i) => i.textbook_id === textbookId)?.grade) {
        updatedItems = items.map((i) => (i.textbook_id === textbookId ? { ...i, grade } : i));
        await saveTextbookItems(updatedItems);
      }

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: textbooks[idx], textbooks });
    }

    // 3. 교재 삭제
    if (action === "delete_textbook") {
      const { textbookId } = body;
      if (!textbookId) {
        return NextResponse.json({ success: false, error: "textbookId가 필요합니다." }, { status: 400 });
      }

      const updatedTextbooks = textbooks.filter((t) => t.id !== textbookId);
      const updatedItems = items.filter((i) => i.textbook_id !== textbookId);

      await saveTextbooks(updatedTextbooks);
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, textbooks: updatedTextbooks, items: updatedItems });
    }

    // 4. 대단원 추가
    if (action === "add_major_unit") {
      const { textbookId, name } = body;
      if (!textbookId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "교재 ID와 대단원명이 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) {
        return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });
      }

      const majId = `maj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const minId = `min_${Date.now()}_1_${Math.random().toString(36).substring(2, 6)}`;
      
      const newMajor: MajorUnit = {
        id: majId,
        textbook_id: textbookId,
        name: name.trim(),
        order_index: (tb.major_units?.length || 0) + 1,
        minor_units: [
          {
            id: minId,
            major_unit_id: majId,
            name: "01. 첫 번째 소단원",
            order_index: 1,
          },
        ],
      };

      tb.major_units = [...(tb.major_units || []), newMajor];
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb, majorUnit: newMajor });
    }

    // 5. 대단원명 수정
    if (action === "update_major_unit") {
      const { textbookId, majorUnitId, name } = body;
      if (!textbookId || !majorUnitId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "textbookId, majorUnitId, name이 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const maj = (tb.major_units || []).find((m) => m.id === majorUnitId);
      if (!maj) return NextResponse.json({ success: false, error: "대단원을 찾을 수 없습니다." }, { status: 404 });

      maj.name = name.trim();
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb });
    }

    // 6. 대단원 삭제 (대단원 및 하위 소단원, 수록 문항 모두 삭제)
    if (action === "delete_major_unit") {
      const { textbookId, majorUnitId } = body;
      if (!textbookId || !majorUnitId) {
        return NextResponse.json({ success: false, error: "textbookId와 majorUnitId가 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      tb.major_units = (tb.major_units || [])
        .filter((m) => m.id !== majorUnitId)
        .map((m, idx) => ({ ...m, order_index: idx + 1 }));
      tb.updated_at = new Date().toISOString();

      const updatedItems = items.filter((i) => !(i.textbook_id === textbookId && i.major_unit_id === majorUnitId));

      await saveTextbooks(textbooks);
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, textbook: tb, items: updatedItems });
    }

    // 7. 대단원 순서 변경
    if (action === "reorder_major_units") {
      const { textbookId, orderedMajorUnitIds } = body;
      if (!textbookId || !Array.isArray(orderedMajorUnitIds)) {
        return NextResponse.json({ success: false, error: "textbookId와 orderedMajorUnitIds가 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const majMap = new Map((tb.major_units || []).map((m) => [m.id, m]));
      const newMajors: MajorUnit[] = [];

      orderedMajorUnitIds.forEach((id: string, idx: number) => {
        const found = majMap.get(id);
        if (found) {
          newMajors.push({ ...found, order_index: idx + 1 });
        }
      });

      tb.major_units = newMajors;
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb });
    }

    // 8. 소단원 추가
    if (action === "add_minor_unit") {
      const { textbookId, majorUnitId, name } = body;
      if (!textbookId || !majorUnitId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "textbookId, majorUnitId, name이 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const maj = (tb.major_units || []).find((m) => m.id === majorUnitId);
      if (!maj) return NextResponse.json({ success: false, error: "대단원을 찾을 수 없습니다." }, { status: 404 });

      const minId = `min_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newMinor: MinorUnit = {
        id: minId,
        major_unit_id: majorUnitId,
        name: name.trim(),
        order_index: (maj.minor_units?.length || 0) + 1,
      };

      maj.minor_units = [...(maj.minor_units || []), newMinor];
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb, minorUnit: newMinor });
    }

    // 9. 소단원명 수정
    if (action === "update_minor_unit") {
      const { textbookId, majorUnitId, minorUnitId, name } = body;
      if (!textbookId || !majorUnitId || !minorUnitId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "textbookId, majorUnitId, minorUnitId, name이 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const maj = (tb.major_units || []).find((m) => m.id === majorUnitId);
      if (!maj) return NextResponse.json({ success: false, error: "대단원을 찾을 수 없습니다." }, { status: 404 });

      const min = (maj.minor_units || []).find((m) => m.id === minorUnitId);
      if (!min) return NextResponse.json({ success: false, error: "소단원을 찾을 수 없습니다." }, { status: 404 });

      min.name = name.trim();
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb });
    }

    // 10. 소단원 삭제
    if (action === "delete_minor_unit") {
      const { textbookId, majorUnitId, minorUnitId } = body;
      if (!textbookId || !majorUnitId || !minorUnitId) {
        return NextResponse.json({ success: false, error: "textbookId, majorUnitId, minorUnitId가 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const maj = (tb.major_units || []).find((m) => m.id === majorUnitId);
      if (!maj) return NextResponse.json({ success: false, error: "대단원을 찾을 수 없습니다." }, { status: 404 });

      maj.minor_units = (maj.minor_units || [])
        .filter((m) => m.id !== minorUnitId)
        .map((m, idx) => ({ ...m, order_index: idx + 1 }));
      tb.updated_at = new Date().toISOString();

      const updatedItems = items.filter((i) => !(i.textbook_id === textbookId && i.minor_unit_id === minorUnitId));

      await saveTextbooks(textbooks);
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, textbook: tb, items: updatedItems });
    }

    // 11. 소단원 순서 변경
    if (action === "reorder_minor_units") {
      const { textbookId, majorUnitId, orderedMinorUnitIds } = body;
      if (!textbookId || !majorUnitId || !Array.isArray(orderedMinorUnitIds)) {
        return NextResponse.json({ success: false, error: "textbookId, majorUnitId, orderedMinorUnitIds가 필요합니다." }, { status: 400 });
      }

      const tb = textbooks.find((t) => t.id === textbookId);
      if (!tb) return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });

      const maj = (tb.major_units || []).find((m) => m.id === majorUnitId);
      if (!maj) return NextResponse.json({ success: false, error: "대단원을 찾을 수 없습니다." }, { status: 404 });

      const minMap = new Map((maj.minor_units || []).map((m) => [m.id, m]));
      const newMinors: MinorUnit[] = [];

      orderedMinorUnitIds.forEach((id: string, idx: number) => {
        const found = minMap.get(id);
        if (found) {
          newMinors.push({ ...found, order_index: idx + 1 });
        }
      });

      maj.minor_units = newMinors;
      tb.updated_at = new Date().toISOString();

      await saveTextbooks(textbooks);
      return NextResponse.json({ success: true, textbook: tb });
    }

    // 12. 소단원 내 문항 순서 재배치 (reorder_items)
    if (action === "reorder_items") {
      const { textbookId, minorUnitId, orderedItemIds } = body;
      if (!textbookId || !minorUnitId || !Array.isArray(orderedItemIds)) {
        return NextResponse.json({ success: false, error: "textbookId, minorUnitId, orderedItemIds가 필요합니다." }, { status: 400 });
      }

      const otherItems = items.filter((i) => !(i.textbook_id === textbookId && i.minor_unit_id === minorUnitId));
      const targetItems = items.filter((i) => i.textbook_id === textbookId && i.minor_unit_id === minorUnitId);
      const itemMap = new Map(targetItems.map((i) => [i.id, i]));

      const reordered: TextbookItem[] = [];
      const seen = new Set<string>();

      orderedItemIds.forEach((id: string, idx: number) => {
        const found = itemMap.get(id);
        if (found) {
          reordered.push({ ...found, order_index: idx + 1 });
          seen.add(id);
        }
      });

      // 누락 방지
      targetItems.forEach((item) => {
        if (!seen.has(item.id)) {
          reordered.push({ ...item, order_index: reordered.length + 1 });
        }
      });

      const updatedItems = [...otherItems, ...reordered];
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, items: updatedItems });
    }

    // 13. 개별 문항 삭제 (delete_item)
    if (action === "delete_item") {
      const { itemId } = body;
      if (!itemId) {
        return NextResponse.json({ success: false, error: "itemId가 필요합니다." }, { status: 400 });
      }

      const updatedItems = items.filter((i) => i.id !== itemId);
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, items: updatedItems });
    }

    // 14. 복수 문항 일괄 삭제 (delete_batch_items)
    if (action === "delete_batch_items") {
      const { itemIds } = body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return NextResponse.json({ success: false, error: "itemIds가 필요합니다." }, { status: 400 });
      }

      const deleteSet = new Set(itemIds);
      const updatedItems = items.filter((i) => !deleteSet.has(i.id));
      await saveTextbookItems(updatedItems);

      return NextResponse.json({ success: true, items: updatedItems, count: itemIds.length });
    }

    // 15. 문항을 다른 소단원으로 이동 (move_item)
    if (action === "move_item") {
      const { itemId, targetMajorUnitId, targetMinorUnitId } = body;
      if (!itemId || !targetMajorUnitId || !targetMinorUnitId) {
        return NextResponse.json({ success: false, error: "itemId, targetMajorUnitId, targetMinorUnitId가 필요합니다." }, { status: 400 });
      }

      const updatedItems = items.map((i) => {
        if (i.id !== itemId) return i;
        return {
          ...i,
          major_unit_id: targetMajorUnitId,
          minor_unit_id: targetMinorUnitId,
        };
      });

      await saveTextbookItems(updatedItems);
      return NextResponse.json({ success: true, items: updatedItems });
    }

    return NextResponse.json({ success: false, error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Textbook POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: 원천 라이브러리에서 선택된 문항들을 특정 소단원에 일괄 담기
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { textbookId, majorUnitId, minorUnitId, items: rawItems } = body;

    if (!textbookId || !majorUnitId || !minorUnitId || !Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "textbookId, majorUnitId, minorUnitId 및 1개 이상의 items가 필요합니다." },
        { status: 400 }
      );
    }

    const textbooks = await getTextbooks();
    const tb = textbooks.find((t) => t.id === textbookId);
    if (!tb) {
      return NextResponse.json({ success: false, error: "교재를 찾을 수 없습니다." }, { status: 404 });
    }

    const currentItems = await getTextbookItems();

    // 해당 소단원의 현재 최대 order_index 계산
    const minorItems = currentItems.filter((i) => i.textbook_id === textbookId && i.minor_unit_id === minorUnitId);
    let maxOrder = minorItems.reduce((max, i) => Math.max(max, i.order_index || 0), 0);

    const createdItems: TextbookItem[] = rawItems.map((raw: any) => {
      maxOrder += 1;
      return {
        id: `tbi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        textbook_id: textbookId,
        major_unit_id: majorUnitId,
        minor_unit_id: minorUnitId,
        grade: tb.grade || "중2",
        drive_id: raw.drive_id,
        name: raw.name,
        display_name: raw.display_name || null,
        folder_name: raw.folder_name || null,
        folder_path: raw.folder_path || null,
        folder_id: raw.folder_id || null,
        question_number: raw.question_number || null,
        question_image_drive_id: raw.question_image_drive_id || null,
        order_index: maxOrder,
        added_at: new Date().toISOString(),
      };
    });

    const updatedItems = [...currentItems, ...createdItems];
    await saveTextbookItems(updatedItems);

    return NextResponse.json({
      success: true,
      addedCount: createdItems.length,
      items: updatedItems,
      addedItems: createdItems,
    });
  } catch (error: any) {
    console.error("Textbook PUT error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
