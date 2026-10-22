'use client';

import React from 'react';
import { ExamFilterChip, FilterChipColor, FilterChipEffect } from '@/app/api/test2/filter-chips/route';
import { Sparkles } from 'lucide-react';

export type FilterChip = ExamFilterChip;
export type { ExamFilterChip };

interface FilterChipBadgeProps {
  chip: ExamFilterChip;
  size?: 'xs' | 'sm' | 'md';
  isActive?: boolean;
  isSelected?: boolean;
  count?: number;
  badgeCount?: number;
  onClick?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  showActions?: boolean;
  className?: string;
}

// 🎨 12종 컬러 팔레트 스타일 매핑
export const CHIP_COLOR_MAP: Record<FilterChipColor, {
  label: string;
  dotBg: string;
  border: string;
  bgLight: string;
  textLight: string;
  bgActive: string;
  textActive: string;
  glowShadow: string;
  pulseColor: string;
  ringColor: string;
  gradientFrom: string;
  gradientTo: string;
}> = {
  violet: {
    label: '보라',
    dotBg: 'bg-violet-600',
    border: 'border-violet-300',
    bgLight: 'bg-violet-50 text-violet-700',
    textLight: 'text-violet-700',
    bgActive: 'bg-violet-600 text-white shadow-violet-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-violet-300/60',
    pulseColor: 'bg-violet-500',
    ringColor: 'ring-2 ring-violet-400 ring-offset-1',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-purple-600',
  },
  indigo: {
    label: '인디고',
    dotBg: 'bg-indigo-600',
    border: 'border-indigo-300',
    bgLight: 'bg-indigo-50 text-indigo-700',
    textLight: 'text-indigo-700',
    bgActive: 'bg-indigo-600 text-white shadow-indigo-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-indigo-300/60',
    pulseColor: 'bg-indigo-500',
    ringColor: 'ring-2 ring-indigo-400 ring-offset-1',
    gradientFrom: 'from-indigo-600',
    gradientTo: 'to-blue-600',
  },
  blue: {
    label: '블루',
    dotBg: 'bg-blue-600',
    border: 'border-blue-300',
    bgLight: 'bg-blue-50 text-blue-700',
    textLight: 'text-blue-700',
    bgActive: 'bg-blue-600 text-white shadow-blue-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-blue-300/60',
    pulseColor: 'bg-blue-500',
    ringColor: 'ring-2 ring-blue-400 ring-offset-1',
    gradientFrom: 'from-blue-600',
    gradientTo: 'to-cyan-600',
  },
  cyan: {
    label: '시안',
    dotBg: 'bg-cyan-600',
    border: 'border-cyan-300',
    bgLight: 'bg-cyan-50 text-cyan-800',
    textLight: 'text-cyan-800',
    bgActive: 'bg-cyan-600 text-white shadow-cyan-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-cyan-300/60',
    pulseColor: 'bg-cyan-500',
    ringColor: 'ring-2 ring-cyan-400 ring-offset-1',
    gradientFrom: 'from-cyan-600',
    gradientTo: 'to-teal-600',
  },
  emerald: {
    label: '에메랄드',
    dotBg: 'bg-emerald-600',
    border: 'border-emerald-300',
    bgLight: 'bg-emerald-50 text-emerald-800',
    textLight: 'text-emerald-800',
    bgActive: 'bg-emerald-600 text-white shadow-emerald-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-emerald-300/60',
    pulseColor: 'bg-emerald-500',
    ringColor: 'ring-2 ring-emerald-400 ring-offset-1',
    gradientFrom: 'from-emerald-600',
    gradientTo: 'to-teal-600',
  },
  lime: {
    label: '라임',
    dotBg: 'bg-lime-600',
    border: 'border-lime-300',
    bgLight: 'bg-lime-50 text-lime-900',
    textLight: 'text-lime-900',
    bgActive: 'bg-lime-600 text-white shadow-lime-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-lime-300/60',
    pulseColor: 'bg-lime-500',
    ringColor: 'ring-2 ring-lime-400 ring-offset-1',
    gradientFrom: 'from-lime-600',
    gradientTo: 'to-emerald-600',
  },
  amber: {
    label: '앰버',
    dotBg: 'bg-amber-600',
    border: 'border-amber-300',
    bgLight: 'bg-amber-50 text-amber-900',
    textLight: 'text-amber-900',
    bgActive: 'bg-amber-600 text-white shadow-amber-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-amber-300/60',
    pulseColor: 'bg-amber-500',
    ringColor: 'ring-2 ring-amber-400 ring-offset-1',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-600',
  },
  rose: {
    label: '로즈',
    dotBg: 'bg-rose-600',
    border: 'border-rose-300',
    bgLight: 'bg-rose-50 text-rose-800',
    textLight: 'text-rose-800',
    bgActive: 'bg-rose-600 text-white shadow-rose-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-rose-300/60',
    pulseColor: 'bg-rose-500',
    ringColor: 'ring-2 ring-rose-400 ring-offset-1',
    gradientFrom: 'from-rose-600',
    gradientTo: 'to-pink-600',
  },
  pink: {
    label: '핑크',
    dotBg: 'bg-pink-600',
    border: 'border-pink-300',
    bgLight: 'bg-pink-50 text-pink-800',
    textLight: 'text-pink-800',
    bgActive: 'bg-pink-600 text-white shadow-pink-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-pink-300/60',
    pulseColor: 'bg-pink-500',
    ringColor: 'ring-2 ring-pink-400 ring-offset-1',
    gradientFrom: 'from-pink-600',
    gradientTo: 'to-rose-600',
  },
  fuchsia: {
    label: '푸시아',
    dotBg: 'bg-fuchsia-600',
    border: 'border-fuchsia-300',
    bgLight: 'bg-fuchsia-50 text-fuchsia-900',
    textLight: 'text-fuchsia-900',
    bgActive: 'bg-fuchsia-600 text-white shadow-fuchsia-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-fuchsia-300/60',
    pulseColor: 'bg-fuchsia-500',
    ringColor: 'ring-2 ring-fuchsia-400 ring-offset-1',
    gradientFrom: 'from-fuchsia-600',
    gradientTo: 'to-purple-600',
  },
  cloud: {
    label: '클라우드',
    dotBg: 'bg-sky-500',
    border: 'border-sky-300',
    bgLight: 'bg-sky-50 text-sky-800',
    textLight: 'text-sky-800',
    bgActive: 'bg-sky-600 text-white shadow-sky-200',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-sky-300/60',
    pulseColor: 'bg-sky-500',
    ringColor: 'ring-2 ring-sky-400 ring-offset-1',
    gradientFrom: 'from-sky-500',
    gradientTo: 'to-indigo-500',
  },
  slate: {
    label: '슬레이트',
    dotBg: 'bg-slate-700',
    border: 'border-slate-300',
    bgLight: 'bg-slate-100 text-slate-800',
    textLight: 'text-slate-800',
    bgActive: 'bg-slate-800 text-white shadow-slate-300',
    textActive: 'text-white',
    glowShadow: 'shadow-md shadow-slate-400/50',
    pulseColor: 'bg-slate-600',
    ringColor: 'ring-2 ring-slate-400 ring-offset-1',
    gradientFrom: 'from-slate-700',
    gradientTo: 'to-neutral-900',
  },
};

