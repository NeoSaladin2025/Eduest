import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/authUtils";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const EXAM_MASTER_FOLDER_ID = "1W1s2wPQnwXQI-i3Cwc8g1RfsajEGW-UC";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const CONCURRENCY = 6;

const EXCLUDED_IDS = new Set([
  "class_schedule_root_data",
  "student_menu_config_data",
  "test2_exam_papers_data",
  "test2_student_submissions_data",
  "test_bank_categories_data",
  "test_bank_items_data",
  "test_twin_problems_data",
  "textbook_builder_list_data",
  "textbook_builder_items_data",
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ScannedItem = {
  drive_id: string;
  parent_id: string | null;
  name: string;
  type: "folder" | "file";
  grade: string | null;
  question_image_drive_id: string | null;
};

type ExistingRow = ScannedItem;

let driveClientInstance: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (driveClientInstance) return driveClientInstance;
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) return null;
  try {
    const credentials = JSON.parse(keyString);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    driveClientInstance = google.drive({ version: "v3", auth });
    return driveClientInstance;
  } catch (err) {
    console.error("Google Drive auth init error:", err);
    return null;
  }
}

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session_token")?.value;
  return verifyAdminToken(token);
}

function isTransientDriveError(err: unknown): boolean {
  const errObj = err as { code?: number; response?: { status?: number }; message?: string } | null;
  const status = errObj?.code || errObj?.response?.status;
  if (status === 429 || (typeof status === "number" && status >= 500 && status < 600)) return true;
  const msg = String(errObj?.message || err || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("backend error") ||
    msg.includes("internal error") ||
    msg.includes("timeout") ||
    msg.includes("econnreset")
  );
}

