/**
 * 공용 수식 파싱(MathML -> 정규식), LaTeX 변환(KaTeX 프리뷰용),
 * 및 단답형 수식 동치 채점 엔진 유틸리티
 */

function toCombiningOverlineLocal(str: string): string {
  if (!str) return '';
  return str
    .split('')
    .map((ch) => (/[a-zA-Z가-힣]/.test(ch) ? `${ch}\u0305` : ch))
    .join('');
}

// MathML 내부 자식 노드들을 최상위 레벨 기준으로 분리
function splitMathMLTopLevelChildren(innerXml: string): string[] {
  const children: string[] = [];
  let pos = 0;
  const len = innerXml.length;

  while (pos < len) {
    // 공백 건너뛰기
    while (pos < len && /\s/.test(innerXml[pos])) pos++;
    if (pos >= len) break;

    if (innerXml[pos] === '<') {
      // 여는 태그 읽기
      const tagOpenEnd = innerXml.indexOf('>', pos);
      if (tagOpenEnd === -1) break;
      const openTagFull = innerXml.slice(pos, tagOpenEnd + 1);

      // 자체 닫힘 태그 (<mspace/> 등)
      if (openTagFull.endsWith('/>')) {
        children.push(openTagFull);
        pos = tagOpenEnd + 1;
        continue;
      }

      const tagNameMatch = openTagFull.match(/^<([a-zA-Z0-9:-]+)/);
      if (!tagNameMatch) {
        pos = tagOpenEnd + 1;
        continue;
      }
      const tagName = tagNameMatch[1];

      // 중첩 깊이 추적하여 대응하는 닫는 태그 찾기
      let depth = 1;
      let searchPos = tagOpenEnd + 1;
      const openRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
      const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');

      while (depth > 0 && searchPos < len) {
        openRe.lastIndex = searchPos;
        closeRe.lastIndex = searchPos;
        const nextOpen = openRe.exec(innerXml);
        const nextClose = closeRe.exec(innerXml);

        if (!nextClose) {
          searchPos = len;
          break;
        }

        if (nextOpen && nextOpen.index < nextClose.index) {
          // 자체 닫힘이 아닌 경우만 depth 증가
          if (!nextOpen[0].endsWith('/>')) {
            depth++;
          }
          searchPos = nextOpen.index + nextOpen[0].length;
        } else {
          depth--;
          searchPos = nextClose.index + nextClose[0].length;
        }
      }

      children.push(innerXml.slice(pos, searchPos));
      pos = searchPos;
    } else {
      const nextTag = innerXml.indexOf('<', pos);
      const textEnd = nextTag === -1 ? len : nextTag;
      const txt = innerXml.slice(pos, textEnd).trim();
      if (txt) children.push(txt);
      pos = textEnd;
    }
  }

  return children;
}

// HTML/MathML 엔티티 디코딩
export function decodeMathEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&minus;/gi, '-')
    .replace(/&plus;/gi, '+')
    .replace(/&times;/gi, '×')
    .replace(/&middot;|&sdot;/gi, '·')
    .replace(/&divide;/gi, '÷')
    .replace(/&plusmn;/gi, '±')
    .replace(/&le;|&leq;/gi, '≤')
    .replace(/&ge;|&geq;/gi, '≥')
    .replace(/&ne;|&neq;/gi, '≠')
    .replace(/&approx;/gi, '≈')
    .replace(/&pi;/gi, 'π')
    .replace(/&theta;/gi, 'θ')
    .replace(/&alpha;/gi, 'α')
    .replace(/&beta;/gi, 'β')
    .replace(/&gamma;/gi, 'γ')
    .replace(/&infin;/gi, '∞')
    .replace(/&deg;/gi, '°')
    .replace(/&ang;/gi, '∠')
    .replace(/&perp;/gi, '⊥')
    .replace(/&parallel;/gi, '∥')
    .replace(/&equiv;/gi, '≡')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// 단일 MathML 노드 재귀 변환 -> 읽기 쉬운 정규 수식 텍스트
