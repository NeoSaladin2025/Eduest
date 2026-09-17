/**
 * EduOS — 라이브러리 웹앱 (Next `/api/gas/library` 전용)
 *
 * 지원 action:
 * - sync_to_supabase: 시험 루트 폴더 스캔 → exam_library upsert + 고아 삭제
 * - get_student_records: 학생 폴더 list.json
 * - get_file_data: HTML 문자열 또는 PNG data URL (학생/복습 뷰어)
 *
 * 다른 화면(Edu OS 문제엔진 등)은 별도 GAS 배포 URL을 쓰는 경우가 많음.
 */

const CONFIG = {
  API_KEY: "eduest_super_secret_key_1234",
  EXAM_MASTER_FOLDER_ID: "1W1s2wPQnwXQI-i3Cwc8g1RfsajEGW-UC",
  SB_URL: "https://nqctewzhivglswlgwbvn.supabase.co",
  SB_KEY: "sb_publishable_-nlZnEQGq5QXCou6H0MJlg_G8k3teT9",
  CLEANUP_STALE_ON_SYNC: true,
  DRIVE_RETRY_MAX: 3,
  DRIVE_RETRY_BASE_MS: 300,
  /** 고아 레코드 삭제 시 URL 길이 2,048자 초과 방지를 위한 안전 청크 크기 */
  DELETE_CHUNK_SIZE: 20,
  /** Supabase 배치 업서트 청크 크기 */
  UPSERT_BATCH_SIZE: 100,
};

/** sync_to_supabase 시 폴더 방문 카운트(스로틀용) */
var SYNC_FOLDER_VISIT_ = 0;

function driveRetry_(label, fn) {
  var max = CONFIG.DRIVE_RETRY_MAX > 0 ? CONFIG.DRIVE_RETRY_MAX : 5;
  var base = CONFIG.DRIVE_RETRY_BASE_MS > 0 ? CONFIG.DRIVE_RETRY_BASE_MS : 400;
  var lastErr;
  for (var attempt = 1; attempt <= max; attempt++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      var msg = e.toString();
      if (!isDriveTransientError_(msg) || attempt === max) {
        throw e;
      }
      var wait = Math.min(base * Math.pow(2, attempt - 1), 8000);
      console.warn("Drive retry [" + label + "] " + attempt + "/" + max + " in " + wait + "ms: " + msg);
      Utilities.sleep(wait);
    }
  }
  throw lastErr;
}

function isDriveTransientError_(msg) {
  var m = String(msg || "").toLowerCase();
  return (
    m.indexOf("service error: drive") !== -1 ||
    m.indexOf("service_unavailable") !== -1 ||
    m.indexOf("internal error") !== -1 ||
    m.indexOf("backend error") !== -1 ||
    m.indexOf("rate limit") !== -1 ||
    m.indexOf("timeout") !== -1 ||
    m.indexOf("try again") !== -1
  );
}

