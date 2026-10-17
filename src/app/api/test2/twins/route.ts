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

// GET: 쌍둥이 데이터 조회 및 구글 드라이브 정밀 스캔
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

    // 1. 해당 학년(grade)의 원천 라이브러리 폴더 목록 조회 (Supabase)
    const { data: dbFolders } = await supabase
      .from("exam_library")
      .select("drive_id, name, parent_id")
      .eq("type", "folder")
      .eq("grade", grade);

    const candidateFolders = dbFolders || [];
    const detected: DetectedTwinFolder[] = [];

    // 2. 각 회차/상위 폴더 하위에 [쌍둥이] 폴더가 있는지 병렬 정밀 검색 (10개씩 청크)
    const CHUNK_SIZE = 10;
    for (let i = 0; i < candidateFolders.length; i += CHUNK_SIZE) {
      const chunk = candidateFolders.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (folder) => {
          try {
            const twinFoldersRes = await drive.files.list({
              q: `'${folder.drive_id}' in parents and name contains '쌍둥이' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
              fields: "files(id, name, parents)",
              pageSize: 20,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            });

            const twinFolders = twinFoldersRes.data.files || [];
            for (const tf of twinFolders) {
              if (!tf.id) continue;

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
                // 각 회차 폴더 내 파일 개수 조회
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
              const existingFolderData = store.folders[folder.drive_id];
              const existingRounds = existingFolderData ? Object.keys(existingFolderData.rounds || {}) : [];
              const hasNew = detectedRounds.length === 0 || detectedRounds.some((r) => !existingRounds.includes(r.round_name));

              detected.push({
                parent_folder_id: folder.drive_id,
                parent_folder_name: folder.name,
                twin_root_folder_id: tf.id,
                grade,
                detected_rounds: detectedRounds,
                has_new: hasNew,
                synced_round_count: existingRounds.length,
              });
            }
          } catch (scanErr: any) {
            console.warn(`Scan failed for folder ${folder.name} (${folder.drive_id}):`, scanErr?.message);
          }
        })
      );
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

// POST: 특정 폴더 또는 선택 폴더의 쌍둥이 문제 고속 동기화
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

    // 1. 전체 폴더 목록 조회 (자식 폴더 재귀 확장용)
    const { data: allFolders } = await supabase
      .from("exam_library")
      .select("drive_id, name, parent_id, grade")
      .eq("type", "folder");

    const allFolderList = allFolders || [];
    let targetFolderMap = new Map<string, string>(); // folderId -> folderName

    if (Array.isArray(parentFolderIds) && parentFolderIds.length > 0) {
      // 사용자가 선택한 폴더 및 하위 모든 폴더(자식, 손자) 재귀 탐색
      const folderSet = new Set<string>(parentFolderIds);
      const queue = [...parentFolderIds];

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currObj = allFolderList.find((f) => f.drive_id === currId);
        targetFolderMap.set(currId, currObj?.name || "회차 폴더");

        const children = allFolderList.filter((f) => f.parent_id === currId);
        for (const ch of children) {
          if (!folderSet.has(ch.drive_id)) {
            folderSet.add(ch.drive_id);
            queue.push(ch.drive_id);
          }
        }
      }
    } else {
      // 지정된 대상이 없으면 현재 학년의 모든 폴더 검사
      const filtered = grade ? allFolderList.filter((f) => f.grade === grade) : allFolderList;
      for (const f of filtered) {
        targetFolderMap.set(f.drive_id, f.name);
      }
    }

    const targetIds = Array.from(targetFolderMap.keys());
    let syncedRoundsCount = 0;
    let syncedQuestionsCount = 0;

    // 2. 대상 폴더들 각각의 직속 [쌍둥이] 폴더 검색 (병렬 청크 처리)
    const CHUNK_SIZE = 10;
    for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
      const chunk = targetIds.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (pId) => {
          try {
            const twinFoldersRes = await drive.files.list({
              q: `'${pId}' in parents and name contains '쌍둥이' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
              fields: "files(id, name)",
              pageSize: 10,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            });

            const twinFolders = twinFoldersRes.data.files || [];
            if (twinFolders.length === 0) return;

            const parentName = targetFolderMap.get(pId) || "회차 폴더";

            for (const tf of twinFolders) {
              if (!tf.id) continue;

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
              const roundsMap: Record<string, TwinRoundData> = store.folders[pId]?.rounds || {};

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
                const htmlFiles = files
                  .filter((f: any) => f.name && f.name.toLowerCase().endsWith(".html"))
                  .sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                const pngFiles = files.filter(
                  (f: any) => f.name && (f.name.toLowerCase().endsWith(".png") || f.name.toLowerCase().endsWith(".jpg"))
                );

                const roundItems: TwinQuestionItem[] = [];

                // HTML 파일별로 문제 이미지 및 정답 추출 (10개씩 병렬 파싱)
                for (let hIdx = 0; hIdx < htmlFiles.length; hIdx += 10) {
                  const htmlChunk = htmlFiles.slice(hIdx, hIdx + 10);
                  const parsedResults = await Promise.all(
                    htmlChunk.map(async (hf: any) => {
                      if (!hf.id || !hf.name) return null;
                      const qNum = parseQuestionNum(hf.name);
                      if (qNum === null) return null;

                      // 동일 번호의 PNG 파일 찾기
                      const stem = hf.name.replace(/\.[^/.]+$/, "");
                      const matchedPng = pngFiles.find(
                        (p: any) => p.name && p.name.replace(/\.[^/.]+$/, "") === stem
                      );

                      const html = await fetchHtmlContent(hf.id);
                      let imageUrl = matchedPng?.id ? `https://lh3.googleusercontent.com/d/${matchedPng.id}` : "";
                      let rawAnswer = "";
                      let answer = "";
                      let questionHtml = "";

                      if (html) {
                        const extracted = extractQuestionData(html, {
                          drive_id: hf.id,
                          name: hf.name,
                          question_image_drive_id: matchedPng?.id || null,
                        });
                        if (extracted.imageUrl) imageUrl = extracted.imageUrl;
                        rawAnswer = extracted.rawAnswer;
                        answer = extracted.answer;
                        if ((extracted as any).questionHtml) {
                          questionHtml = (extracted as any).questionHtml;
                        }
                      }

                      return {
                        question_number: qNum,
                        name: hf.name,
                        drive_id: hf.id,
                        question_image_drive_id: matchedPng?.id || null,
                        image_url: imageUrl,
                        raw_answer: rawAnswer,
                        answer: answer,
                        solution_drive_id: hf.id,
                        question_html: questionHtml || undefined,
                      } as TwinQuestionItem;
                    })
                  );

                  for (const item of parsedResults) {
                    if (item) {
                      roundItems.push(item);
                      syncedQuestionsCount++;
                    }
                  }
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

              store.folders[pId] = {
                parent_folder_id: pId,
                parent_folder_name: parentName,
                twin_root_folder_id: tf.id,
                grade: grade || "고1",
                rounds: roundsMap,
                updated_at: new Date().toISOString(),
              };
            }
          } catch (syncFolderErr: any) {
            console.warn(`Sync error on folder ${pId}:`, syncFolderErr?.message);
          }
        })
      );
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
