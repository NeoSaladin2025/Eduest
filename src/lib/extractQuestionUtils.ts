import { google } from "googleapis";
import {
  SubQuestionItem,
  ExtractedQuestionResult,
  normalizeCircledNumber,
  toCombiningOverline,
  normalizeOverlines,
  detectSubQuestions,
  detectQuestionType,
  isDescriptiveAnswer,
  parseQuestionFromHtmlClient,
} from "./clientQuestionParser";

export type { SubQuestionItem, ExtractedQuestionResult };
export {
  normalizeCircledNumber,
  toCombiningOverline,
  normalizeOverlines,
  detectSubQuestions,
  detectQuestionType,
  isDescriptiveAnswer,
};

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

// HTML 분석하여 문제 이미지 URL 및 정답 추출
export function extractQuestionData(
  html: string,
  fallbackFile: { drive_id: string; name: string; question_image_drive_id?: string | null }
) {
  return parseQuestionFromHtmlClient(html, fallbackFile);
}