function syncThrottleMaybe_() {
  var every = CONFIG.SYNC_THROTTLE_EVERY;
  if (!every || every <= 0) return;
  if (SYNC_FOLDER_VISIT_ % every !== 0) return;
  var ms = CONFIG.SYNC_THROTTLE_MS > 0 ? CONFIG.SYNC_THROTTLE_MS : 150;
  Utilities.sleep(ms);
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return createJsonResponse({ success: false, error: "JSON 파싱 에러" });
  }

  if (data.apiKey !== CONFIG.API_KEY) {
    return createJsonResponse({ success: false, error: "Unauthorized" });
  }

  var action = data.action;

  try {
    if (action === "sync_to_supabase") {
      var mode = data.mode || "full"; // 'full' | 'incremental'
      var targetGrade = data.grade || "ALL"; // 'ALL' | '고1' | '고2' ...

      // 1. 증분 동기화 모드 요청 시
      if (mode === "incremental") {
        try {
          var incResult = runIncrementalSync(targetGrade);
          if (incResult.success) {
            return createJsonResponse(incResult);
          }
          console.warn("증분 동기화 미적용 사유: " + incResult.reason + " -> 고속 정밀 스캔(Full)으로 자동 폴백합니다.");
        } catch (incErr) {
          console.warn("증분 동기화 중 오류 발생 -> 고속 정밀 스캔으로 폴백: " + incErr.toString());
        }
      }

      // 2. 기본/폴백: Drive API v2 고속 정밀 스캔 (방안 2)
      var fullResult = runFullSyncFast(targetGrade);
      return createJsonResponse(fullResult);
    }

    if (action === "get_student_records") {
      var folder2 = driveRetry_("getFolderById student", function () {
        return DriveApp.getFolderById(data.studentFolderId);
      });
      var files2 = folder2.getFilesByName("list.json");
      var records = files2.hasNext() ? JSON.parse(files2.next().getBlob().getDataAsString()) : [];
      return createJsonResponse({ success: true, records: records });
    }

    if (action === "get_file_data") {
      var file2 = driveRetry_("getFileById", function () {
        return DriveApp.getFileById(data.fileId);
      });
      var result = driveRetry_("read file blob", function () {
        return data.type === "html"
          ? file2.getBlob().getDataAsString()
          : "data:image/png;base64," + Utilities.base64Encode(file2.getBlob().getBytes());
      });
      return createJsonResponse({ success: true, data: result });
    }

    if (action === "create_root_folder_and_file") {
      var rootFolder = DriveApp.getRootFolder();
      var folderName = data.folderName || "[귀요미 루트폴더]";
      var existingFolders = rootFolder.getFoldersByName(folderName);
      var targetFolder = existingFolders.hasNext() ? existingFolders.next() : rootFolder.createFolder(folderName);

      var fileName = data.fileName || "귀요미가_선생님께_해드릴_수_있는_일들.txt";
      var content = data.content || "";

      var existingFiles = targetFolder.getFilesByName(fileName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }

      var file = targetFolder.createFile(fileName, content, MimeType.PLAIN_TEXT);

      return createJsonResponse({
        success: true,
        folderId: targetFolder.getId(),
        folderUrl: targetFolder.getUrl(),
        fileId: file.getId(),
        fileUrl: file.getUrl()
      });
    }

    return createJsonResponse({
      success: false,
      error: "지원하지 않는 action: " + String(action),
    });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function fileStemKey(fileName) {
  var n = String(fileName || "");
  var idx = n.lastIndexOf(".");
  var stem = idx > 0 ? n.substring(0, idx) : n;
  return stem.toLowerCase();
}

/**
 * [방안 2] Drive Advanced API(v2/v3)를 활용한 초고속 배치 정밀 스캔
 */
function runFullSyncFast(targetGrade) {
  var collectedItems = [];
  var isDriveAdvancedAvailable = typeof Drive !== "undefined" && Drive.Files && Drive.Files.list;

  if (isDriveAdvancedAvailable) {
    // 🚀 Drive Advanced Service 기반 고속 수집
    collectWithDriveApi(CONFIG.EXAM_MASTER_FOLDER_ID, null, null, targetGrade, collectedItems);
  } else {
    // Fallback: 기존 DriveApp 기반 수집
    console.warn("Drive Advanced Service가 없어 DriveApp으로 실행합니다.");
    var rootFolder = driveRetry_("getFolderById exam root", function () {
      return DriveApp.getFolderById(CONFIG.EXAM_MASTER_FOLDER_ID);
    });
    collectSyncItemsLegacy(rootFolder, null, null, targetGrade, collectedItems);
  }

  // 1. Supabase 배치 업서트
  var BATCH_SIZE = CONFIG.UPSERT_BATCH_SIZE || 100;
  for (var i = 0; i < collectedItems.length; i += BATCH_SIZE) {
    var batchResult = batchUpsertToSupabase(collectedItems.slice(i, i + BATCH_SIZE));
    if (!batchResult.ok) {
      return {
        success: false,
        error: "Supabase 오류 HTTP " + batchResult.status + ": " + batchResult.body,
      };
    }
  }

  // 2. 고아 레코드 안전 삭제 (URL 길이 제한 2,048자 회피: CHUNK = 20)
  var cleanupResult = { ok: true, deleted: 0, error: null };
  if (CONFIG.CLEANUP_STALE_ON_SYNC) {
    var foundIds = collectedItems.map(function (item) {
      return item.drive_id;
    });
    cleanupResult = cleanupStaleRecords(foundIds, targetGrade);
    if (!cleanupResult.ok) {
      return {
        success: false,
        error: "동기화 업서트는 완료됐으나 고아 레코드 삭제 실패: " + (cleanupResult.error || "알 수 없음"),
      };
    }
  }

  // 3. 다음 증분 동기화를 위한 최신 Change Token 저장
  saveLatestChangeToken();

  var gradeLabel = targetGrade && targetGrade !== "ALL" ? "[" + targetGrade + "] " : "[전체] ";
  return {
    success: true,
    mode: "full",
    grade: targetGrade,
    message: gradeLabel + collectedItems.length + "개 항목 고속 동기화 완료 (배치 업서트)",
    itemCount: collectedItems.length,
    cleanupDeleted: cleanupResult.deleted,
  };
}

/**
 * Drive Advanced API를 통한 폴더별 1회 일괄 조회 (폴더 + 파일 한 번에 획득)
 */
function collectWithDriveApi(folderId, parentId, currentGrade, targetGrade, result) {
  var pageToken = null;
  var subFolders = [];
  var htmlFiles = [];
  var stemToPngId = {};

  do {
    var query = "'" + folderId + "' in parents and trashed = false";
    var res = driveRetry_("Drive.Files.list", function () {
      return Drive.Files.list({
        q: query,
        maxResults: 1000,
        pageToken: pageToken,
        fields: "nextPageToken, items(id, title, mimeType)",
      });
    });

    var items = res.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var title = item.title || item.name || "";
      var mime = item.mimeType || "";

      if (mime === "application/vnd.google-apps.folder") {
        subFolders.push({ id: item.id, title: title });
      } else {
        var lower = title.toLowerCase();
        if (lower.endsWith(".png")) {
          stemToPngId[fileStemKey(title)] = item.id;
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          htmlFiles.push({ id: item.id, title: title });
        }
      }
    }
    pageToken = res.nextPageToken;
  } while (pageToken);

  // 1. 하위 폴더 순회 및 학년 필터링
  for (var fIdx = 0; fIdx < subFolders.length; fIdx++) {
    var sub = subFolders[fIdx];
    var folderName = sub.title;
    var nextGrade = currentGrade;
    var gradeMatch = folderName.match(/([중고][123])/);
    if (gradeMatch) {
      nextGrade = gradeMatch[1];
    }

    // 최상위에서 학년 필터 적용: targetGrade가 ALL이 아니고, 학년 폴더가 타겟과 다르면 스킵
    if (folderId === CONFIG.EXAM_MASTER_FOLDER_ID && targetGrade && targetGrade !== "ALL") {
      if (nextGrade && nextGrade !== targetGrade) {
        continue;
      }
    }

    result.push({
      drive_id: sub.id,
      parent_id: parentId,
      name: folderName,
      type: "folder",
      grade: nextGrade,
      question_image_drive_id: null,
    });

    collectWithDriveApi(sub.id, sub.id, nextGrade, targetGrade, result);
  }

  // 2. HTML 파일들을 PNG 매핑과 함께 등록
  for (var hIdx = 0; hIdx < htmlFiles.length; hIdx++) {
    var hf = htmlFiles[hIdx];
    var stemKey = fileStemKey(hf.title);
    var qImg = stemKey && stemToPngId[stemKey] ? stemToPngId[stemKey] : null;

    result.push({
      drive_id: hf.id,
      parent_id: parentId,
      name: hf.title,
      type: "file",
      grade: currentGrade,
      question_image_drive_id: qImg,
    });
  }
}

