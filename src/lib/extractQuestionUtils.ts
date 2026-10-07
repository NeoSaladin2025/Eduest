import { google } from "googleapis";

let driveClient: any = null;

export function getDriveClient() {
  if (driveClient) return driveClient;
  const credsKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsKey) return null;
  try {
    const credentials = JSON.parse(credsKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive"
      ],
    });
    driveClient = google.drive({ version: "v3", auth });
    return driveClient;
  } catch (e) {
    console.error("Google Auth init failed:", e);
    return null;
  }
}

const DEFAULT_GAS_LIBRARY_URL =
  process.env.GAS_LIBRARY_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec";

// 파일 내용(HTML) 로드 (Drive v3 우선, 실패 시 GAS fallback)
export async function fetchHtmlContent(fileId: string): Promise<string | null> {
  const drive = getDriveClient();
  if (drive) {
    try {
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "text" }
      );
      if (typeof res.data === "string") {
        return res.data;
      }
    } catch (err: any) {
      console.warn(`Drive get failed for ${fileId}, trying GAS fallback:`, err?.message);
    }
  }

  // GAS Fallback
  try {
    const gasRes = await fetch(DEFAULT_GAS_LIBRARY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_file_data",
        fileId,
        type: "html",
        apiKey: "eduest_super_secret_key_1234",
      }),
    });
    const json = await gasRes.json();
    if (json.success && json.data) {
      return json.data;
    }
  } catch (gasErr: any) {
    console.error(`GAS fetch failed for ${fileId}:`, gasErr);
  }

  return null;
}

// 원형 숫자 기호 변환
export function normalizeCircledNumber(str: string): string {
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str.replace(/[①②③④⑤❶❷❸❹❺]/g, (match) => circledMap[match] || match);
}

// HTML 분석하여 문제 이미지 URL 및 정답 추출
export function extractQuestionData(
  html: string,
  fallbackFile: { drive_id: string; name: string; question_image_drive_id?: string | null }
) {
  // 1. 문제 이미지 링크 추출
  let imageUrl = "";

  // 1-1. report-export-problem-src data-src
  const mDataSrc =
    html.match(/id=["']report-export-problem-src["'][^>]*data-src=["']([^"']+)["']/i) ||
    html.match(/data-src=["']([^"']+)["'][^>]*id=["']report-export-problem-src["']/i);
  if (mDataSrc && mDataSrc[1].trim()) {
    imageUrl = mDataSrc[1].trim();
  }

  // 1-2. report-original-problem-img src
  if (!imageUrl) {
    const mImg = html.match(/class=["'][^"']*report-original-problem-img[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (mImg && mImg[1].trim()) {
      imageUrl = mImg[1].trim();
    }
  }

  // 1-3. report-problem-modal-img src (이미 src가 채워진 경우)
  if (!imageUrl) {
    const mModalImg = html.match(/id=["']report-problem-modal-img["'][^>]*src=["']([^"']+)["']/i);
    if (mModalImg && mModalImg[1].trim() && !mModalImg[1].includes('data:image/gif')) {
      imageUrl = mModalImg[1].trim();
    }
  }

  // 1-4. question_image_drive_id 보조 fallback
  if (!imageUrl && fallbackFile.question_image_drive_id) {
    imageUrl = `https://lh3.googleusercontent.com/d/${fallbackFile.question_image_drive_id}`;
  }

  // 1-5. HTML 내 Drive ID 추출 시도 (예: Source: 0001.png 주변이나 주석)
  if (!imageUrl) {
    const driveMatch = html.match(/https?:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (driveMatch) {
      imageUrl = driveMatch[0];
    }
  }

  // 2. 정답 추출
  let rawAnswer = "";
  let cleanAnswer = "";

  // 2-1. final-answer-text 태그 검색
  const mAns = html.match(/class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
  if (mAns) {
    rawAnswer = mAns[1].replace(/<[^>]+>/g, '').trim();
  } else {
    // 2-2. 정답 표기 패턴 검색
    const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
    if (mAns2) {
      rawAnswer = mAns2[1].replace(/<[^>]+>/g, '').trim();
    }
  }

  if (rawAnswer) {
    // 객관식 번호(①~⑤ 또는 1~5) 추출 시도
    const normalized = normalizeCircledNumber(rawAnswer);
    const numMatch = normalized.match(/^([1-5])\b/);
    if (numMatch) {
      cleanAnswer = numMatch[1];
    } else {
      // 주관식 답안
      cleanAnswer = normalized.trim();
    }
  }

  return {
    imageUrl,
    rawAnswer: rawAnswer || "정답 정보 없음",
    answer: cleanAnswer || rawAnswer || "",
  };
}
