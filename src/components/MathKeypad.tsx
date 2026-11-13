'use client';

import React, { useState, useMemo } from 'react';
import katex from 'katex';
import { Delete, RotateCcw, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react';
import { toLatexForPreview } from '@/lib/mathFormulaUtils';

interface MathFormulaPreviewProps {
  value: string;
  theme?: 'dark' | 'light';
  size?: 'md' | 'lg';
  showHeader?: boolean;
  className?: string;
}

export function MathFormulaPreview({
  value,
  theme = 'dark',
  size = 'lg',
  showHeader = false,
  className = '',
}: MathFormulaPreviewProps) {
  const isDark = theme === 'dark';

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

  const sizeClass = size === 'lg' ? 'text-2xl py-1' : 'text-lg py-0.5';

  if (showHeader) {
    return (
      <div
        className={`rounded-2xl border px-3.5 py-2.5 flex flex-col justify-between gap-1.5 ${
          size === 'lg' ? 'min-h-[82px]' : 'min-h-[62px]'
        } ${
          isDark
            ? 'bg-gradient-to-br from-slate-900/95 to-indigo-950/60 border-violet-500/40 shadow-inner'
            : 'bg-slate-50 border-indigo-200 shadow-inner'
        } ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] font-black flex items-center gap-1 whitespace-nowrap ${
              isDark ? 'text-violet-300' : 'text-indigo-600'
            }`}
          >
            <Sparkles size={11} className="shrink-0" />
            입력된 수식 확인
          </span>
          {value && (
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-md max-w-[60%] truncate ${
                isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'
              }`}
              title={value}
            >
              {value}
            </span>
          )}
        </div>

        <div className="w-full flex items-center justify-center overflow-x-auto overflow-y-hidden no-scrollbar">
          {value && value.trim() ? (
            <span
              className={`inline-flex items-center font-bold leading-relaxed whitespace-nowrap ${sizeClass} ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <span
              className={`text-xs italic ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              수식을 입력하면 여기에 크게 미리보기가 표시됩니다
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!value || !value.trim()) {
    return (
      <span
        className={`text-xs italic ${
          isDark ? 'text-slate-500' : 'text-slate-400'
        } ${className}`}
      >
        수식을 입력하면 여기에 미리보기가 표시됩니다
      </span>
    );
  }

  return (
    <div className={`w-full overflow-x-auto overflow-y-hidden ${className}`}>
      <span
        className={`inline-flex items-center font-bold leading-relaxed whitespace-nowrap ${sizeClass} ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}

type KeypadTab = 'basic' | 'symbols' | 'high';

interface KeySpec {
  label: string;
  insert: string;
  cursorOffset?: number;
  variant?: 'default' | 'var' | 'op' | 'tpl' | 'geom' | 'sci';
  title?: string;
}

// ── [탭 1] 기본 수식: 중·고등 공용 핵심 대수·숫자·분수·루트 ──
const BASIC_VARS: KeySpec[] = [
  { label: 'x', insert: 'x', variant: 'var' },
  { label: 'y', insert: 'y', variant: 'var' },
  { label: 'a', insert: 'a', variant: 'var' },
  { label: 'b', insert: 'b', variant: 'var' },
  { label: 'c', insert: 'c', variant: 'var' },
  { label: 'n', insert: 'n', variant: 'var' },
];

const BASIC_MAIN_KEYS: KeySpec[] = [
  { label: '( )', insert: '()', cursorOffset: -1, variant: 'tpl', title: '괄호 묶기' },
  { label: '□²', insert: '^2', variant: 'tpl', title: '제곱' },
  { label: '□ⁿ', insert: '^()', cursorOffset: -1, variant: 'tpl', title: '거듭제곱' },
  { label: 'a/b', insert: '/', variant: 'tpl', title: '분수 슬래시' },
  { label: '√□', insert: '√()', cursorOffset: -1, variant: 'tpl', title: '제곱근 루트' },

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
  { label: '=', insert: '=', variant: 'op' },
  { label: '±', insert: '±', variant: 'op' },

  { label: '0', insert: '0' },
  { label: '.', insert: '.' },
  { label: ',', insert: ', ', title: '여러 개 답 구분' },
  { label: '(', insert: '(', variant: 'tpl' },
  { label: ')', insert: ')', variant: 'tpl' },
];

// ── [탭 2] 수식·기호: 중·고등 공용 심화 수식, 부등호, 도형 기호, 보조 문자 ──
const SYM_POWER_FRAC_KEYS: KeySpec[] = [
  { label: '(a)/(b)', insert: '()/()', cursorOffset: -4, variant: 'tpl', title: '다항식 분수' },
  { label: '³√□', insert: '3√()', cursorOffset: -1, variant: 'tpl', title: '세제곱근' },
  { label: 'ⁿ√□', insert: 'n√()', cursorOffset: -1, variant: 'tpl', title: 'n제곱근' },
  { label: '□³', insert: '^3', variant: 'tpl', title: '세제곱' },
  { label: '□⁻¹', insert: '^(-1)', variant: 'tpl', title: '역수(음수 지수)' },
  { label: '|□|', insert: '||', cursorOffset: -1, variant: 'tpl', title: '절댓값' },
  { label: '2ⁿ', insert: '2^()', cursorOffset: -1, variant: 'tpl', title: '2의 거듭제곱' },
  { label: '10ⁿ', insert: '10^()', cursorOffset: -1, variant: 'tpl', title: '10의 거듭제곱' },
];

const SYM_INEQUALITY_KEYS: KeySpec[] = [
  { label: '<', insert: '<', variant: 'op' },
  { label: '>', insert: '>', variant: 'op' },
  { label: '≤', insert: '≤', variant: 'op' },
  { label: '≥', insert: '≥', variant: 'op' },
  { label: '≠', insert: '≠', variant: 'op' },
  { label: ':', insert: ':', variant: 'op', title: '비례식 (예: 2:3)' },
  { label: '%', insert: '%', variant: 'op' },
  { label: '∞', insert: '∞', variant: 'op' },
];

const SYM_GEOM_KEYS: KeySpec[] = [
  { label: 'π', insert: 'π', variant: 'geom', title: '원주율 파이' },
  { label: '°', insert: '°', variant: 'geom', title: '각도 (°)' },
  { label: '∠', insert: '∠', variant: 'geom', title: '각 (예: ∠AOB)' },
  { label: '△', insert: '△', variant: 'geom', title: '삼각형' },
  { label: '□', insert: '□', variant: 'geom', title: '사각형' },
  { label: 'x̄', insert: '\u0305', variant: 'geom', title: '선분 윗줄/순환마디 추가' },
  { label: '⊥', insert: '⊥', variant: 'geom', title: '수직' },
  { label: '∥', insert: '∥', variant: 'geom', title: '평행' },
];

const SYM_EXTRA_VARS: KeySpec[] = [
  { label: 'z', insert: 'z', variant: 'var' },
  { label: 'k', insert: 'k', variant: 'var' },
  { label: 't', insert: 't', variant: 'var' },
  { label: 'm', insert: 'm', variant: 'var' },
  { label: 'α', insert: 'α', variant: 'var' },
  { label: 'β', insert: 'β', variant: 'var' },
];

// ── [탭 3] 고등·공학: 삼각함수, 지수·로그, 극한·미적분·집합 ──
const HIGH_TRIG_LOG_KEYS: KeySpec[] = [
  { label: 'e', insert: 'e', variant: 'sci', title: '자연상수 e' },
  { label: 'e^□', insert: 'e^()', cursorOffset: -1, variant: 'sci' },
  { label: 'ln( )', insert: 'ln()', cursorOffset: -1, variant: 'sci' },
  { label: 'log( )', insert: 'log()', cursorOffset: -1, variant: 'sci' },
  { label: 'sin( )', insert: 'sin()', cursorOffset: -1, variant: 'sci' },
  { label: 'cos( )', insert: 'cos()', cursorOffset: -1, variant: 'sci' },
  { label: 'tan( )', insert: 'tan()', cursorOffset: -1, variant: 'sci' },
  { label: 'logₐ', insert: 'log_()', cursorOffset: -3, variant: 'sci', title: '밑이 있는 로그' },
];

const HIGH_CALC_SET_KEYS: KeySpec[] = [
  { label: 'lim', insert: 'lim ', variant: 'tpl' },
  { label: '∑', insert: '∑', variant: 'tpl' },
  { label: '∫', insert: '∫', variant: 'tpl' },
  { label: 'θ', insert: 'θ', variant: 'var' },
  { label: 'i', insert: 'i', variant: 'var', title: '허수 단위 i' },
  { label: 'nPr', insert: 'P', variant: 'tpl', title: '순열 P' },
  { label: 'nCr', insert: 'C', variant: 'tpl', title: '조합 C' },
  { label: '!', insert: '!', variant: 'op', title: '계승(팩토리얼)' },
  { label: '∈', insert: '∈', variant: 'op' },
  { label: '⊂', insert: '⊂', variant: 'op' },
  { label: '∪', insert: '∪', variant: 'op' },
  { label: '∩', insert: '∩', variant: 'op' },
];

interface MathKeypadProps {
  value: string;
  onChange: (nextVal: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  theme?: 'dark' | 'light';
  compact?: boolean;
  showPreview?: boolean;
  grade?: string;
}

export default function MathKeypad({
  value,
  onChange,
  inputRef,
  theme = 'dark',
  compact = false,
  showPreview = true,
  grade,
}: MathKeypadProps) {
  const [activeTab, setActiveTab] = useState<KeypadTab>('basic');
  const isDark = theme === 'dark';
  const isHighSchool = Boolean(grade && (/고/.test(grade) || grade === 'ALL'));

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
        } catch {}
      });
    } else {
      onChange(`${currentVal}${spec.insert}`);
    }
  };

  const handleBackspace = () => {
    const el = inputRef?.current;
    const currentVal = value || '';
    if (!currentVal) return;

    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end) {
        onChange(currentVal.slice(0, start) + currentVal.slice(end));
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(start, start);
          } catch {}
        });
      } else if (start > 0) {
        onChange(currentVal.slice(0, start - 1) + currentVal.slice(start));
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
      ? 'px-1.5 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 cursor-pointer select-none flex items-center justify-center whitespace-nowrap'
      : 'px-2 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 cursor-pointer select-none flex items-center justify-center whitespace-nowrap';

    if (isDark) {
      switch (variant) {
        case 'var':
          return `${base} bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-400/35 font-serif italic`;
        case 'tpl':
          return `${base} bg-violet-500/25 hover:bg-violet-500/40 text-violet-200 border border-violet-400/35`;
        case 'op':
          return `${base} bg-white/10 hover:bg-white/20 text-amber-300 border border-white/10`;
        case 'geom':
          return `${base} bg-sky-500/18 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30`;
        case 'sci':
          return `${base} bg-emerald-500/18 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 text-xs`;
        default:
          return `${base} bg-white/8 hover:bg-white/15 text-white border border-white/10`;
      }
    }

    switch (variant) {
      case 'var':
        return `${base} bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-serif italic`;
      case 'tpl':
        return `${base} bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200`;
      case 'op':
        return `${base} bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200`;
      case 'geom':
        return `${base} bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200`;
      case 'sci':
        return `${base} bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs`;
      default:
        return `${base} bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200`;
    }
  };

  const sectionLabelClass = `text-[10px] font-black tracking-tight ${
    isDark ? 'text-slate-400' : 'text-slate-500'
  }`;

  return (
    <div
      className={`rounded-2xl border p-3 space-y-2.5 ${
        isDark
          ? 'bg-slate-900/90 border-violet-500/30 text-white shadow-xl'
          : 'bg-white border-indigo-200 text-slate-800 shadow-sm'
      }`}
    >
      {/* 1. 대형 실시간 수식 확인창 (스크롤바 버그 제거 & 높은 가독성) */}
      {showPreview && (
        <MathFormulaPreview
          value={value}
          theme={theme}
          size={compact ? 'md' : 'lg'}
          showHeader
        />
      )}

      {/* 2. 3탭 카테고리 (한글 잘림 없는 짧은 라벨 + 중/고등 구분) */}
      <div
        className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'
        }`}
      >
        {[
          { id: 'basic', label: '기본 수식' },
          { id: 'symbols', label: '수식·기호' },
          { id: 'high', label: isHighSchool ? '고등·공학' : '+ 고등·공학', muted: !isHighSchool },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as KeypadTab)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? isDark
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-indigo-600 shadow-xs'
                  : tab.muted
                  ? isDark
                    ? 'text-slate-500 hover:text-emerald-300'
                    : 'text-slate-400 hover:text-emerald-700'
                  : isDark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3-A. 기본 수식 (중·고등 공용 — 간결 레이아웃) */}
      {activeTab === 'basic' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-6 gap-1">
            {BASIC_VARS.map((k) => (
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

          <div className="grid grid-cols-5 gap-1.5">
            {BASIC_MAIN_KEYS.map((k) => (
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

      {/* 3-B. 수식·기호 (중·고등 공용 심화: 확장 분수/루트, 부등호/비, 도형, 보조문자) */}
      {activeTab === 'symbols' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <div className={sectionLabelClass}>분수 · 거듭제곱 · 루트 확장</div>
            <div className="grid grid-cols-4 gap-1.5">
              {SYM_POWER_FRAC_KEYS.map((k) => (
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

          <div className="space-y-1">
            <div className={sectionLabelClass}>부등호 · 비 · 관계</div>
            <div className="grid grid-cols-4 gap-1.5">
              {SYM_INEQUALITY_KEYS.map((k) => (
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

          <div className="space-y-1">
            <div className={sectionLabelClass}>도형 · 기하 · 원주율</div>
            <div className="grid grid-cols-4 gap-1.5">
              {SYM_GEOM_KEYS.map((k) => (
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

          <div className="space-y-1">
            <div className={sectionLabelClass}>보조 문자</div>
            <div className="grid grid-cols-6 gap-1">
              {SYM_EXTRA_VARS.map((k) => (
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
        </div>
      )}

      {/* 3-C. 고등·공학 전용 (삼각함수, 지수·로그, 극한·수열·미적분·집합) */}
      {activeTab === 'high' && (
        <div className="space-y-2.5">
          {!isHighSchool && (
            <div
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${
                isDark
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              💡 삼각함수·로그·미적분 등 <strong>고등 과정 전용</strong> 기호입니다.
            </div>
          )}

          <div className="space-y-1">
            <div className={sectionLabelClass}>지수 · 로그 · 삼각함수</div>
            <div className="grid grid-cols-4 gap-1.5">
              {HIGH_TRIG_LOG_KEYS.map((k) => (
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

          <div className="space-y-1">
            <div className={sectionLabelClass}>극한 · 수열 · 미적분 · 집합</div>
            <div className="grid grid-cols-4 gap-1.5">
              {HIGH_CALC_SET_KEYS.map((k) => (
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
        </div>
      )}

      {/* 4. 유틸리티 제어 바 (커서 이동 / 지우기 / 전체 초기화) */}
      <div
        className={`grid grid-cols-4 gap-1.5 pt-1.5 border-t ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => handleMoveCursor(-1)}
          className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-colors whitespace-nowrap ${
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
          className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-colors whitespace-nowrap ${
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
          className={`py-1.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
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
          className={`py-1.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
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