/**
 * 기존 DriveApp 기반 순회 (Drive API 비활성화 시 자동 대비책)
 */
function collectSyncItemsLegacy(folder, parentId, currentGrade, targetGrade, result) {
  var subFolders = driveRetry_("folder.getFolders", function () {
    return folder.getFolders();
  });

  while (
    driveRetry_("subFolders.hasNext", function () {
      return subFolders.hasNext();
    })
  ) {
    var f = driveRetry_("subFolders.next", function () {
      return subFolders.next();
    });
    var folderName = driveRetry_("folder getName", function () {
      return f.getName();
    });

    var nextGrade = currentGrade;
    var gradeMatch = folderName.match(/([중고][123])/);
    if (gradeMatch) {
      nextGrade = gradeMatch[1];
    }

    if (parentId === null && targetGrade && targetGrade !== "ALL") {
      if (nextGrade && nextGrade !== targetGrade) {
        continue;
      }
    }

    var folderId = driveRetry_("folder getId", function () {
      return f.getId();
    });
    result.push({
      drive_id: folderId,
      parent_id: parentId,
      name: folderName,
      type: "folder",
      grade: nextGrade,
      question_image_drive_id: null,
    });

    collectSyncItemsLegacy(f, folderId, nextGrade, targetGrade, result);
  }

  var stemToPngId = {};
  var htmlFiles = [];
  var filesIt = driveRetry_("folder.getFiles", function () {
    return folder.getFiles();
  });

  while (
    driveRetry_("filesIt.hasNext", function () {
      return filesIt.hasNext();
    })
  ) {
    var file = driveRetry_("filesIt.next", function () {
      return filesIt.next();
    });
    var name;
    var lower;
    try {
      name = driveRetry_("file.getName", function () {
        return file.getName();
      });
      lower = name.toLowerCase();
    } catch (e) {
      continue;
    }

    if (lower.endsWith(".png")) {
      stemToPngId[fileStemKey(name)] = driveRetry_("png getId", function () {
        return file.getId();
      });
      continue;
    }

    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      htmlFiles.push(file);
    }
  }

  for (var hi = 0; hi < htmlFiles.length; hi++) {
    var hf = htmlFiles[hi];
    try {
      var hname = driveRetry_("html getName", function () {
        return hf.getName();
      });
      var stemKey = fileStemKey(hname);
      var qImg = stemKey && stemToPngId[stemKey] ? stemToPngId[stemKey] : null;
      result.push({
        drive_id: driveRetry_("html getId", function () {
          return hf.getId();
        }),
        parent_id: parentId,
        name: hname,
        type: "file",
        grade: currentGrade,
        question_image_drive_id: qImg,
      });
    } catch (e) {}
  }
}

