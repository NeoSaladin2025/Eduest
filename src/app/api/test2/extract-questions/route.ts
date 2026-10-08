import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detectSubQuestions, detectQuestionType } from "@/lib/extractQuestionUtils";

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

// 원형 숫자 기호 변환
function normalizeCircledNumber(str: string): string {
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str.replace(/[①②③④⑤❶❷❸❹❺]/g, (match) => circledMap[match] || match);
}

// HTML 특수 엔티티 디코딩
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// HTML 태그 및 MathML 수식 정제 헬퍼
function cleanHtmlContent(rawHtml: string): string {
  if (!rawHtml) return "";

  // 1. MathML 연산자 및 기호 앞뒤 공백 정돈 (예: ≡, =, +, -, ×, ÷ 등)
  let processed = rawHtml
    .replace(/<mo[^>]*>([≡=≠≤≥≈~+×÷])<\/mo>/gi, ' $1 ')
    .replace(/<mo[^>]*>([,])<\/mo>/gi, '$1 ');

  // 2. 줄바꿈 태그 보존
  processed = processed
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, '');

  // 3. 모든 HTML 태그 제거
  processed = processed.replace(/<[^>]+>/g, '');

  // 4. HTML 엔티티 디코딩
  processed = decodeHtmlEntities(processed);

  // 5. 연속 공백 및 줄바꿈 정리
  const lines = processed
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line.length > 0);

  return lines.join('\n');
}

