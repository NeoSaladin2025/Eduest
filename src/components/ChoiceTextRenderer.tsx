'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { toLatexForPreview } from '@/lib/mathFormulaUtils';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderKatexToken(rawMath: string): string {
  const trimmed = rawMath.trim();
  if (!trimmed) return '';
  try {
    const latex = /\\[a-zA-Z]+/.test(trimmed) ? trimmed : toLatexForPreview(trimmed);
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      strict: false,
    });
  } catch {
    return escapeHtml(trimmed);
  }
}

/**
 * 한국어 문장과 수식이 섞여 있어도 줄바꿈이 자연스럽게 유지되도록
 * 수식 부분만 인라인 KaTeX HTML로 변환하고 일반 텍스트는 안전하게 이스케이프합니다.
 */
export function renderMixedMathToHtml(rawText: string): string {
  const text = String(rawText ?? '').trim();
  if (!text) return '';

  // 1. 명시적 $...$ 구분자가 포함된 경우
  if (/\$[^$]+\$/.test(text)) {
    const parts = text.split(/(\$[^$]+\$)/g);
    return parts
      .map((part) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
          return `<span class="inline-block align-middle max-w-full overflow-x-auto">${renderKatexToken(part.slice(1, -1))}</span>`;
        }
        return escapeHtml(part);
      })
      .join('');
  }

  const hasKorean = /[가-힣]/.test(text);
  const hasMathSyntax = /[\^_√/πθαβγ∞±×·÷≤≥≠≈∠△⊥∥≡°\u0305=\\]|([a-zA-Z]\s*\()/.test(text);

  // 2. 한글이 없는 순수 수식/식 표현인 경우 (단순 정수 제외)
  if (!hasKorean) {
    if (hasMathSyntax || /[a-zA-Z]/.test(text)) {
      return `<span class="inline-block align-middle max-w-full overflow-x-auto">${renderKatexToken(text)}</span>`;
    }
    return escapeHtml(text);
  }

  // 3. 한글 + 수식 혼합 문장: 수식 토큰만 분리해 KaTeX 렌더링하고 한글은 자연 줄바꿈 유지
  // 예: "x = 1에서 최솟값 -3, f(x) = 6x - 4일 때 8/3"
  const mathTokenRegex =
    /([A-Za-z](?:[A-Za-z0-9\u0305]*)\s*\([^()]+\)\s*=\s*[A-Za-z0-9+\-*/^_()√πθαβγ.\s]+(?=[가-힣,;\s]|$)|[A-Za-z0-9\u0305]+(?:\([^()]+\))?\s*[=≤≥≠<>]\s*[+-]?[A-Za-z0-9+\-*/^_()√πθαβγ.]+|[+-]?(?:\([^()]+\)|[A-Za-z0-9√πθαβγ]+)\s*\/\s*(?:\([^()]+\)|[A-Za-z0-9√πθαβγ]+)|[+-]?\d*√(?:\([^()]+\)|\d+)|[A-Za-z0-9)]\s*\^\s*(?:\([^()]+\)|[A-Za-z0-9+-]+)|(?:[A-Za-z]\u0305)+)/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathTokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, match.index));
    }
    const token = match[0].trim();
    result += `<span class="inline-block align-middle max-w-full overflow-x-auto">${renderKatexToken(token)}</span>`;
    // Preserve trailing whitespace if regex consumed it
    const trailingSpaces = match[0].length - match[0].trimEnd().length;
    if (trailingSpaces > 0) {
      result += ' '.repeat(trailingSpaces);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
}

interface ChoiceTextRendererProps {
  text: string;
  className?: string;
}

export default function ChoiceTextRenderer({ text, className = '' }: ChoiceTextRendererProps) {
  const html = useMemo(() => renderMixedMathToHtml(text), [text]);

  return (
    <span
      className={`whitespace-normal break-words leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