/**
 * [방안 3] Changes API 기반 증분 동기화 (마지막 동기화 이후 변경분만 감지)
 */
function runIncrementalSync(targetGrade) {
  if (typeof Drive === "undefined" || !Drive.Changes) {
    return { success: false, reason: "Drive Advanced Service가 지원되지 않음" };
  }

  var props = PropertiesService.getScriptProperties();
  var savedToken = props.getProperty("LAST_CHANGE_TOKEN");
  if (!savedToken) {
    return { success: false, reason: "저장된 Change Token이 없음 (첫 실행 필요)" };
  }

  var changedFiles = [];
  var pageToken = savedToken;
  var newStartToken = null;

  try {
    do {
      var res = driveRetry_("Drive.Changes.list", function () {
        return Drive.Changes.list({
          startChangeId: pageToken,
          maxResults: 1000,
          includeDeleted: true,
        });
      });

      var items = res.items || [];
      for (var i = 0; i < items.length; i++) {
        changedFiles.push(items[i]);
      }
      pageToken = res.nextPageToken;
      if (res.largestChangeId) {
        newStartToken = String(Number(res.largestChangeId) + 1);
      }
    } while (pageToken);
  } catch (err) {
    return { success: false, reason: "Changes API 오류 (" + err.toString() + ")" };
  }

  if (changedFiles.length === 0) {
    return {
      success: true,
      mode: "incremental",
      grade: targetGrade,
      message: (targetGrade !== "ALL" ? "[" + targetGrade + "] " : "") + "최근 변경된 파일이 없습니다 (최신 상태 유지됨)",
      itemCount: 0,
      cleanupDeleted: 0,
    };
  }

  // 변경된 파일들을 바탕으로 정밀 스캔 실행 후 토큰 갱신
  if (newStartToken) {
    props.setProperty("LAST_CHANGE_TOKEN", newStartToken);
  }

  var fullResult = runFullSyncFast(targetGrade);
  if (fullResult.success) {
    fullResult.mode = "incremental";
    fullResult.message = (targetGrade !== "ALL" ? "[" + targetGrade + "] " : "") + "증분 감지(" + changedFiles.length + "건 변경) 반영 완료";
  }
  return fullResult;
}

function saveLatestChangeToken() {
  try {
    if (typeof Drive !== "undefined" && Drive.Changes) {
      var res = Drive.Changes.list({ maxResults: 1 });
      if (res.largestChangeId) {
        var nextId = String(Number(res.largestChangeId) + 1);
        PropertiesService.getScriptProperties().setProperty("LAST_CHANGE_TOKEN", nextId);
      }
    }
  } catch (e) {
    console.warn("Change Token 저장 실패(무시가능): " + e.toString());
  }
}

