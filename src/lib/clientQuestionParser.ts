/**
 * 클라이언트 및 브라우저 환경에서 안전하게 사용할 수 있는 순수 HTML 문제/정답 파서 유틸
 * (Node.js/googleapis 의존성 없음)
 */

export interface SubQuestionItem {
  label: string;
  answer: string;
}

export interface ExtractedQuestionResult {
  imageUrl: string;
  questionHtml: string;
  rawAnswer: string;
  answer: string;
  is_descriptive: boolean;
  question_type: 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE';
  sub_questions?: SubQuestionItem[];
}

// 원형 숫자 기호 변환
export function normalizeCircledNumber(str: string): string {
  if (!str) return '';
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str.replace(/[①②③④⑤❶❷❸❹❺]/g, (match) => circledMap[match] || match);
}

// 결합 윗줄(Combining Overline U+0305) 부착 헬퍼
export function toCombiningOverline(str: string): string {
  if (!str) return '';
  return str
    .split('')
    .map(ch => (/[a-zA-Z가-힣]/.test(ch) ? `${ch}\u0305` : ch))
    .join('');
}

// 수식 및 텍스트 내 선분/변 윗줄 기호 정규화 (AB― -> A̅B̅)
export function normalizeOverlines(text: string): string {
  if (!text) return '';
  let processed = text;

  // 1. MathML <mover> 태그 처리
  processed = processed.replace(/<mover[^>]*>([\s\S]*?)<\/mover>/gi, (match, inner) => {
    const overlineMoRegex = /<mo[^>]*>([―—‾¯\-~]|&macr;|&#xAF;|&#8213;|&#x2015;|&#175;|&#8254;)<\/mo>/i;
    if (overlineMoRegex.test(inner)) {
      const withoutMo = inner.replace(overlineMoRegex, '');
      const cleanBase = withoutMo.replace(/<[^>]+>/g, '').trim();
      return toCombiningOverline(cleanBase);
    }
    return match;
  });

  // 2. MathML <menclose notation="top"> 처리
  processed = processed.replace(/<menclose[^>]*notation=["'][^"']*top[^"']*["'][^>]*>([\s\S]*?)<\/menclose>/gi, (_, inner) => {
    const cleanBase = inner.replace(/<[^>]+>/g, '').trim();
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

// 소문항 ((1), (2) 등) 자동 감지 및 분할 추출
export function detectSubQuestions(text: string): SubQuestionItem[] {
  if (!text) return [];
  const str = text.trim();

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

// 서술형 판별 호환 함수
export function isDescriptiveAnswer(cleanAnswer: string, rawAnswer: string): boolean {
  if (!cleanAnswer && !rawAnswer) return false;
  const sub = detectSubQuestions(rawAnswer);
  const qType = detectQuestionType(cleanAnswer, rawAnswer, sub);
  return qType === 'DESCRIPTIVE';
}

// HTML 분석하여 문제 이미지 URL 및 정답 추출 (브라우저/클라이언트 안전)
export function parseQuestionFromHtmlClient(
  html: string,
  fallbackFile?: { drive_id?: string; name?: string; question_image_drive_id?: string | null }
): ExtractedQuestionResult {
  if (!html) {
    return {
      imageUrl: '',
      questionHtml: '',
      rawAnswer: '',
      answer: '',
      is_descriptive: false,
      question_type: 'SHORT',
    };
  }

  // 1. 문제 이미지 링크 추출
  let imageUrl = '';

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
  if (!imageUrl && fallbackFile?.question_image_drive_id) {
    imageUrl = `https://lh3.googleusercontent.com/d/${fallbackFile.question_image_drive_id}`;
  }

  // 1-5. HTML 내 Drive ID 추출 시도 (예: lh3.googleusercontent.com/d/{driveId})
  if (!imageUrl) {
    const driveMatch = html.match(/https?:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (driveMatch) {
      imageUrl = driveMatch[0];
    }
  }

  // 1-6. HTML 문제 지문 추출 (이미지가 없는 순수 HTML 수식 문제 등)
  let questionHtml = '';
  const mQuestion = html.match(/<div\b[^>]*class=["'][^"']*tex2jax_process[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<hr/i);
  if (mQuestion) {
    questionHtml = mQuestion[1].trim();
  }

  // 2. 정답 추출
  let rawAnswer = '';
  let cleanAnswer = '';

  // 2-0. Details summary 참고 정답 패턴
  const mDetails = html.match(/<summary\b[^>]*>[\s\S]*?정답[\s\S]*?<\/summary>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i);
  if (mDetails) {
    rawAnswer = mDetails[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  // 2-1. final-answer-text 태그 검색
  if (!rawAnswer) {
    const mAnsSpan = html.match(/<span\b[^>]*class=["'][^"']*final-answer-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    if (mAnsSpan) {
      rawAnswer = mAnsSpan[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
  }

  // 2-2. final-answer-box 박스 전체 검색
  if (!rawAnswer) {
    const mAnsBox = html.match(/class=["'][^"']*final-answer-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (mAnsBox) {
      rawAnswer = mAnsBox[1]
        .replace(/<span\b[^>]*class=["'][^"']*final-answer-label[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
  }

  // 2-3. 정답 표기 패턴 검색 (최종 정답 : ...)
  if (!rawAnswer) {
    const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
    if (mAns2) {
      rawAnswer = mAns2[1].replace(/<[^>]+>/g, ' ').trim();
    }
  }

  if (rawAnswer) {
    // 1) 원형 기호(①~⑤ 또는 ❶~❺)가 본문 어디든 포함되어 있는지 우선 탐색
    const circledMatch = rawAnswer.match(/[①②③④⑤❶❷❸❹❺]/);
    if (circledMatch) {
      cleanAnswer = normalizeCircledNumber(circledMatch[0]);
    } else {
      // 2) '정답: 3' 또는 '답: 3' 패턴
      const ansLabelMatch = rawAnswer.match(/(?:정답|답)\s*[:：]?\s*([1-5])\b/);
      if (ansLabelMatch) {
        cleanAnswer = ansLabelMatch[1];
      } else {
        // 3) 맨 앞이 숫자로 시작하는 경우
        const normalized = normalizeCircledNumber(rawAnswer);
        const numMatch = normalized.match(/^([1-5])\b/);
        if (numMatch) {
          cleanAnswer = numMatch[1];
        } else {
          // 주관식 답안
          cleanAnswer = normalized.trim();
        }
      }
    }
  }

  const finalAns = cleanAnswer || rawAnswer || '';
  const subQuestions = detectSubQuestions(rawAnswer);
  const questionType = detectQuestionType(cleanAnswer, rawAnswer, subQuestions);
  const isDescriptive = questionType === 'DESCRIPTIVE';

  return {
    imageUrl,
    questionHtml,
    rawAnswer: rawAnswer || '정답 정보 없음',
    answer: finalAns,
    is_descriptive: isDescriptive,
    question_type: questionType,
    sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
  };
}