function convertMathMLNode(nodeXml: string): string {
  const trimmed = nodeXml.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('<')) return decodeMathEntities(trimmed);

  const tagMatch = trimmed.match(/^<([a-zA-Z0-9:-]+)(?:\s[^>]*)?>([\s\S]*)<\/\1\s*>$/i);
  if (!tagMatch) {
    // 자체 닫힘 태그 또는 단순 태그 제거
    return decodeMathEntities(trimmed.replace(/<[^>]+>/g, ''));
  }

  const tagName = tagMatch[1].toLowerCase();
  const inner = tagMatch[2];

  if (tagName === 'math' || tagName === 'mrow' || tagName === 'mstyle' || tagName === 'mpadded' || tagName === 'semantics') {
    const children = splitMathMLTopLevelChildren(inner);
    return children.map(convertMathMLNode).join('');
  }

  if (tagName === 'annotation' || tagName === 'annotation-xml') {
    return '';
  }

  if (tagName === 'mfrac') {
    const children = splitMathMLTopLevelChildren(inner);
    if (children.length >= 2) {
      const rawNum = convertMathMLNode(children[0]).trim();
      const rawDen = convertMathMLNode(children[1]).trim();
      const num = /[+\-×÷\s]/.test(rawNum) && !(rawNum.startsWith('(') && rawNum.endsWith(')')) ? `(${rawNum})` : rawNum;
      const den = /[+\-×÷\s]/.test(rawDen) && !(rawDen.startsWith('(') && rawDen.endsWith(')')) ? `(${rawDen})` : rawDen;
      return `${num}/${den}`;
    }
  }

  if (tagName === 'msup') {
    const children = splitMathMLTopLevelChildren(inner);
    if (children.length >= 2) {
      const rawBase = convertMathMLNode(children[0]).trim();
      const rawExp = convertMathMLNode(children[1]).trim();
      const base = /[+\-×÷/\s]/.test(rawBase) && !(rawBase.startsWith('(') && rawBase.endsWith(')')) ? `(${rawBase})` : rawBase;
      const exp = rawExp.length > 1 && !/^\(.*\)$/.test(rawExp) ? `(${rawExp})` : rawExp;
      return `${base}^${exp}`;
    }
  }

  if (tagName === 'msub') {
    const children = splitMathMLTopLevelChildren(inner);
    if (children.length >= 2) {
      const rawBase = convertMathMLNode(children[0]).trim();
      const rawSub = convertMathMLNode(children[1]).trim();
      const sub = rawSub.length > 1 && !/^\(.*\)$/.test(rawSub) ? `(${rawSub})` : rawSub;
      return `${rawBase}_${sub}`;
    }
  }

  if (tagName === 'msubsup') {
    const children = splitMathMLTopLevelChildren(inner);
    if (children.length >= 3) {
      const base = convertMathMLNode(children[0]).trim();
      const sub = convertMathMLNode(children[1]).trim();
      const exp = convertMathMLNode(children[2]).trim();
      return `${base}_${sub.length > 1 ? `(${sub})` : sub}^${exp.length > 1 ? `(${exp})` : exp}`;
    }
  }

  if (tagName === 'msqrt') {
    const children = splitMathMLTopLevelChildren(inner);
    const body = children.map(convertMathMLNode).join('').trim();
    const needsParens = body.length > 1 && !/^\(.*\)$/.test(body) && !/^\d+$/.test(body);
    return needsParens ? `√(${body})` : `√${body}`;
  }

  if (tagName === 'mroot') {
    const children = splitMathMLTopLevelChildren(inner);
    if (children.length >= 2) {
      const body = convertMathMLNode(children[0]).trim();
      const idx = convertMathMLNode(children[1]).trim();
      return `${idx}√(${body})`;
    }
  }

  if (tagName === 'mover') {
    const overlineMoRegex = /<mo[^>]*>([―—‾¯\-~]|&macr;|&#xAF;|&#8213;|&#x2015;|&#175;|&#8254;)<\/mo>/i;
    if (overlineMoRegex.test(inner)) {
      const withoutMo = inner.replace(overlineMoRegex, '');
      const cleanBase = withoutMo.replace(/<[^>]+>/g, '').trim();
      return toCombiningOverlineLocal(cleanBase);
    }
  }

  if (tagName === 'menclose') {
    if (/notation=["'][^"']*top[^"']*["']/i.test(trimmed)) {
      const cleanBase = inner.replace(/<[^>]+>/g, '').trim();
      return toCombiningOverlineLocal(cleanBase);
    }
  }

  if (tagName === 'mfenced') {
    const openMatch = trimmed.match(/open=["']([^"']*)["']/i);
    const closeMatch = trimmed.match(/close=["']([^"']*)["']/i);
    const open = openMatch ? openMatch[1] : '(';
    const close = closeMatch ? closeMatch[1] : ')';
    const children = splitMathMLTopLevelChildren(inner);
    return `${open}${children.map(convertMathMLNode).join(',')}${close}`;
  }

  if (tagName === 'mi' || tagName === 'mn' || tagName === 'mo' || tagName === 'mtext' || tagName === 'ms') {
    return decodeMathEntities(inner.replace(/<[^>]+>/g, ''));
  }

  // 기타 태그 재귀 처리
  const children = splitMathMLTopLevelChildren(inner);
  if (children.length > 0) {
    return children.map(convertMathMLNode).join('');
  }
  return decodeMathEntities(inner.replace(/<[^>]+>/g, ''));
}

/**
 * HTML 문자열 내의 모든 <math>...</math> 블록을
 * 데이터 소실 없이 정규 수식 텍스트(예: 3/4, x^2, √2)로 변환합니다.
 */
export function convertMathMLInHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, (mathBlock) => {
    const converted = convertMathMLNode(mathBlock);
    return ` ${converted} `;
  });
}

