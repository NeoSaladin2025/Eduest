import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDriveClient, fetchHtmlContent, extractQuestionData } from "@/lib/extractQuestionUtils";
import { TwinStoreData, FolderTwinData, TwinRoundData, TwinQuestionItem, DetectedTwinFolder } from "@/lib/twinTypes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TWIN_RECORD_DRIVE_ID = "test_twin_problems_data";

// 파일명에서 문항 번호 파싱 (예: 0001.html -> 1)
function parseQuestionNum(fileName: string): number | null {
  const clean = fileName.replace(/\.[^/.]+$/, "");
  const match = clean.match(/(\d+)(?!.*\d)/);
  if (match) {
    const n = parseInt(match[1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

// 회차명에서 숫자 추출 (예: "1차" -> 1, "2회" -> 2)
function parseRoundNum(roundName: string): number {
  const match = roundName.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

// 헬퍼: DB에서 저장된 쌍둥이 데이터 불러오기
async function getTwinStore(): Promise<TwinStoreData> {
  const { data } = await supabase
    .from("exam_library")
    .select("file_data")
    .eq("drive_id", TWIN_RECORD_DRIVE_ID)
    .maybeSingle();

  if (!data?.file_data) {
    return { folders: {}, updated_at: new Date().toISOString() };
  }

  try {
    const parsed = JSON.parse(data.file_data);
    return {
      folders: parsed.folders || {},
      updated_at: parsed.updated_at || new Date().toISOString(),
    };
  } catch {
    return { folders: {}, updated_at: new Date().toISOString() };
  }
}

// 헬퍼: DB에 쌍둥이 데이터 영구 저장
async function saveTwinStore(store: TwinStoreData) {
  store.updated_at = new Date().toISOString();
  const jsonString = JSON.stringify(store);

  const { error } = await supabase.from("exam_library").upsert(
    {
      drive_id: TWIN_RECORD_DRIVE_ID,
      name: "test_twin_problems.json",
      type: "file",
      grade: "공통",
      file_data: jsonString,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "drive_id" }
  );

  if (error) throw new Error(`쌍둥이 데이터 저장 실패: ${error.message}`);
}

// GET: 쌍둥이 데이터 조회 및 (옵션) 구글 드라이브 스캔
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "고1";
    const doScan = searchParams.get("scan") === "true";

    const store = await getTwinStore();

    if (!doScan) {
      return NextResponse.json({
        success: true,
        store,
      });
    }

    // 구글 드라이브 스캔 실행
    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({
        success: false,
        error: "Google Drive 인증 클라이언트를 생성할 수 없습니다.",
      }, { status: 500 });
    }

    // 1. 드라이브에서 이름에 '쌍둥이'가 포함된 폴더들 검색
    const twinFoldersRes = await drive.files.list({
      q: "name contains '쌍둥이' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name, parents)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const twinFolders = twinFoldersRes.data.files || [];
    const detected: DetectedTwinFolder[] = [];

    // 2. 각 [쌍둥이] 폴더의 부모(원본 회차 폴더) 정보 조회
    for (const tf of twinFolders) {
      if (!tf.id || !tf.parents || tf.parents.length === 0) continue;
      const parentFolderId = tf.parents[0];

      // 부모 폴더 이름 조회
      let parentName = "회차 폴더";
      try {
        const parentRes = await drive.files.get({
          fileId: parentFolderId,
          fields: "id, name",
          supportsAllDrives: true,
        });
        if (parentRes.data.name) {
          parentName = parentRes.data.name;
        }
      } catch (e) {
        console.warn(`Parent folder get failed for ${parentFolderId}:`, e);
      }

      // [쌍둥이] 하위의 회차 폴더들(1차, 2차, 3차...) 조회
      const subRoundsRes = await drive.files.list({
        q: `'${tf.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
        orderBy: "name",
        pageSize: 50,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const subRounds = subRoundsRes.data.files || [];
      const detectedRounds: Array<{ round_name: string; folder_id: string; file_count: number }> = [];

      for (const sr of subRounds) {
        if (!sr.id || !sr.name) continue;
        // 각 회차 폴더 내 파일 개수
        const filesRes = await drive.files.list({
          q: `'${sr.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: "files(id)",
          pageSize: 100,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const count = filesRes.data.files?.length || 0;
        detectedRounds.push({
          round_name: sr.name,
          folder_id: sr.id,
          file_count: count,
        });
      }

      // 기존 동기화 상태와 비교하여 신규 유무 판별
      const existingFolderData = store.folders[parentFolderId];
      const existingRounds = existingFolderData ? Object.keys(existingFolderData.rounds || {}) : [];
      const hasNew = detectedRounds.some((r: any) => !existingRounds.includes(r.round_name));

      detected.push({
        parent_folder_id: parentFolderId,
        parent_folder_name: parentName,
        twin_root_folder_id: tf.id,
        grade,
        detected_rounds: detectedRounds,
        has_new: hasNew,
        synced_round_count: existingRounds.length,
      });
    }

    return NextResponse.json({
      success: true,
      store,
      detected,
    });
  } catch (error: any) {
    console.error("Twin API GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 특정 폴더 또는 전체 감지된 폴더의 쌍둥이 문제 고속 동기화
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, parentFolderIds, grade } = body;

    if (action !== "sync_twins") {
      return NextResponse.json({ success: false, error: "유효하지 않은 action입니다." }, { status: 400 });
    }

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({ success: false, error: "Google Drive 인증 실패" }, { status: 500 });
    }

    const store = await getTwinStore();

    // 1. 드라이브에서 '쌍둥이' 폴더 검색
    const twinFoldersRes = await drive.files.list({
      q: "name contains '쌍둥이' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name, parents)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const twinFolders = twinFoldersRes.data.files || [];
    let syncedRoundsCount = 0;
    let syncedQuestionsCount = 0;

    for (const tf of twinFolders) {
      if (!tf.id || !tf.parents || tf.parents.length === 0) continue;
      const parentFolderId = tf.parents[0];

      // 필터링: parentFolderIds가 지정되어 있으면 그 대상만 진행
      if (Array.isArray(parentFolderIds) && parentFolderIds.length > 0) {
        if (!parentFolderIds.includes(parentFolderId)) continue;
      }

      // 부모 폴더 이름 조회
      let parentName = "회차 폴더";
      try {
        const parentRes = await drive.files.get({
          fileId: parentFolderId,
          fields: "id, name",
          supportsAllDrives: true,
        });
        if (parentRes.data.name) parentName = parentRes.data.name;
      } catch (e) {}

      // [쌍둥이] 하위의 회차 폴더들(1차, 2차, 3차...) 조회
      const subRoundsRes = await drive.files.list({
        q: `'${tf.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
        orderBy: "name",
        pageSize: 50,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const subRounds = subRoundsRes.data.files || [];
      const roundsMap: Record<string, TwinRoundData> = store.folders[parentFolderId]?.rounds || {};

      for (const sr of subRounds) {
        if (!sr.id || !sr.name) continue;

        // 회차 폴더 내 파일들(html, png) 조회
        const filesRes = await drive.files.list({
          q: `'${sr.id}' in parents and trashed = false`,
          fields: "files(id, name, mimeType)",
          pageSize: 200,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = filesRes.data.files || [];
        const htmlFiles = files.filter((f: any) => f.name && f.name.toLowerCase().endsWith(".html"));
        const pngFiles = files.filter((f: any) => f.name && (f.name.toLowerCase().endsWith(".png") || f.name.toLowerCase().endsWith(".jpg")));

        const roundItems: TwinQuestionItem[] = [];

        // HTML 파일별로 문제 이미지 및 정답 추출
        for (const hf of htmlFiles) {
          if (!hf.id || !hf.name) continue;
          const qNum = parseQuestionNum(hf.name);
          if (qNum === null) continue;

          // 동일 번호의 PNG 파일 찾기
          const stem = hf.name.replace(/\.[^/.]+$/, "");
          const matchedPng = pngFiles.find((p: any) => p.name && p.name.replace(/\.[^/.]+$/, "") === stem);

          const html = await fetchHtmlContent(hf.id);
          let imageUrl = matchedPng?.id ? `https://lh3.googleusercontent.com/d/${matchedPng.id}` : "";
          let rawAnswer = "";
          let answer = "";

          if (html) {
            const extracted = extractQuestionData(html, {
              drive_id: hf.id,
              name: hf.name,
              question_image_drive_id: matchedPng?.id || null,
            });
            if (extracted.imageUrl) imageUrl = extracted.imageUrl;
            rawAnswer = extracted.rawAnswer;
            answer = extracted.answer;
          }

          roundItems.push({
            question_number: qNum,
            name: hf.name,
            drive_id: hf.id,
            question_image_drive_id: matchedPng?.id || null,
            image_url: imageUrl,
            raw_answer: rawAnswer,
            answer: answer,
            solution_drive_id: hf.id,
          });
          syncedQuestionsCount++;
        }

        // 번호 오름차순 정렬
        roundItems.sort((a, b) => a.question_number - b.question_number);

        roundsMap[sr.name] = {
          round_name: sr.name,
          round_number: parseRoundNum(sr.name),
          folder_id: sr.id,
          items: roundItems,
        };
        syncedRoundsCount++;
      }

      store.folders[parentFolderId] = {
        parent_folder_id: parentFolderId,
        parent_folder_name: parentName,
        twin_root_folder_id: tf.id,
        grade: grade || "고1",
        rounds: roundsMap,
        updated_at: new Date().toISOString(),
      };
    }

    // DB 영구 저장
    await saveTwinStore(store);

    return NextResponse.json({
      success: true,
      message: `${syncedRoundsCount}개 쌍둥이 회차 (${syncedQuestionsCount}문항) 동기화 완료!`,
      store,
    });
  } catch (error: any) {
    console.error("Twin API POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
