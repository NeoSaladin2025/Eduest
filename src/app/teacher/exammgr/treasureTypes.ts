// 💎 보물회수 (Treasure Retrieval) 시스템 공통 타입 및 유틸리티

export type TimeAttackMode = 'percent' | 'manual' | 'variable_percent' | 'fixed';

export interface TreasureConfig {
  enabled: boolean;
  total_rounds: number; // 회차수 (1 ~ 무제한)
  enable_shuffle: boolean; // 매 회차 문항 믹싱 (셔플)
  time_attack_mode: TimeAttackMode; // 타임어택 방식
  base_duration_min: number; // 1회차 기준 시간 (분)
  percent_reduction: number; // 일괄 % 감소율
  manual_durations?: number[]; // 회차별 직접 입력 시간
  variable_reductions?: number[]; // 회차 사이별 가변 % 감소율
}

export interface TreasureTemplate {
  id: string;
  name: string;
  total_rounds: number;
  enable_shuffle: boolean;
  time_attack_mode: TimeAttackMode;
  percent_reduction: number;
  manual_durations?: number[];
  variable_reductions?: number[];
  is_custom?: boolean;
}

export const DEFAULT_TREASURE_TEMPLATES: TreasureTemplate[] = [
  {
    id: 'tpl_standard',
    name: '🥇 [표준 3회차] 스마트 타임어택 (10% 감소, 믹싱 ON)',
    total_rounds: 3,
    enable_shuffle: true,
    time_attack_mode: 'percent',
    percent_reduction: 10,
  },
  {
    id: 'tpl_sparta',
    name: '🔥 [스파르타 4회차] 익스트림 압축 (가변 급속 단축, 믹싱 ON)',
    total_rounds: 4,
    enable_shuffle: true,
    time_attack_mode: 'variable_percent',
    percent_reduction: 15,
    variable_reductions: [10, 20, 30],
  },
  {
    id: 'tpl_steady',
    name: '🔄 [안정 2회차] 오답 복습 (동일 시간 반복, 믹싱 ON)',
    total_rounds: 2,
    enable_shuffle: true,
    time_attack_mode: 'fixed',
    percent_reduction: 0,
  },
];

// ⏱️ 특정 회차의 제한 시간 계산 헬퍼
export function calculateRoundDuration(
  baseMin: number,
  round: number, // 1-indexed (1, 2, 3...)
  mode: TimeAttackMode,
  percentReduction: number,
  manualDurations?: number[],
  variableReductions?: number[]
): number {
  if (baseMin <= 0) return 0; // 무제한
  if (round <= 1) return baseMin;

  if (mode === 'fixed') {
    return baseMin;
  }

  if (mode === 'manual' && manualDurations && manualDurations.length >= round) {
    const custom = manualDurations[round - 1];
    if (typeof custom === 'number' && custom > 0) return custom;
  }

  if (mode === 'percent') {
    // 1회차 대비 회차마다 percentReduction% 씩 단축 (최소 1분 보장)
    const reductionFactor = 1 - (percentReduction / 100) * (round - 1);
    const computed = Math.round(baseMin * Math.max(0.1, reductionFactor));
    return Math.max(1, computed);
  }

  if (mode === 'variable_percent' && variableReductions) {
    let current = baseMin;
    for (let r = 2; r <= round; r++) {
      const p = variableReductions[r - 2] ?? percentReduction;
      current = Math.round(current * (1 - p / 100));
    }
    return Math.max(1, current);
  }

  return baseMin;
}

// 🔀 Fisher-Yates 배열 무작위 셔플 헬퍼 (문제 믹싱용)
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
