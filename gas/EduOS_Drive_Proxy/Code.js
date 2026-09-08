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
  /** 고아 DELETE가 401/403이면 RLS·service_role 키 확인(GAS에만 보관). */
  SB_KEY: "sb_publishable_-nlZnEQGq5QXCou6H0MJlg_G8k3teT9",
  CLEANUP_STALE_ON_SYNC: true,
  /** Drive "Service error" 등 일시 오류 시 최대 재시도 횟수 */
  DRIVE_RETRY_MAX: 5,
  /** 첫 재시도 전 대기(ms), 이후 2배씩 증가(상한 8초) */
  DRIVE_RETRY_BASE_MS: 400,
  /** 폴더를 이 개수만큼 방문할 때마다 짧게 쉼. 0이면 끔 */
  SYNC_THROTTLE_EVERY: 25,
  SYNC_THROTTLE_MS: 200,
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
      SYNC_FOLDER_VISIT_ = 0;
      var rootFolder = driveRetry_("getFolderById exam root", function () {
        return DriveApp.getFolderById(CONFIG.EXAM_MASTER_FOLDER_ID);
      });
      var collectedItems = [];
      collectSyncItems(rootFolder, null, null, collectedItems);

      var BATCH_SIZE = 50;
      for (var i = 0; i < collectedItems.length; i += BATCH_SIZE) {
        var batchResult = batchUpsertToSupabase(collectedItems.slice(i, i + BATCH_SIZE));
        if (!batchResult.ok) {
          return createJsonResponse({
            success: false,
            error: "Supabase 오류 HTTP " + batchResult.status + ": " + batchResult.body,
          });
        }
      }

      var cleanupResult = { ok: true, deleted: 0, error: null };
      if (CONFIG.CLEANUP_STALE_ON_SYNC) {
        var foundIds = collectedItems.map(function (item) {
          return item.drive_id;
        });
        cleanupResult = cleanupStaleRecords(foundIds);
        if (!cleanupResult.ok) {
          return createJsonResponse({
            success: false,
            error:
              "동기화 업서트는 완료됐으나 고아 레코드 삭제 실패: " +
              (cleanupResult.error || "알 수 없음") +
              " (Supabase에서 exam_library DELETE/SELECT 권한·RLS·service_role 키를 확인하세요)",
          });
        }
      }

      return createJsonResponse({
        success: true,
        message: collectedItems.length + "개 항목 동기화 완료 (배치 업서트)",
        cleanupDeleted: cleanupResult.deleted,
      });
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

function collectSyncItems(folder, parentId, currentGrade, result) {
  SYNC_FOLDER_VISIT_++;
  syncThrottleMaybe_();

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

    collectSyncItems(f, folderId, nextGrade, result);
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

function fetchAllDriveIdsFromSupabase() {
  var baseUrl = CONFIG.SB_URL.replace(/\/$/, "");
  var pageSize = 1000;
  var all = [];
  var offset = 0;

  while (true) {
    var url =
      baseUrl +
      "/rest/v1/exam_library?select=drive_id&limit=" +
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

function cleanupStaleRecords(foundIds) {
  var existing = fetchAllDriveIdsFromSupabase();
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

  var CHUNK = 50;
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