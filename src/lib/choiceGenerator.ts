/**
 * 단답형 정답(정수, 소수, 분수, 제곱근, π, 일차/이차식 등)으로부터
 * 5지 선다형 보기(정답 1개 + 그럴듯한 오답 4개)를 자동 생성하는 유틸리티
 */

export const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤'] as const;

export function getCircledSymbol(oneBasedIndex: string | number): string {
  const n = typeof oneBasedIndex === 'number' ? oneBasedIndex : parseInt(String(oneBasedIndex), 10);
  if (n >= 1 && n <= 5) return CIRCLED_NUMBERS[n - 1];
  return String(oneBasedIndex);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatReducedFraction(num: number, den: number): string {
  if (den === 0) return '';
  const sign = (num < 0) !== (den < 0) ? -1 : 1;
  const an = Math.abs(num);
  const ad = Math.abs(den);
  const g = gcd(an, ad);
  const rn = (an / g) * sign;
  const rd = ad / g;
  if (rd === 1) return String(rn);
  return `${rn}/${rd}`;
}

function shuffleWithAnswer(answer: string, distractors: string[]): { choices: string[]; correctIndex: number } | null {
  const cleanAns = answer.trim();
  const seen = new Set<string>([cleanAns.replace(/\s+/g, '')]);
  const uniqueDistractors: string[] = [];

  for (const d of distractors) {
    const trimmed = d.trim();
    if (!trimmed) continue;
    const key = trimmed.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueDistractors.push(trimmed);
    if (uniqueDistractors.length === 4) break;
  }

  if (uniqueDistractors.length < 4) return null;

  const pool = [
    { text: cleanAns, isCorrect: true },
    ...uniqueDistractors.map((text) => ({ text, isCorrect: false })),
  ];

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const correctIndex = pool.findIndex((p) => p.isCorrect) + 1;
  return {
    choices: pool.map((p) => p.text),
    correctIndex,
  };
}

function generateNumericDistractors(n: number): string[] {
  const candidates: number[] = [];
  if (Number.isInteger(n)) {
    if (n !== 0) candidates.push(-n);
    const abs = Math.abs(n);
    const deltas = abs <= 10 ? [-2, -1, 1, 2, 3, -3, 4] : abs <= 50 ? [-4, -2, 2, 4, -1, 1, 6, -6] : [-10, -5, 5, 10, -2, 2, 1, -1];
    for (const d of deltas) candidates.push(n + d);
    if (abs >= 2) {
      candidates.push(n * 2);
      if (abs % 2 === 0) candidates.push(n / 2);
    }
    return candidates.map((v) => String(v));
  } else {
    // Decimal
    const decimals = (String(n).split('.')[1] || '').length;
    const step = Math.pow(10, -Math.min(2, decimals));
    if (n !== 0) candidates.push(-n);
    for (const m of [-2, -1, 1, 2, 3, -3, 5]) {
      candidates.push(Number((n + m * step).toFixed(decimals)));
    }
    return candidates.map((v) => String(v));
  }
}

function generateFractionDistractors(num: number, den: number): string[] {
  const cands: string[] = [];
  cands.push(formatReducedFraction(-num, den));
  if (Math.abs(num) !== Math.abs(den)) {
    cands.push(formatReducedFraction(den, num));
  }
  cands.push(formatReducedFraction(num + 1, den));
  cands.push(formatReducedFraction(num - 1, den));
  cands.push(formatReducedFraction(num, den + 1));
  if (den > 2) cands.push(formatReducedFraction(num, den - 1));
  cands.push(formatReducedFraction(num + 2, den));
  cands.push(formatReducedFraction(num - 2, den));
  return cands;
}

function generateRadicalDistractors(coefStr: string, inner: number): string[] {
  const coef = coefStr === '' ? 1 : coefStr === '-' ? -1 : parseInt(coefStr, 10);
  const cands: string[] = [];
  const fmt = (c: number, r: number) => {
    if (c === 0) return '0';
    if (c === 1) return `√${r}`;
    if (c === -1) return `-√${r}`;
    return `${c}√${r}`;
  };
  if (coef !== 0) cands.push(fmt(-coef, inner));
  cands.push(fmt(coef + 1, inner));
  cands.push(fmt(coef - 1 === 0 ? coef + 2 : coef - 1, inner));
  cands.push(fmt(coef + 2, inner));
  if (inner > 2) cands.push(fmt(coef, inner + 2));
  if (inner > 3) cands.push(fmt(coef, inner - 1));
  return cands;
}

function generateExpressionDistractors(expr: string): string[] {
  const cands: string[] = [];
  // Flip +/- operators inside expression
  if (/[+-]/.test(expr)) {
    cands.push(
      expr.replace(/([a-zA-Z0-9)\]])\s*\+\s*/g, '$1 - ').replace(/([a-zA-Z0-9)\]])\s*-\s*/g, (m) => m)
    );
    // Targeted swap + <-> -
    const flipped = expr.replace(/(?<=[^\s=])\s*([+-])\s*(?=[^\s])/g, (_, op) => (op === '+' ? ' - ' : ' + '));
    cands.push(flipped);
  }

  // Perturb numbers inside the expression
  const nums = Array.from(expr.matchAll(/\d+/g));
  if (nums.length > 0) {
    const last = nums[nums.length - 1];
    const lastVal = parseInt(last[0], 10);
    const idx = last.index ?? 0;
    for (const delta of [1, -1, 2, -2, 3]) {
      const nextVal = lastVal + delta;
      if (nextVal > 0) {
        cands.push(expr.slice(0, idx) + String(nextVal) + expr.slice(idx + last[0].length));
      }
    }
    // Also perturb first number if multiple
    if (nums.length > 1) {
      const first = nums[0];
      const fVal = parseInt(first[0], 10);
      const fIdx = first.index ?? 0;
      for (const delta of [1, -1, 2]) {
        const nextVal = fVal + delta;
        if (nextVal > 0) {
          cands.push(expr.slice(0, fIdx) + String(nextVal) + expr.slice(fIdx + first[0].length));
        }
      }
    }
  }

  return cands;
}

