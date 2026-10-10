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

// 🌟 알파벳/글자에 결합 윗줄(Combining Overline U+0305) 부착 헬퍼
export function toCombiningOverline(str: string): string {
  if (!str) return "";
  return str
    .split("")
    .map(ch => (/[a-zA-Z가-힣]/.test(ch) ? `${ch}\u0305` : ch))
    .join("");
}

// 🌟 수식 및 텍스트 내 선분/변 윗줄 기호 정규화 (AB― -> A̅B̅)
export function normalizeOverlines(text: string): string {
  if (!text) return "";
  let processed = text;

  // 1. MathML <mover> 태그 처리
  processed = processed.replace(/<mover[^>]*>([\s\S]*?)<\/mover>/gi, (match, inner) => {
    const overlineMoRegex = /<mo[^>]*>([―—‾¯\-~]|&macr;|&#xAF;|&#8213;|&#x2015;|&#175;|&#8254;)<\/mo>/i;
    if (overlineMoRegex.test(inner)) {
      const withoutMo = inner.replace(overlineMoRegex, "");
      const cleanBase = withoutMo.replace(/<[^>]+>/g, "").trim();
      return toCombiningOverline(cleanBase);
    }
    return match;
  });

  // 2. MathML <menclose notation="top"> 처리
  processed = processed.replace(/<menclose[^>]*notation=["'][^"']*top[^"']*["'][^>]*>([\s\S]*?)<\/menclose>/gi, (_, inner) => {
    const cleanBase = inner.replace(/<[^>]+>/g, "").trim();
    return toCombiningOverline(cleanBase);
  });

  // 3. LaTeX 스타일 \overline{AB} 처리
  processed = processed.replace(/\\(?:overline|bar)\{([A-Za-z]+)\}/g, (_, letters) => {
    return toCombiningOverline(letters);
  });

  // 4. 이미 텍스트로 추출된 대시/오버라인 기호 (예: AB―, FD―, BC―)
  processed = processed.replace(/([A-Z]{1,3})\s*[―—‾¯]+/g, (_, letters) => {
    return toCombiningOverline(letters);
  });

  // 5. 알파벳 2~3글자 뒤에 붙은 하이픈 (예: AB-와 FD-)
  processed = processed.replace(/([A-Z]{2,3})\s*-(?=[^0-9a-zA-Z]|$)/g, (_, letters) => {
    return toCombiningOverline(letters);
  });

  return processed;
}

export interface SubQuestionItem {
  label: string;
  answer: string;
}

// 소문항 ((1), (2) 등) 자동 감지 및 분할 추출
export function detectSubQuestions(text: string): SubQuestionItem[] {
  if (!text) return [];
  const str = text.trim();

  // (1), (2) / ①, ② / [1], [2] / 1), 2) / (가), (나) 등 소문항 분할 패턴
  const labelPattern = /(?:^|\s|\n|\r)(?:\(([1-9]|가|나|다|라)\)|([①②③④⑤❶❷❸❹❺])|\[([1-9])\]|([1-9]\)))(?:\s*|\.?)/g;
  const matches: Array<{ index: number; length: number; label: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = labelPattern.exec(str)) !== null) {
    let label = '';
    if (m[1]) label = `(${m[1]})`;
    else if (m[2]) label = m[2];
    else if (m[3]) label = `[${m[3]}]`;
    else if (m[4]) label = m[4];

    matches.push({
      index: m.index,
      length: m[0].length,
      label,
    });
  }

  // 2개 이상의 소문항이 분할 검출되었을 때만 소문항 구조로 인정
  if (matches.length < 2) {
    return [];
  }

  const items: SubQuestionItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const start = cur.index + cur.length;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : str.length;
    const ans = str.slice(start, end).trim().replace(/^[:：\s]+/, '').replace(/[,;\s]+$/, '');
    if (ans) {
      items.push({ label: cur.label, answer: normalizeOverlines(ans) });
    }
  }

  return items.length >= 2 ? items : [];
}

// 문제 유형 ('MULTIPLE' | 'SHORT' | 'DESCRIPTIVE') 자동 판별
export function detectQuestionType(
  cleanAnswer: string,
  rawAnswer: string,
  subQuestions: SubQuestionItem[] = []
): 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE' {
  const target = (cleanAnswer || rawAnswer).trim();

  // 1. 객관식 1~5 단일 번호 (소문항이 없는 경우)
  if (subQuestions.length === 0 && /^[1-5]$/.test(target)) {
    return 'MULTIPLE';
  }

  // 2. 소문항이 2개 이상 있는 경우
  if (subQuestions.length >= 2) {
    // 소문항 각각의 답이 긴 설명/풀이인지 검사
    const hasLongDescriptive = subQuestions.some(
      (sq) => /문제\s*:|정답\s*:|이므로|따라서|풀이|구하시오/i.test(sq.answer) || sq.answer.length >= 25
    );
    return hasLongDescriptive ? 'DESCRIPTIVE' : 'SHORT';
  }

  // 3. 서술형 판별 (긴 풀이 문장, 유도 과정 등)
  if (/문제\s*:|정답\s*:|이므로|따라서|풀이|구하시오/i.test(rawAnswer)) {
    return 'DESCRIPTIVE';
  }
  if (/\r|\n/.test(rawAnswer) && rawAnswer.length >= 15) {
    return 'DESCRIPTIVE';
  }
  if (target.length >= 15 && /\s+/.test(target)) {
    return 'DESCRIPTIVE';
  }

  // 4. 그 외 순수 단일 숫자나 짧은 단답
  return 'SHORT';
}

// 서술형(채점 대기 필요) 답안인지 자동 판별 (기존 호환 유지)
export function isDescriptiveAnswer(cleanAnswer: string, rawAnswer: string): boolean {
  if (!cleanAnswer && !rawAnswer) return false;
  const sub = detectSubQuestions(rawAnswer);
  const qType = detectQuestionType(cleanAnswer, rawAnswer, sub);
  return qType === 'DESCRIPTIVE';
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

  // 2-1. final-answer-text 태그 검색 (온전한 </span>까지 매칭하여 내부 MathML 수식 태그 조기 종료 방지)
  const mAnsSpan = html.match(/<span\b[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (mAnsSpan) {
    rawAnswer = mAnsSpan[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  } else {
    // 2-2. final-answer-box 박스 전체 검색
    const mAnsBox = html.match(/class=["'][^"']*final-answer-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (mAnsBox) {
      rawAnswer = mAnsBox[1]
        .replace(/<span\b[^>]*class=["'][^"']*final-answer-label[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
    } else {
      // 2-3. 정답 표기 패턴 검색
      const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
      if (mAns2) {
        rawAnswer = mAns2[1].replace(/<[^>]+>/g, ' ').trim();
      }
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

  const finalAns = cleanAnswer || rawAnswer || "";
  const subQuestions = detectSubQuestions(rawAnswer);
  const questionType = detectQuestionType(cleanAnswer, rawAnswer, subQuestions);
  const isDescriptive = questionType === 'DESCRIPTIVE';

  return {
    imageUrl,
    rawAnswer: rawAnswer || "정답 정보 없음",
    answer: finalAns,
    is_descriptive: isDescriptive,
    question_type: questionType,
    sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
  };
}
