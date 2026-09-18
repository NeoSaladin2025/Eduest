import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

// 1. Google Drive 인증 초기화
let driveClient: any = null;
function getDriveClient() {
  if (driveClient) return driveClient;
  const credsKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsKey) return null;
  try {
    const credentials = JSON.parse(credsKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive"],
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

// 메모리 인-메모리 캐시 (서버 인스턴스 웜업 유지용)
const memoryCache = new Map<string, string>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  const type = searchParams.get("type") || "html"; // 'html' | 'image'

  if (!fileId) {
    return NextResponse.json({ success: false, error: "fileId is required" }, { status: 400 });
  }

  const cacheKey = `${fileId}_${type}`;
  if (memoryCache.has(cacheKey)) {
    return NextResponse.json(
      { success: true, data: memoryCache.get(cacheKey), from: "memory-cache" },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
        },
      }
    );
  }

  // 🚀 1순위: Google Drive API v3 직접 스트리밍 (초고속 ~200ms)
  const drive = getDriveClient();
  if (drive) {
    try {
      if (type === "html") {
        const res = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "text" }
        );
        let content = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        if (content) {
          content = content.replace(/[₩¥]/g, "\\");
          memoryCache.set(cacheKey, content);
          return NextResponse.json(
            { success: true, data: content, from: "drive-v3" },
            {
              headers: {
                "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
              },
            }
          );
        }
      } else {
        // image
        const res = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" }
        );
        const buffer = Buffer.from(res.data);
        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        memoryCache.set(cacheKey, dataUrl);
        return NextResponse.json(
          { success: true, data: dataUrl, from: "drive-v3" },
          {
            headers: {
              "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
            },
          }
        );
      }
    } catch (driveErr: any) {
      console.warn("Direct Google Drive v3 fetch failed, falling back to GAS:", driveErr?.message || driveErr);
      // fallback to GAS
    }
  }

  // 🛡️ 2순위 폴백: 기존 GAS WebApp 호출 (Drive 권한 없거나 실패 시 자동 백업)
  try {
    const gasRes = await fetch(DEFAULT_GAS_LIBRARY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_file_data",
        fileId,
        type,
        apiKey: "eduest_super_secret_key_1234",
      }),
      redirect: "follow",
    });
    const result = await gasRes.json();
    if (result.success && result.data) {
      let d = result.data;
      if (type === "html") d = d.replace(/[₩¥]/g, "\\");
      memoryCache.set(cacheKey, d);
      return NextResponse.json(
        { success: true, data: d, from: "gas-fallback" },
        {
          headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
          },
        }
      );
    }
    return NextResponse.json(result, { status: gasRes.ok ? 200 : gasRes.status });
  } catch (gasErr: any) {
    console.error("GAS Fallback error:", gasErr);
    return NextResponse.json(
      { success: false, error: gasErr?.message || "Failed to load file" },
      { status: 500 }
    );
  }
}