// ✨ 6종 시각 효과 메타데이터
export const CHIP_EFFECT_OPTIONS: { id: FilterChipEffect; name: string; desc: string; icon: string }[] = [
  { id: 'clean', name: '기본 깔끔', desc: '군더더기 없는 모던 심플 뱃지', icon: '🏷️' },
  { id: 'glow', name: '네온 글로우', desc: '은은한 네온 광채 발광 그림자', icon: '✨' },
  { id: 'pulse', name: '펄스 비트', desc: '깜빡이는 생동감 강조 인디케이터 점', icon: '💓' },
  { id: 'sparkle', name: '반짝임 글래스', desc: '유리 질감 블러 & 별빛 반짝임', icon: '⭐' },
  { id: 'ring', name: '강조 링', desc: '선명하고 또렷한 굵은 외곽선 링', icon: '🎯' },
  { id: 'gradient', name: '비비드 그라데이션', desc: '감각적인 투톤 그라데이션', icon: '🌈' },
];

export default function FilterChipBadge({
  chip,
  size = 'sm',
  isActive = false,
  isSelected,
  count,
  badgeCount,
  onClick,
  onEdit,
  onDelete,
  showActions = false,
  className = '',
}: FilterChipBadgeProps) {
  const active = isSelected !== undefined ? isSelected : isActive;
  const displayCount = badgeCount !== undefined ? badgeCount : count;

  const color = chip.color || 'violet';
  const effect = chip.effect || 'clean';
  const theme = CHIP_COLOR_MAP[color] || CHIP_COLOR_MAP.violet;

  // 크기별 패딩/폰트
  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 rounded-md gap-1',
    sm: 'text-[11px] px-2.5 py-1 rounded-lg gap-1.5',
    md: 'text-xs px-3 py-1.5 rounded-xl gap-2',
  }[size];

  // 효과별 클래스 조합
  let effectClass = '';
  if (effect === 'glow') {
    effectClass = theme.glowShadow;
  } else if (effect === 'ring') {
    effectClass = theme.ringColor;
  } else if (effect === 'gradient' && !active) {
    effectClass = `bg-gradient-to-r ${theme.gradientFrom} ${theme.gradientTo} text-white border-transparent shadow-xs`;
  } else if (effect === 'sparkle') {
    effectClass = 'backdrop-blur-xs border-dashed';
  }

  // 활성화 여부에 따른 배경/텍스트 클래스
  let activeStateClass = '';
  if (active) {
    activeStateClass = `${theme.bgActive} border-transparent font-black scale-105 shadow-sm`;
  } else if (effect !== 'gradient') {
    activeStateClass = `${theme.bgLight} border ${theme.border} hover:opacity-90`;
  }

  const isClickable = !!onClick;

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center font-bold transition-all duration-150 select-none ${sizeClasses} ${activeStateClass} ${effectClass} ${
        isClickable ? 'cursor-pointer hover:scale-102 active:scale-98' : ''
      } ${className}`}
    >
      {/* 💓 펄스 효과일 경우 애니메이션 점 렌더링 */}
      {effect === 'pulse' && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.pulseColor} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${theme.pulseColor}`} />
        </span>
      )}

      {/* ⭐ 반짝임 효과일 경우 스파클 아이콘 */}
      {effect === 'sparkle' && (
        <Sparkles size={size === 'xs' ? 9 : 11} className={active ? 'text-white' : theme.textLight} />
      )}

      {/* 아이콘/이모지 (설정된 경우) */}
      {chip.icon && (
        <span className="leading-none shrink-0">{chip.icon}</span>
      )}

      {/* 칩 이름 */}
      <span className="truncate">{chip.name}</span>

      {/* 카운트 (개수) */}
      {typeof displayCount === 'number' && (
        <span
          className={`text-[9px] px-1 py-0.2 rounded-full font-black ${
            active ? 'bg-white/25 text-white' : 'bg-black/10 text-current'
          }`}
        >
          {displayCount}
        </span>
      )}

      {/* 수정/삭제 액션 버튼 (관리 화면용) */}
      {showActions && (
        <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-0.5 hover:bg-black/10 rounded text-[10px] font-bold"
              title="수정"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-0.5 hover:bg-rose-500 hover:text-white rounded text-[10px] font-bold text-rose-600"
              title="삭제 (시험지는 안전 보존)"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </span>
  );
}