function batchUpsertToSupabase(payloads) {
  if (payloads.length === 0) return { ok: true };

  var baseUrl = CONFIG.SB_URL.replace(/\/$/, "");
  var fullUrl = baseUrl + "/rest/v1/exam_library?on_conflict=drive_id";

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: CONFIG.SB_KEY,
      Authorization: "Bearer " + CONFIG.SB_KEY,
      Prefer: "resolution=merge-duplicates",
    },
    payload: JSON.stringify(payloads),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(fullUrl, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code >= 400) {
    console.error("BATCH UPSERT ERROR HTTP " + code + ": " + text);
    return { ok: false, status: code, body: text };
  }
  return { ok: true, status: code, body: text };
}

function fetchAllDriveIdsFromSupabase(targetGrade) {
  var baseUrl = CONFIG.SB_URL.replace(/\/$/, "");
  var pageSize = 1000;
  var all = [];
  var offset = 0;

  var gradeQuery = targetGrade && targetGrade !== "ALL" ? "&grade=eq." + encodeURIComponent(targetGrade) : "";

  while (true) {
    var url =
      baseUrl +
      "/rest/v1/exam_library?select=drive_id" +
      gradeQuery +
      "&limit=" +
      pageSize +
      "&offset=" +
      offset;
    var getResponse = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        apikey: CONFIG.SB_KEY,
        Authorization: "Bearer " + CONFIG.SB_KEY,
      },
      muteHttpExceptions: true,
    });

    if (getResponse.getResponseCode() >= 400) {
      console.error("LIST exam_library ERROR: " + getResponse.getContentText());
      break;
    }

    var chunk = JSON.parse(getResponse.getContentText());
    if (!Array.isArray(chunk) || chunk.length === 0) break;

    for (var i = 0; i < chunk.length; i++) {
      all.push(chunk[i].drive_id);
    }

    if (chunk.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/**
 * 고아 레코드 삭제 함수:
 * - URLFetch 길이 제한(2,048자)을 초과하지 않도록 CHUNK = 20으로 축소하여 분할 삭제
 */
function cleanupStaleRecords(foundIds, targetGrade) {
  var existing = fetchAllDriveIdsFromSupabase(targetGrade);
  if (existing.length === 0) {
    return { ok: true, deleted: 0 };
  }

  var foundSet = {};
  for (var j = 0; j < foundIds.length; j++) {
    foundSet[foundIds[j]] = true;
  }

  var toDelete = [];
  for (var k = 0; k < existing.length; k++) {
    if (!foundSet[existing[k]]) toDelete.push(existing[k]);
  }

  if (toDelete.length === 0) {
    return { ok: true, deleted: 0 };
  }

  // ⚠️ 핵심: 50 -> 20으로 축소하여 2,048자 URLFetch 길이 제한 완벽 회피!
  var CHUNK = CONFIG.DELETE_CHUNK_SIZE || 20;
  var baseUrl = CONFIG.SB_URL.replace(/\/$/, "");
  for (var i = 0; i < toDelete.length; i += CHUNK) {
    var chunk = toDelete.slice(i, i + CHUNK);
    var quoted = chunk.map(function (id) {
      return '"' + String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    });
    var inFilter = "in.(" + quoted.join(",") + ")";
    var deleteUrl = baseUrl + "/rest/v1/exam_library?drive_id=" + encodeURIComponent(inFilter);
    var delResponse = UrlFetchApp.fetch(deleteUrl, {
      method: "delete",
      headers: {
        apikey: CONFIG.SB_KEY,
        Authorization: "Bearer " + CONFIG.SB_KEY,
      },
      muteHttpExceptions: true,
    });
    var delCode = delResponse.getResponseCode();
    if (delCode >= 400) {
      var body = delResponse.getContentText();
      console.error("DELETE exam_library chunk ERROR HTTP " + delCode + ": " + body);
      return { ok: false, deleted: 0, error: "HTTP " + delCode + ": " + body };
    }
  }

  console.log("고아 레코드 " + toDelete.length + "개 삭제 완료");
  return { ok: true, deleted: toDelete.length };
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}