async function withDriveRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDriveError(err) || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = 300 * Math.pow(2, attempt - 1);
      console.warn(`Drive retry [${label}] ${attempt}/${maxAttempts} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

function fileStemKey(fileName: string): string {
  const n = String(fileName || "");
  const idx = n.lastIndexOf(".");
  const stem = idx > 0 ? n.substring(0, idx) : n;
  return stem.toLowerCase();
}

function extractGradeFromName(name: string): string | null {
  const match = String(name || "").match(/([중고][123])/);
  return match ? match[1] : null;
}

async function resolveFolderContext(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  fallbackGrade?: string
) {
  const metaRes = await withDriveRetry("files.get targetFolder", () =>
    drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, trashed, parents",
      supportsAllDrives: true,
    })
  );

  const meta = metaRes.data;
  if (!meta?.id || meta.trashed) {
    throw new Error("구글 드라이브에서 해당 폴더를 찾을 수 없거나 휴지통에 있습니다.");
  }
  if (meta.mimeType !== FOLDER_MIME) {
    throw new Error("선택한 항목은 폴더가 아닙니다.");
  }
  if (meta.name && meta.name.includes("쌍둥이")) {
    throw new Error("'쌍둥이' 폴더는 미세 동기화 대상에서 제외됩니다.");
  }

  // DB에서 기존 레코드 및 부모 체인 조회해 grade와 parent_id 보전
  const { data: dbSelf } = await supabase
    .from("exam_library")
    .select("drive_id, parent_id, name, grade")
    .eq("drive_id", folderId)
    .maybeSingle();

  let resolvedGrade: string | null = extractGradeFromName(meta.name || "") || dbSelf?.grade || null;
  let cursorParentId: string | null = dbSelf?.parent_id ?? meta.parents?.[0] ?? null;

  if (cursorParentId === EXAM_MASTER_FOLDER_ID) {
    cursorParentId = null;
  }

  let depthGuard = 0;
  let walkId = cursorParentId;
  while (!resolvedGrade && walkId && depthGuard < 15) {
    depthGuard++;
    const { data: pRow } = await supabase
      .from("exam_library")
      .select("parent_id, name, grade")
      .eq("drive_id", walkId)
      .maybeSingle();
    if (!pRow) break;
    resolvedGrade = pRow.grade || extractGradeFromName(pRow.name || "");
    walkId = pRow.parent_id;
  }

  if (!resolvedGrade && fallbackGrade && fallbackGrade !== "ALL") {
    resolvedGrade = fallbackGrade;
  }

  return {
    driveId: meta.id,
    name: meta.name || "이름 없는 폴더",
    parentId: dbSelf ? dbSelf.parent_id : cursorParentId,
    grade: resolvedGrade,
  };
}

async function listDirectDriveChildren(drive: ReturnType<typeof google.drive>, folderId: string) {
  const files: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken: string | undefined;
  let calls = 0;

  do {
    const res = await withDriveRetry(`files.list ${folderId}`, () =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
    );
    calls++;
    for (const f of res.data.files || []) {
      if (f.id && f.name) {
        files.push({ id: f.id, name: f.name, mimeType: f.mimeType || "" });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return { files, calls };
}

/**
 * 선택한 폴더를 루트로 하여 몇 겹이든 끝층까지 BFS 병렬 스캔
 */
async function scanDriveSubtree(
  drive: ReturnType<typeof google.drive>,
  rootCtx: { driveId: string; name: string; parentId: string | null; grade: string | null }
) {
  const scannedItems: ScannedItem[] = [
    {
      drive_id: rootCtx.driveId,
      parent_id: rootCtx.parentId,
      name: rootCtx.name,
      type: "folder",
      grade: rootCtx.grade,
      question_image_drive_id: null,
    },
  ];

  const pathMap = new Map<string, string>();
  pathMap.set(rootCtx.driveId, rootCtx.name);

  const visited = new Set<string>([rootCtx.driveId]);
  const queue: Array<{ id: string; grade: string | null; path: string }> = [
    { id: rootCtx.driveId, grade: rootCtx.grade, path: rootCtx.name },
  ];

  let driveCallCount = 1; // resolveFolderContext files.get 포함
  let scannedFoldersCount = 1;
  let scannedFilesCount = 0;

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (node) => {
        const { files, calls } = await listDirectDriveChildren(drive, node.id);
        return { node, files, calls };
      })
    );

    for (const { node, files, calls } of results) {
      driveCallCount += calls;

      const subFolders: Array<{ id: string; name: string }> = [];
      const htmlFiles: Array<{ id: string; name: string }> = [];
      const stemToPngId: Record<string, string> = {};

      for (const item of files) {
        if (item.name.includes("쌍둥이")) continue;

        if (item.mimeType === FOLDER_MIME) {
          subFolders.push({ id: item.id, name: item.name });
        } else {
          const lower = item.name.toLowerCase();
          if (lower.endsWith(".png")) {
            stemToPngId[fileStemKey(item.name)] = item.id;
          } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
            htmlFiles.push({ id: item.id, name: item.name });
          }
        }
      }

      for (const sf of subFolders) {
        if (visited.has(sf.id)) continue;
        visited.add(sf.id);

        const nextGrade = extractGradeFromName(sf.name) || node.grade;
        const sfPath = `${node.path} > ${sf.name}`;
        pathMap.set(sf.id, sfPath);

        scannedItems.push({
          drive_id: sf.id,
          parent_id: node.id,
          name: sf.name,
          type: "folder",
          grade: nextGrade,
          question_image_drive_id: null,
        });
        scannedFoldersCount++;
        queue.push({ id: sf.id, grade: nextGrade, path: sfPath });
      }

      for (const hf of htmlFiles) {
        const stem = fileStemKey(hf.name);
        const qImgId = stem && stemToPngId[stem] ? stemToPngId[stem] : null;
        pathMap.set(hf.id, `${node.path} > ${hf.name}`);

        scannedItems.push({
          drive_id: hf.id,
          parent_id: node.id,
          name: hf.name,
          type: "file",
          grade: node.grade,
          question_image_drive_id: qImgId,
        });
        scannedFilesCount++;
      }
    }
  }

  return {
    scannedItems,
    pathMap,
    driveCallCount,
    scannedFoldersCount,
    scannedFilesCount,
  };
}

/**
 * Supabase에서 선택한 폴더와 그 기존 하위 서브트리만 정확히 조회 (다른 폴더 접근 X)
 */
async function fetchExistingDbSubtree(targetFolderId: string): Promise<ExistingRow[]> {
  const collected = new Map<string, ExistingRow>();

  const { data: selfRow, error: selfErr } = await supabase
    .from("exam_library")
    .select("drive_id, parent_id, name, type, grade, question_image_drive_id")
    .eq("drive_id", targetFolderId)
    .maybeSingle();

  if (selfErr) throw selfErr;
  if (selfRow && !EXCLUDED_IDS.has(selfRow.drive_id)) {
    collected.set(selfRow.drive_id, selfRow as ExistingRow);
  }

  let frontier = [targetFolderId];
  const visitedParents = new Set<string>();

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (let i = 0; i < frontier.length; i += 40) {
      const chunk = frontier.slice(i, i + 40).filter((id) => !visitedParents.has(id));
      if (chunk.length === 0) continue;
      chunk.forEach((id) => visitedParents.add(id));

      const { data: children, error } = await supabase
        .from("exam_library")
        .select("drive_id, parent_id, name, type, grade, question_image_drive_id")
        .in("parent_id", chunk);

      if (error) throw error;
      for (const row of (children || []) as ExistingRow[]) {
        if (EXCLUDED_IDS.has(row.drive_id)) continue;
        if (!collected.has(row.drive_id)) {
          collected.set(row.drive_id, row);
          if (row.type === "folder") {
            nextFrontier.push(row.drive_id);
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(collected.values());
}

function buildExistingPath(row: ExistingRow, existingMap: Map<string, ExistingRow>, rootId: string): string {
  const parts: string[] = [row.name];
  let curParent = row.parent_id;
  let guard = 0;
  while (curParent && guard < 20) {
    guard++;
    const p = existingMap.get(curParent);
    if (!p) break;
    parts.unshift(p.name);
    if (p.drive_id === rootId) break;
    curParent = p.parent_id;
  }
  return parts.join(" > ");
}

function computeSubtreeDiff(
  scannedItems: ScannedItem[],
  existingRows: ExistingRow[],
  targetFolderId: string,
  drivePathMap: Map<string, string>
) {
  const existingMap = new Map<string, ExistingRow>();
  for (const r of existingRows) existingMap.set(r.drive_id, r);

  const scannedMap = new Map<string, ScannedItem>();
  for (const s of scannedItems) scannedMap.set(s.drive_id, s);

  const toAdd: ScannedItem[] = [];
  const toUpdate: ScannedItem[] = [];
  let unchangedCount = 0;

  for (const item of scannedItems) {
    const prev = existingMap.get(item.drive_id);
    if (!prev) {
      toAdd.push(item);
      continue;
    }
    const isChanged =
      prev.name !== item.name ||
      (prev.parent_id ?? null) !== (item.parent_id ?? null) ||
      (prev.grade ?? null) !== (item.grade ?? null) ||
      (prev.question_image_drive_id ?? null) !== (item.question_image_drive_id ?? null);

    if (isChanged) {
      toUpdate.push(item);
    } else {
      unchangedCount++;
    }
  }

  const orphans = existingRows
    .filter((row) => row.drive_id !== targetFolderId && !scannedMap.has(row.drive_id))
    .map((row) => ({
      drive_id: row.drive_id,
      name: row.name,
      type: row.type,
      path: buildExistingPath(row, existingMap, targetFolderId),
    }));

  const addedFolders = toAdd
    .filter((i) => i.type === "folder")
    .map((i) => ({
      drive_id: i.drive_id,
      name: i.name,
      path: drivePathMap.get(i.drive_id) || i.name,
    }));

  const addedFiles = toAdd.filter((i) => i.type === "file");
  const updatedSample = toUpdate.slice(0, 15).map((i) => ({
    drive_id: i.drive_id,
    name: i.name,
    type: i.type,
    path: drivePathMap.get(i.drive_id) || i.name,
  }));

  return {
    toAdd,
    toUpdate,
    unchangedCount,
    orphans,
    addedFoldersCount: addedFolders.length,
    addedFilesCount: addedFiles.length,
    addedFoldersSample: addedFolders.slice(0, 20),
    addedFilesSample: addedFiles.slice(0, 20).map((f) => ({
      drive_id: f.drive_id,
      name: f.name,
      path: drivePathMap.get(f.drive_id) || f.name,
    })),
    updatedSample,
  };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const session = await checkAdminAuth();
    if (!session || !session.adminName) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json(
        { success: false, error: "Google Drive 서비스 계정(GOOGLE_SERVICE_ACCOUNT_KEY) 설정이 필요합니다." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { action, folderId, grade, orphanMode = "auto", deleteOrphanIds } = body;

    // ------------------------------------------------------------------
    // ACTION 1: DISCOVER_CHILDREN (아직 DB에 없는 드라이브 신규 하위 폴더 탐색)
    // ------------------------------------------------------------------
    if (action === "discover_children") {
      const targetId = folderId || EXAM_MASTER_FOLDER_ID;
      const { files } = await listDirectDriveChildren(drive, targetId);
      const driveSubFolders = files.filter(
        (f) => f.mimeType === FOLDER_MIME && !f.name.includes("쌍둥이")
      );

      const { data: existingChildren } = await supabase
        .from("exam_library")
        .select("drive_id")
        .eq("parent_id", targetId)
        .eq("type", "folder");

      const existingSet = new Set(
        ((existingChildren || []) as Array<{ drive_id: string }>).map((r) => r.drive_id)
      );
      const discovered = driveSubFolders.map((f) => ({
        drive_id: f.id,
        parent_id: targetId === EXAM_MASTER_FOLDER_ID ? null : targetId,
        name: f.name,
        isNewInDb: !existingSet.has(f.id),
      }));

      return NextResponse.json({
        success: true,
        parentId: targetId,
        folders: discovered,
        newCount: discovered.filter((d) => d.isNewInDb).length,
      });
    }

    if (!folderId || typeof folderId !== "string") {
      return NextResponse.json({ success: false, error: "대상 폴더 ID(folderId)가 필요합니다." }, { status: 400 });
    }

    const rootCtx = await resolveFolderContext(drive, folderId, grade);
    const scanResult = await scanDriveSubtree(drive, rootCtx);
    const existingRows = await fetchExistingDbSubtree(folderId);
    const diff = computeSubtreeDiff(
      scanResult.scannedItems,
      existingRows,
      folderId,
      scanResult.pathMap
    );

    // ------------------------------------------------------------------
    // ACTION 2: PREVIEW (Dry-Run 미리보기)
    // ------------------------------------------------------------------
    if (action === "preview") {
      return NextResponse.json({
        success: true,
        mode: "preview",
        folderId,
        folderName: rootCtx.name,
        resolvedGrade: rootCtx.grade,
        elapsedMs: Date.now() - startedAt,
        driveCallCount: scanResult.driveCallCount,
        scannedCount: scanResult.scannedItems.length,
        scannedFoldersCount: scanResult.scannedFoldersCount,
        scannedFilesCount: scanResult.scannedFilesCount,
        stats: {
          addTotal: diff.toAdd.length,
          addFolders: diff.addedFoldersCount,
          addFiles: diff.addedFilesCount,
          updateTotal: diff.toUpdate.length,
          unchangedTotal: diff.unchangedCount,
          orphanTotal: diff.orphans.length,
        },
        preview: {
          addedFolders: diff.addedFoldersSample,
          addedFiles: diff.addedFilesSample,
          updatedItems: diff.updatedSample,
          orphans: diff.orphans,
        },
      });
    }

    // ------------------------------------------------------------------
    // ACTION 3: EXECUTE (실제 부분 업서트 + 서브트리 한정 고아 정리)
    // ------------------------------------------------------------------
    if (action === "execute") {
      const nowIso = new Date().toISOString();
      const itemsToUpsert = [...diff.toAdd, ...diff.toUpdate];

      for (let i = 0; i < itemsToUpsert.length; i += 100) {
        const batch = itemsToUpsert.slice(i, i + 100).map((item) => ({
          drive_id: item.drive_id,
          parent_id: item.parent_id,
          name: item.name,
          type: item.type,
          grade: item.grade,
          question_image_drive_id: item.question_image_drive_id,
          updated_at: nowIso,
        }));

        const { error: upsertErr } = await supabase
          .from("exam_library")
          .upsert(batch, { onConflict: "drive_id" });

        if (upsertErr) {
          throw new Error(`Supabase 업서트 오류: ${upsertErr.message}`);
        }
      }

      // 고아 삭제는 반드시 현재 선택 폴더의 서브트리 내부로만 안전 제한
      const allowedOrphanSet = new Set(diff.orphans.map((o) => o.drive_id));
      let idsToDelete: string[] = [];

      if (orphanMode === "auto") {
        idsToDelete = Array.from(allowedOrphanSet);
      } else if (orphanMode === "manual" && Array.isArray(deleteOrphanIds)) {
        idsToDelete = deleteOrphanIds.filter(
          (id): id is string => typeof id === "string" && allowedOrphanSet.has(id) && !EXCLUDED_IDS.has(id)
        );
      }

      let deletedOrphansCount = 0;
      for (let i = 0; i < idsToDelete.length; i += 50) {
        const chunk = idsToDelete.slice(i, i + 50);
        const { error: delErr } = await supabase
          .from("exam_library")
          .delete()
          .in("drive_id", chunk);
        if (delErr) {
          throw new Error(`고아 레코드 삭제 오류: ${delErr.message}`);
        }
        deletedOrphansCount += chunk.length;
      }

      const skippedOrphansCount = Math.max(0, diff.orphans.length - deletedOrphansCount);

      return NextResponse.json({
        success: true,
        mode: "execute",
        folderId,
        folderName: rootCtx.name,
        resolvedGrade: rootCtx.grade,
        elapsedMs: Date.now() - startedAt,
        driveCallCount: scanResult.driveCallCount,
        scannedCount: scanResult.scannedItems.length,
        scannedFoldersCount: scanResult.scannedFoldersCount,
        scannedFilesCount: scanResult.scannedFilesCount,
        addedCount: diff.toAdd.length,
        addedFoldersCount: diff.addedFoldersCount,
        addedFilesCount: diff.addedFilesCount,
        updatedCount: diff.toUpdate.length,
        unchangedCount: diff.unchangedCount,
        deletedOrphansCount,
        skippedOrphansCount,
        message: `[${rootCtx.name}] 미세 동기화 완료 (추가 ${diff.toAdd.length} · 갱신 ${diff.toUpdate.length} · 삭제 ${deletedOrphansCount})`,
      });
    }

    return NextResponse.json({ success: false, error: `지원하지 않는 action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error("folder-sync API error:", err);
    const msg = err instanceof Error ? err.message : "폴더 미세 동기화 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