// HTML 분석하여 문제 이미지 URL 및 정답 추출
function extractQuestionData(html: string, fallbackFile: { drive_id: string; name: string; question_image_drive_id?: string | null }) {
  // 1. 문제 이미지 링크 추출
  let imageUrl = "";
  let imageSource = "이미지 미발견";

  // 1-1. report-export-problem-src data-src
  const mDataSrc = html.match(/id=["']report-export-problem-src["'][^>]*data-src=["']([^"']+)["']/i)
                || html.match(/data-src=["']([^"']+)["'][^>]*id=["']report-export-problem-src["']/i);
  if (mDataSrc && mDataSrc[1].trim()) {
    imageUrl = mDataSrc[1].trim();
    imageSource = "report-export-problem-src 태그 (data-src 속성)";
  }

  // 1-2. report-original-problem-img src
  if (!imageUrl) {
    const mImg = html.match(/class=["'][^"']*report-original-problem-img[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (mImg && mImg[1].trim()) {
      imageUrl = mImg[1].trim();
      imageSource = "report-original-problem-img 태그 (src 속성)";
    }
  }

  // 1-3. report-problem-modal-img src (이미 src가 채워진 경우)
  if (!imageUrl) {
    const mModalImg = html.match(/id=["']report-problem-modal-img["'][^>]*src=["']([^"']+)["']/i);
    if (mModalImg && mModalImg[1].trim() && !mModalImg[1].includes('data:image/gif')) {
      imageUrl = mModalImg[1].trim();
      imageSource = "report-problem-modal-img 태그 (src 속성)";
    }
  }

  // 1-4. question_image_drive_id 보조 fallback
  if (!imageUrl && fallbackFile.question_image_drive_id) {
    imageUrl = `https://lh3.googleusercontent.com/d/${fallbackFile.question_image_drive_id}`;
    imageSource = "DB 등록된 question_image_drive_id 사용";
  }

  // 1-5. HTML 내 Drive ID 추출 시도 (예: Source: 0001.png 주변이나 주석)
  if (!imageUrl) {
    const driveMatch = html.match(/https?:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (driveMatch) {
      imageUrl = driveMatch[0];
      imageSource = "HTML 내부 Google Drive 직접 이미지 링크 매칭";
    }
  }

  // 2. 정답 추출
  let rawHtmlSnippet = "";
  let matchedRule = "정답 패턴 미발견";
  let extractedRaw = "";
  let cleanAnswer = "";

  // 2-1. final-answer-text 태그 검색 (span 또는 div의 전체 닫는 태그 매칭)
  const mAnsSpan = html.match(/<span[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const mAnsDiv = html.match(/<div[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const mAnsBox = html.match(/<div[^>]*class=["'][^"']*final-answer-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (mAnsSpan) {
    extractedRaw = mAnsSpan[1];
    matchedRule = "class=\"final-answer-text\" (span) 전체 태그 매칭";
    rawHtmlSnippet = mAnsSpan[0].slice(0, 350);
  } else if (mAnsDiv) {
    extractedRaw = mAnsDiv[1];
    matchedRule = "class=\"final-answer-text\" (div) 전체 태그 매칭";
    rawHtmlSnippet = mAnsDiv[0].slice(0, 350);
  } else if (mAnsBox) {
    // final-answer-box 내부에서 label(FINAL ANSWER)을 제거한 본문 추출
    const inner = mAnsBox[1].replace(/<[^>]*class=["'][^"']*final-answer-label[^"']*["'][^>]*>[\s\S]*?<\/[a-z0-9]+>/i, '');
    extractedRaw = inner;
    matchedRule = "class=\"final-answer-box\" 컨테이너 매칭";
    rawHtmlSnippet = mAnsBox[0].slice(0, 350);
  } else {
    // 2-2. 정답 표기 패턴 검색
    const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
    if (mAns2) {
      extractedRaw = mAns2[1];
      matchedRule = "텍스트 패턴 '(최종정답/정답):' 매칭";
      rawHtmlSnippet = mAns2[0].slice(0, 350);
    }
  }

  if (!rawHtmlSnippet) {
    rawHtmlSnippet = html.slice(0, 250);
  }

  // HTML 태그 제거 및 수식/줄바꿈 정제
  const rawAnswer = cleanHtmlContent(extractedRaw);

  // 서술형(채점 대기 필요) 답안인지 자동 판별
  function isDescriptiveAnswer(cleanAnswer: string, rawAnswer: string): boolean {
    if (!cleanAnswer && !rawAnswer) return false;
    const target = (cleanAnswer || rawAnswer).trim();

    // 1. 객관식 1~5는 단답형
    if (/^[1-5]$/.test(target)) return false;

    // 2. 순수 단일 숫자(정수, 음수, 소수)는 단답형 (예: 83, -12, 0.5)
    if (/^-?\d+(\.\d+)?$/.test(target)) return false;

    // 3. 소문항 패턴 ((1), (2), ①, ② 등) 포함 시 서술형
    if (/\([1-9]\)|[①②③④⑤❶❷❸❹❺]|\[[1-9]\]|\b[1-9]\)/.test(rawAnswer)) return true;

    // 4. 서술/풀이 라벨(문제:, 정답:, 이므로, 따라서 등) 포함 시 서술형
    if (/문제\s*:|정답\s*:|이므로|따라서|풀이|구하시오/i.test(rawAnswer)) return true;

    // 5. 줄바꿈이 포함된 경우 서술형
    if (/\r|\n/.test(rawAnswer)) return true;

    // 6. 띄어쓰기가 포함된 경우 (선생님 요청 핵심 기준)
    if (/\s+/.test(target)) return true;

    // 7. 텍스트 길이가 12자 이상인 경우
    if (target.length >= 12) return true;

    return false;
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

  const finalAns = cleanAnswer || rawAnswer || "";
  const subQuestions = detectSubQuestions(rawAnswer);
  const questionType = detectQuestionType(cleanAnswer, rawAnswer, subQuestions);
  const isDescriptive = questionType === 'DESCRIPTIVE';

  return {
    imageUrl,
    imageSource,
    rawAnswer: rawAnswer || "정답 정보 없음",
    answer: finalAns,
    is_descriptive: isDescriptive,
    question_type: questionType,
    sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
    matchedRule,
    rawHtmlSnippet,
  };
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