/**
 * 중첩 태그가 있더라도 class="final-answer-text" 블록 전체를 안전하게 추출합니다.
 */
export function extractElementInnerByClass(html: string, className: string): string | null {
  const startRegex = new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
  const m = startRegex.exec(html);
  if (!m) return null;

  const tagName = m[1];
  const contentStart = m.index + m[0].length;
  let depth = 1;
  let pos = contentStart;
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');

  while (depth > 0 && pos < html.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      if (!nextOpen[0].endsWith('/>')) depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose.index);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

/**
 * 학생/교사 입력 수식 문자열을 KaTeX 렌더링용 LaTeX 문자열로 변환합니다.
 */
export function toLatexForPreview(input: string): string {
  if (!input) return '';
  let s = input.trim();

  // 결합 윗줄 문자(A̅B̅) -> \overline{AB}
  s = s.replace(/([A-Za-z0-9]\u0305)+/g, (seq) => {
    const clean = seq.replace(/\u0305/g, '');
    return `\\overline{${clean}}`;
  });

  // 유니코드 거듭제곱 정규화
  s = s
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/ⁿ/g, '^n')
    .replace(/⁻¹/g, '^{-1}');

  // ⁿ√(...) 형태 -> \sqrt[n]{...}
  s = s.replace(/(\d+|[a-zA-Z])√\(([^()]+)\)/g, '\\sqrt[$1]{$2}');
  s = s.replace(/(\d+|[a-zA-Z])√([a-zA-Z0-9]+)/g, '\\sqrt[$1]{$2}');

  // √(...) 또는 √2 형태 -> \sqrt{...}
  s = s.replace(/√\(([^()]+)\)/g, '\\sqrt{$1}');
  s = s.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');
  s = s.replace(/√/g, '\\sqrt{\\square}');

  // 분수 변환: (a)/(b) 또는 simple a/b
  // 괄호 분수 (a)/(b)
  s = s.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/\(([^()]+)\)\s*\/\s*([a-zA-Z0-9πθαβ√\\{}^_]+)/g, '\\frac{$1}{$2}');
  s = s.replace(/([a-zA-Z0-9πθαβ√\\{}^_]+)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/([a-zA-Z0-9πθαβ√\\{}^_]+)\s*\/\s*([a-zA-Z0-9πθαβ√\\{}^_]+)/g, '\\frac{$1}{$2}');

  // 지수/아래첨자 괄호 변환: x^(n+1) -> x^{n+1}
  s = s.replace(/\^\(([^()]+)\)/g, '^{$1}');
  s = s.replace(/_\(([^()]+)\)/g, '_{$1}');

  // 특수 기호 -> LaTeX 명령어
  s = s
    .replace(/π/g, '\\pi ')
    .replace(/θ/g, '\\theta ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/∞/g, '\\infty ')
    .replace(/±/g, '\\pm ')
    .replace(/×/g, '\\times ')
    .replace(/·/g, '\\cdot ')
    .replace(/÷/g, '\\div ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ')
    .replace(/∠/g, '\\angle ')
    .replace(/△/g, '\\triangle ')
    .replace(/⊥/g, '\\perp ')
    .replace(/∥/g, '\\parallel ')
    .replace(/≡/g, '\\equiv ')
    .replace(/∈/g, '\\in ')
    .replace(/⊂/g, '\\subset ')
    .replace(/∪/g, '\\cup ')
    .replace(/∩/g, '\\cap ')
    .replace(/∅/g, '\\emptyset ')
    .replace(/∑/g, '\\sum ')
    .replace(/∫/g, '\\int ')
    .replace(/□/g, '\\square ')
    .replace(/°/g, '^{\\circ}')
    .replace(/(?<![\\a-zA-Z])(lim|sin|cos|tan|ln|log)(?![a-zA-Z])/g, '\\$1');

  return s;
}

