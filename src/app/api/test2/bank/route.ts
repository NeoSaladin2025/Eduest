import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES_RECORD_DRIVE_ID = "test_bank_categories_data";
const ITEMS_RECORD_DRIVE_ID = "test_bank_items_data";

export interface TestCategory {
  id: string;
  name: string;
  grade: string;
  created_at: string;
}

export interface TestBankItem {
  id: string;
  category_id: string;
  grade: string;
  drive_id: string;
  name: string;
  folder_name?: string | null;
  folder_path?: string | null;
  question_number?: number | null;
  display_name?: string | null;
  question_image_drive_id?: string | null;
  added_at: string;
}

// 헬퍼: 카테고리 목록 로드
async function getCategories(): Promise<TestCategory[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", CATEGORIES_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.categories) ? parsed.categories : [];
  } catch {
    return [];
  }
}

// 헬퍼: 카테고리 목록 저장
async function saveCategories(categories: TestCategory[]) {
  const jsonString = JSON.stringify({
    categories,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: CATEGORIES_RECORD_DRIVE_ID,
      name: "test_bank_categories.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) throw new Error(`카테고리 저장 실패: ${error.message}`);
}

// 헬퍼: 아이템 목록 로드
async function getItems(): Promise<TestBankItem[]> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", ITEMS_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) return [];
  try {
    const parsed = JSON.parse(data.file_data);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

// 헬퍼: 아이템 목록 저장
async function saveItems(items: TestBankItem[]) {
  const jsonString = JSON.stringify({
    items,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: ITEMS_RECORD_DRIVE_ID,
      name: "test_bank_items.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) throw new Error(`시험자료 아이템 저장 실패: ${error.message}`);
}

// GET: 카테고리 및 등록된 시험자료 목록 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade"); // 'ALL' or '중3', etc.

    let categories = await getCategories();
    let items = await getItems();

    if (grade && grade !== "ALL") {
      categories = categories.filter((c) => c.grade === grade);
      items = items.filter((i) => i.grade === grade);
    }

    // 각 카테고리별 아이템 카운트 추가
    const categoryMap = categories.map((cat) => ({
      ...cat,
      itemCount: items.filter((item) => item.category_id === cat.id).length,
    }));

    return NextResponse.json({
      success: true,
      categories: categoryMap,
      items,
    });
  } catch (error: any) {
    console.error("Bank GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 카테고리 생성 / 수정 / 삭제
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const categories = await getCategories();
    const items = await getItems();

    // 1. 카테고리 생성
    if (action === "create_category") {
      const { name, grade } = body;
      if (!name || !name.trim()) {
        return NextResponse.json({ success: false, error: "카테고리 이름을 입력해주세요." }, { status: 400 });
      }

      const newCategory: TestCategory = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        grade: grade || "공통",
        created_at: new Date().toISOString(),
      };

      const updated = [...categories, newCategory];
      await saveCategories(updated);

      return NextResponse.json({ success: true, category: newCategory, categories: updated });
    }

    // 2. 카테고리 이름 수정
    if (action === "update_category") {
      const { categoryId, name } = body;
      if (!categoryId || !name || !name.trim()) {
        return NextResponse.json({ success: false, error: "카테고리 ID와 이름이 필요합니다." }, { status: 400 });
      }

      const idx = categories.findIndex((c) => c.id === categoryId);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
      }

      categories[idx].name = name.trim();
      await saveCategories(categories);

      return NextResponse.json({ success: true, category: categories[idx], categories });
    }

    // 3. 카테고리 삭제
    if (action === "delete_category") {
      const { categoryId } = body;
      if (!categoryId) {
        return NextResponse.json({ success: false, error: "categoryId가 필요합니다." }, { status: 400 });
      }

      const updatedCategories = categories.filter((c) => c.id !== categoryId);
      const updatedItems = items.filter((i) => i.category_id !== categoryId);

      await saveCategories(updatedCategories);
      await saveItems(updatedItems);

      return NextResponse.json({ success: true, message: "카테고리가 삭제되었습니다.", categories: updatedCategories });
    }

    // 4. 아이템 순서 재배치 저장 (reorder_items)
    if (action === "reorder_items") {
      const { categoryId, orderedItemIds } = body;
      if (!categoryId || !Array.isArray(orderedItemIds)) {
        return NextResponse.json({ success: false, error: "categoryId와 orderedItemIds가 필요합니다." }, { status: 400 });
      }

      const itemMap = new Map(items.map((i) => [i.id, i]));
      const otherCategoryItems = items.filter((i) => i.category_id !== categoryId);

      const reorderedThisCategory: TestBankItem[] = [];
      const seenIds = new Set<string>();

      orderedItemIds.forEach((id: string) => {
        const found = itemMap.get(id);
        if (found && found.category_id === categoryId) {
          reorderedThisCategory.push(found);
          seenIds.add(id);
        }
      });

      // 혹시 누락된 해당 카테고리 아이템이 있다면 뒤에 보존
      items.filter((i) => i.category_id === categoryId && !seenIds.has(i.id)).forEach((item) => {
        reorderedThisCategory.push(item);
      });

      const updatedItems = [...otherCategoryItems, ...reorderedThisCategory];
      await saveItems(updatedItems);

      return NextResponse.json({ success: true, message: "순서가 성공적으로 저장되었습니다.", items: updatedItems });
    }

    // 5. 복수 아이템 일괄 삭제 (delete_batch)
    if (action === "delete_batch") {
      const { itemIds } = body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return NextResponse.json({ success: false, error: "삭제할 itemIds가 필요합니다." }, { status: 400 });
      }

      const deleteSet = new Set(itemIds);
      const filtered = items.filter((i) => !deleteSet.has(i.id));
      await saveItems(filtered);

      return NextResponse.json({ success: true, message: `${itemIds.length}개 문제가 삭제되었습니다.`, items: filtered });
    }

    return NextResponse.json({ success: false, error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Bank POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: 원천 DB에서 선택한 문제들을 카테고리에 일괄 등록 (담기)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { categoryId, items: newItems } = body;

    if (!categoryId || !Array.isArray(newItems) || newItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "categoryId와 1개 이상의 items가 필요합니다." },
        { status: 400 }
      );
    }

    const categories = await getCategories();
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      return NextResponse.json({ success: false, error: "대상 카테고리를 찾을 수 없습니다." }, { status: 404 });
    }

    const currentItems = await getItems();
    const existingDriveIdsInCat = new Set(
      currentItems.filter((i) => i.category_id === categoryId).map((i) => i.drive_id)
    );

    const itemsToAdd: TestBankItem[] = [];

    newItems.forEach((item: any) => {
      // 해당 카테고리에 이미 없는 경우에만 추가
      if (!existingDriveIdsInCat.has(item.drive_id)) {
        itemsToAdd.push({
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category_id: categoryId,
          grade: item.grade || category.grade,
          drive_id: item.drive_id,
          name: item.name,
          folder_name: item.folder_name || null,
          folder_path: item.folder_path || null,
          question_number: typeof item.question_number === 'number' ? item.question_number : null,
          display_name: item.display_name || null,
          question_image_drive_id: item.question_image_drive_id || null,
          added_at: new Date().toISOString(),
        });
      }
    });

    const updatedItems = [...currentItems, ...itemsToAdd];
    await saveItems(updatedItems);

    return NextResponse.json({
      success: true,
      addedCount: itemsToAdd.length,
      message: `${itemsToAdd.length}개의 문제가 '${category.name}' 카테고리에 등록되었습니다.`,
      items: updatedItems,
    });
  } catch (error: any) {
    console.error("Bank PUT error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 등록된 시험자료 문항 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId가 필요합니다." }, { status: 400 });
    }

    const currentItems = await getItems();
    const filtered = currentItems.filter((i) => i.id !== itemId);
    await saveItems(filtered);

    return NextResponse.json({ success: true, message: "시험 문제가 카테고리에서 제거되었습니다." });
  } catch (error: any) {
    console.error("Bank DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
