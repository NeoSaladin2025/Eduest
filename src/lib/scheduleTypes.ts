export type ScheduleType = 'ACADEMIC' | 'SPECIAL';
export type VisualEffect = 'normal' | 'glow' | 'shake' | 'sparkle' | 'stamp';

export interface ScheduleItem {
  id: string;
  type: ScheduleType; // ACADEMIC: 각 학교 시험일정, SPECIAL: 주요일정(포스트잇 메모)
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  schoolName?: string; // 학교명 (학사일정)
  grade?: string; // 학년 (예: '중2', '중3', '고1', '공통' 등)
  examType?: string; // 시험명 (1학기 중간, 2학기 기말 등)
  color: string; // 'rose' | 'amber' | 'emerald' | 'indigo' | 'purple' | 'yellow' | 'pink' | 'cyan'
  effect?: VisualEffect; // 시각 효과 (번쩍임 glow, 떨림 shake, 도장 stamp, 반짝임 sparkle)
  content?: string; // 상세 메모 (포스트잇 내용)
  author?: string;
  createdAt: string;
  updatedAt: string;
}

export const SCHEDULES_STORAGE_KEY = 'eduest_schedules_v1';

// 날짜 범위 확인 헬퍼 (YYYY-MM-DD)
export function isDateInScheduleRange(dateStr: string, startDate: string, endDate: string): boolean {
  return dateStr >= startDate && dateStr <= endDate;
}

// 색상 프리셋 매핑
export const COLOR_PRESETS: Record<string, {
  name: string;
  bg: string;
  border: string;
  text: string;
  lightBg: string;
  badgeBg: string;
  badgeText: string;
  postItBg: string;
  shadow: string;
}> = {
  yellow: {
    name: '클래식 옐로우',
    bg: 'bg-amber-400',
    border: 'border-amber-300',
    text: 'text-amber-950',
    lightBg: 'bg-amber-50',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    postItBg: 'bg-yellow-200/90',
    shadow: 'shadow-amber-200/50',
  },
  pink: {
    name: '러블리 핑크',
    bg: 'bg-rose-400',
    border: 'border-rose-300',
    text: 'text-rose-950',
    lightBg: 'bg-rose-50',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    postItBg: 'bg-rose-200/90',
    shadow: 'shadow-rose-200/50',
  },
  mint: {
    name: '민트 그린',
    bg: 'bg-emerald-400',
    border: 'border-emerald-300',
    text: 'text-emerald-950',
    lightBg: 'bg-emerald-50',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    postItBg: 'bg-emerald-200/90',
    shadow: 'shadow-emerald-200/50',
  },
  indigo: {
    name: '스마트 인디고',
    bg: 'bg-indigo-500',
    border: 'border-indigo-400',
    text: 'text-indigo-950',
    lightBg: 'bg-indigo-50',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    postItBg: 'bg-indigo-200/90',
    shadow: 'shadow-indigo-200/50',
  },
  purple: {
    name: '매직 바이올렛',
    bg: 'bg-purple-500',
    border: 'border-purple-400',
    text: 'text-purple-950',
    lightBg: 'bg-purple-50',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    postItBg: 'bg-purple-200/90',
    shadow: 'shadow-purple-200/50',
  },
  cyan: {
    name: '스카이 블루',
    bg: 'bg-sky-400',
    border: 'border-sky-300',
    text: 'text-sky-950',
    lightBg: 'bg-sky-50',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    postItBg: 'bg-sky-200/90',
    shadow: 'shadow-sky-200/50',
  },
  orange: {
    name: '에너제틱 오렌지',
    bg: 'bg-orange-400',
    border: 'border-orange-300',
    text: 'text-orange-950',
    lightBg: 'bg-orange-50',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
    postItBg: 'bg-orange-200/90',
    shadow: 'shadow-orange-200/50',
  },
};