/**
 * 수식 문자열을 비교 가능한 정규(Canonical) 형태로 표준화합니다.
 */
export function normalizeMathCanonical(raw: string): string {
  if (!raw) return '';

  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };

  let s = raw
    .replace(/[①②③④⑤❶❷❸❹❺]/g, (m) => circledMap[m] || m)
    .replace(/\u0305/g, '')
    .replace(/[―—‾¯]/g, '')
    .replace(/\s+/g, '')
    .trim();

  // LaTeX 기본 명령어 정규화
  s = s
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$1√($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\pm\b/g, '±')
    .replace(/\\times\b/g, '*')
    .replace(/\\cdot\b/g, '*')
    .replace(/\\div\b/g, '/')
    .replace(/\\le\b/g, '≤')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\ne\b/g, '≠')
    .replace(/\\(sin|cos|tan|ln|log)\b/g, '$1')
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/_\{([^{}]+)\}/g, '_($1)');

  // 유니코드 위첨자 및 곱셈 기호 정규화
  s = s
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/ⁿ/g, '^n')
    .replace(/⁻¹/g, '^-1')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\+-|-\+/g, '±');

  // 단일 토큰 주변 불필요한 괄호 제거: (3)/(4) -> 3/4, √(2) -> √2, ^(2) -> ^2
  s = s
    .replace(/√\(([a-zA-Z0-9]+)\)/g, '√$1')
    .replace(/\^\(([a-zA-Z0-9]+)\)/g, '^$1')
    .replace(/_\(([a-zA-Z0-9]+)\)/g, '_$1')
    .replace(/\(([a-zA-Z0-9]+)\)\/\(([a-zA-Z0-9]+)\)/g, '$1/$2');

  // 암시적 곱셈 표준화: 2*x -> 2x, 2*(x+1) -> 2(x+1), (x+1)*(x-2) -> (x+1)(x-2), 2*√3 -> 2√3
  s = s
    .replace(/(\d)\*([a-zA-Zπe√(])/g, '$1$2')
    .replace(/([a-zA-Zπ)])\*([a-zA-Zπ√(])/g, '$1$2')
    .replace(/\)\*(\d)/g, ')$1');

  return s.toLowerCase();
}

// 최상위 곱셈 인수 분리 (예: "2(x+3)(x-1)" -> ["2", "(x+3)", "(x-1)"])
function splitTopLevelProductFactors(expr: string): string[] | null {
  if (!expr) return null;

  // 최상위(+/- 연산이 괄호 밖에 있으면 곱셈식이 아님 -> 인수분해 식이 아님)
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && i > 0 && (ch === '+' || ch === '-' || ch === '=' || ch === ',')) {
      return null;
    }
  }
  if (depth !== 0) return null;

  // 괄호 덩어리 및 계수 분리
  const factors: string[] = [];
  let i = 0;
  // 선행 부호
  if (expr[0] === '+' || expr[0] === '-') {
    let signEnd = 1;
    while (signEnd < expr.length && expr[signEnd] !== '(' && expr[signEnd] !== '*') signEnd++;
    factors.push(expr.slice(0, signEnd));
    i = signEnd;
  }

  while (i < expr.length) {
    if (expr[i] === '*') {
      i++;
      continue;
    }
    if (expr[i] === '(') {
      let d = 1;
      let j = i + 1;
      while (j < expr.length && d > 0) {
        if (expr[j] === '(') d++;
        else if (expr[j] === ')') d--;
        j++;
      }
      // 뒤에 거듭제곱(^2 등)이 붙어있으면 함께 포함
      if (j < expr.length && expr[j] === '^') {
        j++;
        if (expr[j] === '(') {
          let ed = 1;
          j++;
          while (j < expr.length && ed > 0) {
            if (expr[j] === '(') ed++;
            else if (expr[j] === ')') ed--;
            j++;
          }
        } else {
          while (j < expr.length && /[a-z0-9]/i.test(expr[j])) j++;
        }
      }
      factors.push(expr.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < expr.length && expr[j] !== '(' && expr[j] !== '*') j++;
      const token = expr.slice(i, j);
      if (token) factors.push(token);
      i = j;
    }
  }

  return factors.length >= 2 ? factors : null;
}

