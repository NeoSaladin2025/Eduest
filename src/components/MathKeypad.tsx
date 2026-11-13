'use client';

import React, { useState, useMemo } from 'react';
import katex from 'katex';
import { Delete, RotateCcw, Calculator, ArrowLeft, ArrowRight } from 'lucide-react';
import { toLatexForPreview } from '@/lib/mathFormulaUtils';

interface MathFormulaPreviewProps {
  value: string;
  theme?: 'dark' | 'light';
  className?: string;
}

export function MathFormulaPreview({ value, theme = 'dark', className = '' }: MathFormulaPreviewProps) {
  const renderedHtml = useMemo(() => {
    if (!value || !value.trim()) return '';
    try {
      const latex = toLatexForPreview(value);
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [value]);

  if (!value || !value.trim()) {
    return (
      <span className={`text-xs italic ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'} ${className}`}>
        수식을 입력하면 여기에 미리보기가 표시됩니다
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'} ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

type KeypadTab = 'factor' | 'frac_root' | 'sci' | 'geom';

interface KeySpec {
  label: string;
  insert: string;
  cursorOffset?: number; // 삽입 끝에서 뒤로 몇 글자 이동할지 (예: "()" -> -1)
  variant?: 'default' | 'var' | 'op' | 'tpl' | 'sci';
  title?: string;
}

const FACTOR_VARS: KeySpec[] = [
  { label: 'x', insert: 'x', variant: 'var' },
  { label: 'y', insert: 'y', variant: 'var' },
  { label: 'z', insert: 'z', variant: 'var' },
  { label: 'a', insert: 'a', variant: 'var' },
  { label: 'b', insert: 'b', variant: 'var' },
  { label: 'c', insert: 'c', variant: 'var' },
  { label: 'n', insert: 'n', variant: 'var' },
  { label: 'k', insert: 'k', variant: 'var' },
];

const FACTOR_MAIN_KEYS: KeySpec[] = [
  { label: '(', insert: '(', variant: 'tpl' },
  { label: ')', insert: ')', variant: 'tpl' },
  { label: '( □ )', insert: '()', cursorOffset: -1, variant: 'tpl', title: '괄호 묶기' },
  { label: '□²', insert: '^2', variant: 'tpl', title: '제곱' },
  { label: '□ⁿ', insert: '^()', cursorOffset: -1, variant: 'tpl', title: '거듭제곱' },

  { label: '7', insert: '7' },
  { label: '8', insert: '8' },
  { label: '9', insert: '9' },
  { label: '+', insert: '+', variant: 'op' },
  { label: '-', insert: '-', variant: 'op' },

  { label: '4', insert: '4' },
  { label: '5', insert: '5' },
  { label: '6', insert: '6' },
  { label: '×', insert: '×', variant: 'op' },
  { label: '÷', insert: '÷', variant: 'op' },

  { label: '1', insert: '1' },
  { label: '2', insert: '2' },
  { label: '3', insert: '3' },
  { label: 'a/b', insert: '/', variant: 'tpl', title: '분수 슬래시' },
  { label: '√□', insert: '√()', cursorOffset: -1, variant: 'tpl', title: '제곱근 루트' },

  { label: '0', insert: '0' },
  { label: '.', insert: '.' },
  { label: ',', insert: ', ', title: '복수 정답 구분' },
  { label: '=', insert: '=', variant: 'op' },
  { label: '±', insert: '±', variant: 'op' },
];

const QUICK_SCI_STRIP: KeySpec[] = [
  { label: 'e', insert: 'e', variant: 'sci' },
  { label: 'π', insert: 'π', variant: 'sci' },
  { label: 'ln', insert: 'ln()', cursorOffset: -1, variant: 'sci' },
  { label: 'log', insert: 'log()', cursorOffset: -1, variant: 'sci' },
  { label: 'sin', insert: 'sin()', cursorOffset: -1, variant: 'sci' },
  { label: 'cos', insert: 'cos()', cursorOffset: -1, variant: 'sci' },
  { label: 'tan', insert: 'tan()', cursorOffset: -1, variant: 'sci' },
];

const FRAC_ROOT_KEYS: KeySpec[] = [
  { label: '(a)/(b)', insert: '()/()', cursorOffset: -4, variant: 'tpl', title: '식/식 분수' },
  { label: 'a/b', insert: '/', variant: 'tpl', title: '단순 분수' },
  { label: '√□', insert: '√()', cursorOffset: -1, variant: 'tpl' },
  { label: '³√□', insert: '3√()', cursorOffset: -1, variant: 'tpl' },
  { label: 'ⁿ√□', insert: 'n√()', cursorOffset: -1, variant: 'tpl' },
  { label: '□²', insert: '^2', variant: 'tpl' },
  { label: '□³', insert: '^3', variant: 'tpl' },
  { label: '□⁻¹', insert: '^(-1)', variant: 'tpl' },
  { label: '□ⁿ', insert: '^()', cursorOffset: -1, variant: 'tpl' },
  { label: '|□|', insert: '||', cursorOffset: -1, variant: 'tpl' },
  { label: '10ⁿ', insert: '10^()', cursorOffset: -1, variant: 'tpl' },
  { label: '2ⁿ', insert: '2^()', cursorOffset: -1, variant: 'tpl' },
  { label: '( )', insert: '()', cursorOffset: -1, variant: 'op' },
  { label: '+', insert: '+', variant: 'op' },
  { label: '-', insert: '-', variant: 'op' },
];

const SCI_KEYS: KeySpec[] = [
  { label: 'e', insert: 'e', variant: 'sci' },
  { label: 'π', insert: 'π', variant: 'sci' },
  { label: '∞', insert: '∞', variant: 'sci' },
  { label: 'e^□', insert: 'e^()', cursorOffset: -1, variant: 'sci' },
  { label: 'ln(□)', insert: 'ln()', cursorOffset: -1, variant: 'sci' },
  { label: 'log(□)', insert: 'log()', cursorOffset: -1, variant: 'sci' },
  { label: 'logₐ(b)', insert: 'log_()', cursorOffset: -3, variant: 'sci', title: '밑이 있는 로그' },
  { label: 'sin(□)', insert: 'sin()', cursorOffset: -1, variant: 'sci' },
  { label: 'cos(□)', insert: 'cos()', cursorOffset: -1, variant: 'sci' },
  { label: 'tan(□)', insert: 'tan()', cursorOffset: -1, variant: 'sci' },
  { label: 'θ', insert: 'θ', variant: 'var' },
  { label: '°', insert: '°', variant: 'op' },
  { label: 'x', insert: 'x', variant: 'var' },
  { label: '(', insert: '(', variant: 'op' },
  { label: ')', insert: ')', variant: 'op' },
];

const GEOM_KEYS: KeySpec[] = [
  { label: '∠', insert: '∠', variant: 'tpl' },
  { label: '△', insert: '△', variant: 'tpl' },
  { label: '□', insert: '□', variant: 'tpl' },
  { label: '⊥', insert: '⊥', variant: 'op' },
  { label: '∥', insert: '∥', variant: 'op' },
  { label: '≡', insert: '≡', variant: 'op' },
  { label: '∽', insert: '∽', variant: 'op' },
  { label: '°', insert: '°', variant: 'op' },
  { label: 'α', insert: 'α', variant: 'var' },
  { label: 'β', insert: 'β', variant: 'var' },
  { label: 'γ', insert: 'γ', variant: 'var' },
  { label: '≤', insert: '≤', variant: 'op' },
  { label: '≥', insert: '≥', variant: 'op' },
  { label: '≠', insert: '≠', variant: 'op' },
  { label: '∈', insert: '∈', variant: 'op' },
  { label: '⊂', insert: '⊂', variant: 'op' },
  { label: '∪', insert: '∪', variant: 'op' },
  { label: '∩', insert: '∩', variant: 'op' },
  { label: '∅', insert: '∅', variant: 'op' },
  { label: ':', insert: ':', variant: 'op' },
];

interface MathKeypadProps {
  value: string;
  onChange: (nextVal: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  theme?: 'dark' | 'light';
  compact?: boolean;
  showPreview?: boolean;
}

export default function MathKeypad({
  value,
  onChange,
  inputRef,
  theme = 'dark',
  compact = false,
  showPreview = true,
}: MathKeypadProps) {
  const [activeTab, setActiveTab] = useState<KeypadTab>('factor');

  const isDark = theme === 'dark';

  // 현재 커서 위치에 토큰 삽입
  const handleInsertToken = (spec: KeySpec) => {
    const el = inputRef?.current;
    const currentVal = value || '';

    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = currentVal.slice(0, start);
      const after = currentVal.slice(end);
      const nextVal = `${before}${spec.insert}${after}`;
      onChange(nextVal);

      const nextCursor = start + spec.insert.length + (spec.cursorOffset || 0);
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(nextCursor, nextCursor);
        } catch {
          // ignore selection errors
        }
      });
    } else {
      const nextVal = `${currentVal}${spec.insert}`;
      onChange(nextVal);
    }
  };

  // 커서 앞 1글자 지우기
  const handleBackspace = () => {
    const el = inputRef?.current;
    const currentVal = value || '';
    if (!currentVal) return;

    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end) {
        const nextVal = currentVal.slice(0, start) + currentVal.slice(end);
        onChange(nextVal);
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(start, start);
          } catch {}
        });
      } else if (start > 0) {
        const nextVal = currentVal.slice(0, start - 1) + currentVal.slice(start);
        onChange(nextVal);
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(start - 1, start - 1);
          } catch {}
        });
      }
    } else {
      onChange(currentVal.slice(0, -1));
    }
  };

  // 커서 좌우 이동
  const handleMoveCursor = (delta: number) => {
    const el = inputRef?.current;
    if (!el || typeof el.selectionStart !== 'number') return;
    const nextPos = Math.max(0, Math.min((value || '').length, el.selectionStart + delta));
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(nextPos, nextPos);
      } catch {}
    });
  };

  const getBtnClass = (variant: KeySpec['variant'] = 'default') => {
    const base = compact
      ? 'px-2 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 cursor-pointer select-none flex items-center justify-center'
      : 'px-2 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 cursor-pointer select-none flex items-center justify-center';

    if (isDark) {
      switch (variant) {
        case 'var':
          return `${base} bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-400/30 font-serif italic`;
        case 'tpl':
          return `${base} bg-violet-500/25 hover:bg-violet-500/40 text-violet-200 border border-violet-400/35`;
        case 'op':
          return `${base} bg-white/10 hover:bg-white/20 text-amber-300 border border-white/10`;
        case 'sci':
          return `${base} bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/25 text-xs`;
        default:
          return `${base} bg-white/8 hover:bg-white/15 text-white border border-white/10`;
      }
    } else {
      switch (variant) {
        case 'var':
          return `${base} bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-serif italic`;
        case 'tpl':
          return `${base} bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200`;
        case 'op':
          return `${base} bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200`;
        case 'sci':
          return `${base} bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs`;
        default:
          return `${base} bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200`;
      }
    }
  };

  return (
    <div
      className={`rounded-2xl border p-3 space-y-2.5 ${
        isDark
          ? 'bg-slate-900/90 border-violet-500/30 text-white shadow-xl'
          : 'bg-white border-indigo-200 text-slate-800 shadow-sm'
      }`}
    >
      {/* 실시간 수식 미리보기 바 */}
      {showPreview && (
        <div
          className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 min-h-[40px] ${
            isDark
              ? 'bg-black/40 border-white/10'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
            <Calculator size={13} className={isDark ? 'text-violet-400 shrink-0' : 'text-indigo-600 shrink-0'} />
            <MathFormulaPreview value={value} theme={theme} className={compact ? 'text-sm' : 'text-base'} />
          </div>
          {value && (
            <span className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
              {value}
            </span>
          )}
        </div>
      )}

      {/* 카테고리 탭 */}
      <div
        className={`grid grid-cols-4 gap-1 p-1 rounded-xl border ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'
        }`}
      >
        {[
          { id: 'factor', label: '인수분해/대수' },
          { id: 'frac_root', label: '분수/루트/지수' },
          { id: 'sci', label: '공학(log·삼각)' },
          { id: 'geom', label: '기하/기호' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as KeypadTab)}
              className={`py-1.5 px-1 rounded-lg text-[10px] sm:text-[11px] font-black transition-all cursor-pointer truncate ${
                isActive
                  ? isDark
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-indigo-600 shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭별 키패드 본체 */}
      {activeTab === 'factor' && (
        <div className="space-y-2">
          {/* 알파벳 변수 스트립 */}
          <div className="grid grid-cols-8 gap-1">
            {FACTOR_VARS.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => handleInsertToken(k)}
                className={getBtnClass(k.variant)}
                title={k.title}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* 숫자 + 괄호 + 연산 + 핵심 수식 템플릿 5x5 */}
          <div className="grid grid-cols-5 gap-1.5">
            {FACTOR_MAIN_KEYS.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => handleInsertToken(k)}
                className={getBtnClass(k.variant)}
                title={k.title}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* 하단 공학용 퀵 스트립 */}
          <div className="grid grid-cols-7 gap-1 pt-0.5">
            {QUICK_SCI_STRIP.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => handleInsertToken(k)}
                className={getBtnClass(k.variant)}
                title={k.title}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'frac_root' && (
        <div className="grid grid-cols-5 gap-1.5">
          {FRAC_ROOT_KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => handleInsertToken(k)}
              className={getBtnClass(k.variant)}
              title={k.title}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'sci' && (
        <div className="grid grid-cols-5 gap-1.5">
          {SCI_KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => handleInsertToken(k)}
              className={getBtnClass(k.variant)}
              title={k.title}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'geom' && (
        <div className="grid grid-cols-5 gap-1.5">
          {GEOM_KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => handleInsertToken(k)}
              className={getBtnClass(k.variant)}
              title={k.title}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {/* 유틸리티 제어 바 (커서 이동 / 지우기 / 전체 초기화) */}
      <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={() => handleMoveCursor(-1)}
          className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
            isDark
              ? 'bg-white/8 hover:bg-white/15 text-slate-300'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
          title="커서 왼쪽 이동"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => handleMoveCursor(1)}
          className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
            isDark
              ? 'bg-white/8 hover:bg-white/15 text-slate-300'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
          title="커서 오른쪽 이동"
        >
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          className={`py-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-colors ${
            isDark
              ? 'bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/30'
              : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
          }`}
        >
          <Delete size={13} />
          <span>지우기</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          className={`py-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-colors ${
            isDark
              ? 'bg-slate-700/70 hover:bg-slate-700 text-slate-200'
              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
          }`}
        >
          <RotateCcw size={12} />
          <span>초기화</span>
        </button>
      </div>
    </div>
  );
}
