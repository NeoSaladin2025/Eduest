import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractQuestionData } from "@/lib/extractQuestionUtils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let driveClient: any = null;
function getDriveClient() {
  if (driveClient) return driveClient;
  const credsKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsKey) return null;
  try {
    const credentials = JSON.parse(credsKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
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

// 파일 내용(HTML) 로드
async function fetchHtmlContent(fileId: string): Promise<{ html: string | null; fetchSource: 'drive_api' | 'gas_fallback' | 'failed' }> {
  const drive = getDriveClient();
  if (drive) {
    try {
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "text" }
      );
      if (typeof res.data === "string") {
        return { html: res.data, fetchSource: 'drive_api' };
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
      return { html: json.data, fetchSource: 'gas_fallback' };
    }
  } catch (gasErr: any) {
    console.error(`GAS fetch failed for ${fileId}:`, gasErr);
  }

  return { html: null, fetchSource: 'failed' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { files } = body; // Array of { drive_id: string, name: string, question_image_drive_id?: string }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ success: false, error: "files 배열이 필요합니다." }, { status: 400 });
    }

    // 파일별 병렬 추출 (최대 5개씩 청크)
    const results = [];
    const CHUNK_SIZE = 5;

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (file: any, index: number) => {
          try {
            const { html, fetchSource } = await fetchHtmlContent(file.drive_id);
            if (!html) {
              return {
                id: `q_${file.drive_id}`,
                drive_id: file.drive_id,
                name: file.name,
                image_url: file.question_image_drive_id ? `https://lh3.googleusercontent.com/d/${file.question_image_drive_id}` : "",
                raw_answer: "",
                answer: "",
                is_descriptive: false,
                solution_drive_id: file.drive_id,
                status: "html_fetch_failed",
                debug_info: {
                  matched_rule: "HTML 불러오기 실패",
                  image_source: "없음",
                  raw_html_snippet: "HTML 본문을 가져오지 못했습니다.",
                  fetch_source: fetchSource,
                },
              };
            }

            const { imageUrl, imageSource, rawAnswer, answer, is_descriptive, question_type, sub_questions, matchedRule, rawHtmlSnippet } = extractQuestionData(html, file);

            // 이미지 URL이 없는데 동일 폴더에 png가 있는지 DB 조회 시도
            let finalImageUrl = imageUrl;
            let finalImageSource = imageSource;
            if (!finalImageUrl) {
              const stem = file.name.replace(/\.[^/.]+$/, "");
              const { data: pngRecord } = await supabase
                .from("exam_library")
                .select("drive_id")
                .eq("type", "file")
                .ilike("name", `${stem}.png`)
                .limit(1)
                .maybeSingle();

              if (pngRecord?.drive_id) {
                finalImageUrl = `https://lh3.googleusercontent.com/d/${pngRecord.drive_id}`;
                finalImageSource = "DB에서 일치하는 PNG 파일 조회 성공";
              }
            }

            return {
              id: `q_${file.drive_id}`,
              drive_id: file.drive_id,
              name: file.name,
              folder_name: file.folder_name || null,
              question_number: typeof file.question_number === 'number' ? file.question_number : null,
              display_name: file.display_name || null,
              image_url: finalImageUrl,
              raw_answer: rawAnswer,
              answer: answer,
              is_descriptive: !!is_descriptive,
              question_type: question_type,
              sub_questions: sub_questions,
              solution_drive_id: file.drive_id,
              status: "success",
              debug_info: {
                matched_rule: matchedRule,
                image_source: finalImageSource,
                raw_html_snippet: rawHtmlSnippet,
                fetch_source: fetchSource,
              },
            };
          } catch (e: any) {
            console.error(`Error processing question ${file.name}:`, e);
            return {
              id: `q_${file.drive_id}`,
              drive_id: file.drive_id,
              name: file.name,
              folder_name: file.folder_name || null,
              question_number: typeof file.question_number === 'number' ? file.question_number : null,
              display_name: file.display_name || null,
              image_url: "",
              raw_answer: "",
              answer: "",
              is_descriptive: false,
              solution_drive_id: file.drive_id,
              status: "error",
              debug_info: {
                matched_rule: "에러 발생",
                image_source: "없음",
                raw_html_snippet: `오류: ${e?.message || '알 수 없는 오류'}`,
                fetch_source: "failed",
              },
            };
          }
        })
      );
      results.push(...chunkResults);
    }

    return NextResponse.json({ success: true, questions: results });
  } catch (error: any) {
    console.error("Extract questions error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