// 괄호 내부의 덧셈 교환법칙 정규화 (예: "(2+x)" -> "(2+x)" 또는 "(x+2)")
function normalizeTopLevelSumTerms(expr: string): string[] | null {
  let depth = 0;
  const terms: string[] = [];
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      // 분수/지수/방정식 기호 뒤가 아닌 순수 항 분리
      const prev = expr[i - 1];
      if (prev !== '^' && prev !== '_' && prev !== '/' && prev !== '*' && prev !== '=') {
        terms.push(expr.slice(start, i));
        start = i;
      }
    }
  }
  if (depth !== 0) return null;
  terms.push(expr.slice(start));

  // 첫 항에 '+'가 없으면 '+' 붙이기 (단, '-'로 시작하지 않을 때)
  const normalizedTerms = terms.map((t) => (t.startsWith('+') || t.startsWith('-') ? t : `+${t}`));
  return normalizedTerms.length >= 2 ? normalizedTerms.sort() : null;
}

// 단일 수식 토큰 내부 정규화 (인수 내부 덧셈 순서 교환 허용 등)
function normalizeFactorInner(factor: string): string {
  if (factor.startsWith('(') && factor.endsWith(')')) {
    const inner = factor.slice(1, -1);
    const sumTerms = normalizeTopLevelSumTerms(inner);
    if (sumTerms) {
      return `(${sumTerms.join('')})`;
    }
  }
  return factor;
}

/**
 * 두 단답형 수식 답안이 수학적으로 동치(인수 순서 교환, 항 순서 교환, 기호 표기 차이 등)인지 판정합니다.
 * 단, 인수분해식 `(x+2)(x-3)` 과 전개식 `x^2-x-6` 은 의도적으로 다르게 취급합니다.
 */
export function areMathAnswersEquivalent(userRaw: string, correctRaw: string): boolean {
  if (!userRaw || !correctRaw) return false;

  const u = normalizeMathCanonical(userRaw);
  const c = normalizeMathCanonical(correctRaw);
  if (!u || !c) return false;

  // 1. 정규 문자열 완전 일치
  if (u === c) return true;

  // 2. 콤마(,)로 구분된 다중 해/복수 값 순서 무관 비교 (예: "x=1,2" vs "2,1")
  if (u.includes(',') && c.includes(',')) {
    const uParts = u.split(',').map((p) => p.replace(/^[a-z]=/, '')).sort();
    const cParts = c.split(',').map((p) => p.replace(/^[a-z]=/, '')).sort();
    if (uParts.length === cParts.length && uParts.every((val, idx) => areMathAnswersEquivalent(val, cParts[idx]))) {
      return true;
    }
  }

  // 3. 인수분해 식 교환법칙 비교: (x+2)(x-3) === (x-3)(x+2) or (2+x)(-3+x)
  const uFactors = splitTopLevelProductFactors(u);
  const cFactors = splitTopLevelProductFactors(c);
  if (uFactors && cFactors && uFactors.length === cFactors.length) {
    const uNormFactors = uFactors.map(normalizeFactorInner).sort();
    const cNormFactors = cFactors.map(normalizeFactorInner).sort();
    if (uNormFactors.every((f, idx) => f === cNormFactors[idx])) {
      return true;
    }
  }

  // 4. 다항식 항 교환법칙 비교: x^2-9 === -9+x^2
  const uSum = normalizeTopLevelSumTerms(u);
  const cSum = normalizeTopLevelSumTerms(c);
  if (uSum && cSum && uSum.length === cSum.length) {
    if (uSum.every((t, idx) => t === cSum[idx])) {
      return true;
    }
  }

  // 5. 순수 분수-소수 단순 수치 동치: 1/2 === 0.5, -3/4 === -0.75
  const parseSimpleFractionOrDecimal = (val: string): number | null => {
    const fracMatch = val.match(/^([+-]?\d+)\/(\d+)$/);
    if (fracMatch) {
      const den = parseInt(fracMatch[2], 10);
      if (den === 0) return null;
      return parseInt(fracMatch[1], 10) / den;
    }
    if (/^[+-]?\d+(\.\d+)?$/.test(val)) {
      return parseFloat(val);
    }
    return null;
  };
  const uNum = parseSimpleFractionOrDecimal(u);
  const cNum = parseSimpleFractionOrDecimal(c);
  if (uNum !== null && cNum !== null && Math.abs(uNum - cNum) < 1e-9) {
    return true;
  }

  return false;
}