/**
 * 단답형 답안을 분석해 규칙 기반 5지 선지를 생성합니다.
 * 긴 한국어 문장형 답안 등 자동 변형이 부적절한 경우 null을 반환합니다.
 */
export function generateChoicesFromShortAnswer(
  rawShortAnswer: string
): { choices: string[]; correctIndex: number } | null {
  const ans = (rawShortAnswer || '').trim();
  if (!ans) return null;

  // 긴 문장형 또는 소문항/줄바꿈 포함 시 규칙 기반 자동 생성 대상에서 제외
  if (ans.includes('\n')) return null;
  const koreanTokens = ans.match(/[가-힣]{2,}/g) || [];
  if (koreanTokens.length >= 2 && ans.length >= 16) return null;

  // 1. 순수 정수 또는 소수 (예: "16", "-4", "2.5")
  if (/^[+-]?\d+(?:\.\d+)?$/.test(ans)) {
    const num = Number(ans);
    if (!Number.isNaN(num)) {
      return shuffleWithAnswer(ans, generateNumericDistractors(num));
    }
  }

  // 2. 숫자 + 짧은 단위 (예: "12cm", "30°", "45도", "8개")
  const unitMatch = ans.match(/^([+-]?\d+(?:\.\d+)?)\s*(cm[23]?|mm[23]?|m[23]?|km[23]?|kg|g|°|도|개|명|원|초|분|배|%)$/i);
  if (unitMatch) {
    const num = Number(unitMatch[1]);
    const unit = unitMatch[2];
    if (!Number.isNaN(num)) {
      const dists = generateNumericDistractors(num).map((v) => `${v}${unit}`);
      return shuffleWithAnswer(ans, dists);
    }
  }

  // 3. 단순 분수 (예: "8/3", "-3/4")
  const fracMatch = ans.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den !== 0) {
      return shuffleWithAnswer(ans, generateFractionDistractors(num, den));
    }
  }

  // 4. 단순 제곱근 (예: "4√13", "-√3", "√5")
  const radMatch = ans.match(/^([+-]?\d*)√(\d+)$/);
  if (radMatch) {
    const inner = parseInt(radMatch[2], 10);
    return shuffleWithAnswer(ans, generateRadicalDistractors(radMatch[1], inner));
  }

  // 5. π 배수 (예: "3π", "-4π", "4π/3")
  const piMatch = ans.match(/^([+-]?\d*)π(?:\s*\/\s*(\d+))?$/);
  if (piMatch) {
    const coef = piMatch[1] === '' ? 1 : piMatch[1] === '-' ? -1 : parseInt(piMatch[1], 10);
    const den = piMatch[2] ? parseInt(piMatch[2], 10) : null;
    if (den) {
      const dists = generateFractionDistractors(coef, den).map((f) => {
        if (f === '1') return 'π';
        if (f === '-1') return '-π';
        if (f.includes('/')) {
          const [n, d] = f.split('/');
          const nPart = n === '1' ? '' : n === '-1' ? '-' : n;
          return `${nPart}π/${d}`;
        }
        return `${f}π`;
      });
      return shuffleWithAnswer(ans, dists);
    } else {
      const dists = generateNumericDistractors(coef).map((v) => {
        if (v === '0') return '0';
        if (v === '1') return 'π';
        if (v === '-1') return '-π';
        return `${v}π`;
      });
      return shuffleWithAnswer(ans, dists);
    }
  }

  // 6. 좌표쌍 (예: "(3, -2)")
  const coordMatch = ans.match(/^\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)$/);
  if (coordMatch) {
    const x = parseInt(coordMatch[1], 10);
    const y = parseInt(coordMatch[2], 10);
    const dists = [
      `(${y}, ${x})`,
      `(${-x}, ${y})`,
      `(${x}, ${-y})`,
      `(${-x}, ${-y})`,
      `(${x + 1}, ${y - 1})`,
      `(${x - 1}, ${y + 1})`,
    ];
    return shuffleWithAnswer(ans, dists);
  }

  // 7. 방정식 / 함수식 / 다항식 (예: "f(x) = 6x - 4", "y = 2x + 1", "(x+2)(x-3)")
  if (ans.length <= 36 && koreanTokens.length === 0) {
    const dists = generateExpressionDistractors(ans);
    if (dists.length >= 4) {
      return shuffleWithAnswer(ans, dists);
    }
  }

  return null;
}
