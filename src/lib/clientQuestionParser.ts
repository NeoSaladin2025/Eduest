/**
 * 클라이언트 및 브라우저 환경에서 안전하게 사용할 수 있는 순수 HTML 문제/정답 파서 유틸
 * (Node.js/googleapis 의존성 없음)
 */

import {
  convertMathMLInHtml,
  extractElementInnerByClass,
  decodeMathEntities,
} from './mathFormulaUtils';

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
  imageSource?: string;
  matchedRule?: string;
  rawHtmlSnippet?: string;
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

// HTML 태그 제거 전 MathML 수식을 정규 수식 문자열로 보존하는 정제 헬퍼
export function stripHtmlPreservingMath(snippet: string): string {
  if (!snippet) return '';
  let processed = convertMathMLInHtml(snippet);
  processed = normalizeOverlines(processed);
  processed = processed
    .replace(/<mo[^>]*>([≡=≠≤≥≈~+×÷])<\/mo>/gi, ' $1 ')
    .replace(/<mo[^>]*>([,])<\/mo>/gi, '$1 ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');
  processed = decodeMathEntities(processed);
  processed = normalizeOverlines(processed);
  return processed
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// 문제 유형 ('MULTIPLE' | 'SHORT' | 'DESCRIPTIVE') 자동 판별
export function detectQuestionType(
  cleanAnswer: string,
  rawAnswer: string,
  subQuestions: SubQuestionItem[] = [],
  isMultipleHint: boolean = false
): 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE' {
  const target = (cleanAnswer || rawAnswer).trim();
  const rawTrimmed = (rawAnswer || '').trim();

  // 1. 객관식 판별: 원문자(①~⑤ / ❶~❺) 기반, '[1-5]번', 또는 본문 선지 힌트가 있을 때만 객관식
  //    (단순 아라비아 숫자 1~5 단답형 정답은 객관식으로 오분류하지 않고 'SHORT'로 유지)
  if (subQuestions.length === 0) {
    const rawCircledMatches = rawTrimmed.match(/[①②③④⑤❶❷❸❹❺]/g) || [];
    const hasSubParens = /\([1-9]\)/.test(rawTrimmed);
    const hasExplicitCircled =
      rawCircledMatches.length === 1 &&
      (/^(?:(?:최종\s*)?정답\s*[:：]?\s*)?[①②③④⑤❶❷❸❹❺]/.test(rawTrimmed) || !hasSubParens);
    const hasExplicitChoiceWord = /^(?:(?:최종\s*)?정답|답)?\s*[:：]?\s*[1-5]\s*번$/.test(rawTrimmed);

    if (
      isMultipleHint ||
      /^[①②③④⑤❶❷❸❹❺]$/.test(target) ||
      hasExplicitCircled ||
      hasExplicitChoiceWord
    ) {
      return 'MULTIPLE';
    }
  }

  // 2. 소문항이 2개 이상 있는 경우
  if (subQuestions.length >= 2) {
    const hasLongDescriptive = subQuestions.some(
      (sq) => /문제\s*:|정답\s*:|이므로|따라서|풀이|구하시오/i.test(sq.answer) || sq.answer.length >= 25
    );
    return hasLongDescriptive ? 'DESCRIPTIVE' : 'SHORT';
  }

  // 3. 서술형 판별 (긴 풀이 문장, 유도 과정, 한국어 서술 문장 등)
  if (/문제\s*:|정답\s*:|이므로|따라서|풀이|구하시오|나타낸다|설명하/i.test(rawAnswer)) {
    return 'DESCRIPTIVE';
  }
  if (/\r|\n/.test(rawAnswer) && rawAnswer.length >= 15) {
    return 'DESCRIPTIVE';
  }
  // 순수 수식이 아닌 한국어 서술 문장(한글 어절 3개 이상)인 경우만 서술형으로 판별
  const koreanWords = target.match(/[가-힣]{2,}/g) || [];
  if (koreanWords.length >= 3 && target.length >= 15) {
    return 'DESCRIPTIVE';
  }

  // 4. 그 외 수식/숫자/짧은 단답
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
  let imageSource = '이미지 미발견';

  // 1-1. report-export-problem-src data-src
  const mDataSrc =
    html.match(/id=["']report-export-problem-src["'][^>]*data-src=["']([^"']+)["']/i) ||
    html.match(/data-src=["']([^"']+)["'][^>]*id=["']report-export-problem-src["']/i);
  if (mDataSrc && mDataSrc[1].trim()) {
    imageUrl = mDataSrc[1].trim();
    imageSource = 'report-export-problem-src 태그 (data-src 속성)';
  }

  // 1-2. report-original-problem-img src
  if (!imageUrl) {
    const mImg = html.match(/class=["'][^"']*report-original-problem-img[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (mImg && mImg[1].trim()) {
      imageUrl = mImg[1].trim();
      imageSource = 'report-original-problem-img 태그 (src 속성)';
    }
  }

  // 1-3. report-problem-modal-img src (이미 src가 채워진 경우)
  if (!imageUrl) {
    const mModalImg = html.match(/id=["']report-problem-modal-img["'][^>]*src=["']([^"']+)["']/i);
    if (mModalImg && mModalImg[1].trim() && !mModalImg[1].includes('data:image/gif')) {
      imageUrl = mModalImg[1].trim();
      imageSource = 'report-problem-modal-img 태그 (src 속성)';
    }
  }

  // 1-4. question_image_drive_id 보조 fallback
  if (!imageUrl && fallbackFile?.question_image_drive_id) {
    imageUrl = `https://lh3.googleusercontent.com/d/${fallbackFile.question_image_drive_id}`;
    imageSource = 'DB 등록된 question_image_drive_id 사용';
  }

  // 1-5. HTML 내 Drive ID 추출 시도 (예: lh3.googleusercontent.com/d/{driveId})
  if (!imageUrl) {
    const driveMatch = html.match(/https?:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (driveMatch) {
      imageUrl = driveMatch[0];
      imageSource = 'HTML 내부 Google Drive 직접 이미지 링크 매칭';
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
  let matchedRule = '정답 패턴 미발견';
  let rawHtmlSnippet = '';

  // 2-1. final-answer-text 태그 검색 (중첩 태그 안전 추출 + MathML 보존)
  const ansTextInner = extractElementInnerByClass(html, 'final-answer-text');
  if (ansTextInner) {
    rawAnswer = stripHtmlPreservingMath(ansTextInner);
    matchedRule = 'class="final-answer-text" 전체 태그 매칭 (MathML 보존)';
    rawHtmlSnippet = ansTextInner.slice(0, 350);
  }

  // 2-2. final-answer-box 박스 전체 검색
  if (!rawAnswer) {
    const ansBoxInner = extractElementInnerByClass(html, 'final-answer-box');
    if (ansBoxInner) {
      const withoutLabel = ansBoxInner.replace(
        /<span\b[^>]*class=["'][^"']*final-answer-label[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        ''
      );
      rawAnswer = stripHtmlPreservingMath(withoutLabel);
      matchedRule = 'class="final-answer-box" 컨테이너 매칭';
      rawHtmlSnippet = ansBoxInner.slice(0, 350);
    }
  }

  // 2-3. Details summary 참고 정답 패턴
  if (!rawAnswer) {
    const mDetails = html.match(/<summary\b[^>]*>[\s\S]*?정답[\s\S]*?<\/summary>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i);
    if (mDetails) {
      rawAnswer = stripHtmlPreservingMath(mDetails[1]);
      matchedRule = '<details> 정답 summary 매칭';
      rawHtmlSnippet = mDetails[1].slice(0, 350);
    }
  }

  // 2-4. 정답 표기 패턴 검색 (최종 정답 : ...)
  if (!rawAnswer) {
    const mAns2 = html.match(/(?:최종\s*정답|정답)\s*[:：]?\s*([^\n<]+)/i);
    if (mAns2) {
      rawAnswer = stripHtmlPreservingMath(mAns2[1]);
      matchedRule = "텍스트 패턴 '(최종정답/정답):' 매칭";
      rawHtmlSnippet = mAns2[0].slice(0, 350);
    }
  }

  if (!rawHtmlSnippet) {
    rawHtmlSnippet = html.slice(0, 250);
  }

  let isSingleCircledChoice = false;
  let isExplicitChoiceNumber = false;
  if (rawAnswer) {
    const circledMatches = rawAnswer.match(/[①②③④⑤❶❷❸❹❺]/g) || [];
    const hasSubParens = /\([1-9]\)/.test(rawAnswer);
    const startsWithCircled = /^(?:(?:최종\s*)?정답\s*[:：]?\s*)?[①②③④⑤❶❷❸❹❺]/.test(rawAnswer.trim());

    // 1) 단일 원형 기호(①~⑤ / ❶~❺)가 객관식 번호로 포함된 경우 (뒤에 해설값이 붙어 있어도 객관식 번호만 추출)
    if (circledMatches.length === 1 && (startsWithCircled || !hasSubParens)) {
      cleanAnswer = normalizeCircledNumber(circledMatches[0]);
      isSingleCircledChoice = true;
    } else if (circledMatches.length === 0) {
      // 2) '정답: 3번' / '3번' 또는 '정답: 3' 단독 패턴 (분수 3/4, 루트 2√3 등은 제외)
      const ansWordMatch = rawAnswer.trim().match(/^(?:(?:최종\s*)?정답|답)?\s*[:：]?\s*([1-5])\s*번$/);
      if (ansWordMatch) {
        cleanAnswer = ansWordMatch[1];
        isExplicitChoiceNumber = true;
      } else {
        const ansLabelMatch = rawAnswer.match(/^(?:(?:최종\s*)?정답|답)\s*[:：]?\s*([1-5])$/);
        if (ansLabelMatch) {
          cleanAnswer = ansLabelMatch[1];
        } else {
          // 3) 일반 수식/단답 숫자 정제 (단순 1~5는 원문자가 없으면 단답형 후보로 보존)
          const normalized = normalizeCircledNumber(rawAnswer).trim();
          const numMatch = normalized.match(/^([1-5])$/);
          if (numMatch) {
            cleanAnswer = numMatch[1];
          } else {
            cleanAnswer = normalized;
          }
        }
      }
    } else {
      // 원형 숫자가 2개 이상(복수/소문항) 또는 소문항 괄호와 혼재된 경우
      cleanAnswer = normalizeCircledNumber(rawAnswer).trim();
    }
  }

  // 본문 HTML(풀이/해설 이전 영역)에 ①~④ 이상 선지 마커가 함께 있고 답이 1~5이면 객관식으로 판별
  const problemSectionRaw = html.split(/<details|final-answer-box|풀이\s*1단계/i)[0] || '';
  const problemPlain = problemSectionRaw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const hasChoicesInBody =
    /[①❶]/.test(problemPlain) &&
    /[②❷]/.test(problemPlain) &&
    /[③❸]/.test(problemPlain) &&
    /[④❹]/.test(problemPlain);

  const finalAns = cleanAnswer || rawAnswer || '';
  const subQuestions = isSingleCircledChoice ? [] : detectSubQuestions(rawAnswer);
  const isMultipleHint =
    isSingleCircledChoice ||
    isExplicitChoiceNumber ||
    (hasChoicesInBody && /^[1-5]$/.test(finalAns.trim()));
  const questionType = isSingleCircledChoice
    ? 'MULTIPLE'
    : detectQuestionType(cleanAnswer, rawAnswer, subQuestions, isMultipleHint);
  const isDescriptive = questionType === 'DESCRIPTIVE';

  return {
    imageUrl,
    questionHtml,
    rawAnswer: rawAnswer || '정답 정보 없음',
    answer: finalAns,
    is_descriptive: isDescriptive,
    question_type: questionType,
    sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
    imageSource,
    matchedRule,
    rawHtmlSnippet,
  };
}
