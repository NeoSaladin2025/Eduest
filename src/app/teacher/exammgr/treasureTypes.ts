// 💎 보물회수 (Treasure Retrieval) 시스템 공통 타입 및 유틸리티

export type TimeAttackMode = 'percent' | 'manual' | 'variable_percent' | 'fixed';

export type InstallmentRecallMode = 'per_set' | 'cumulative_pool'; // A안(기본): 이전 각 묶음별 1문항씩 | B안: 이전 누적 풀에서 N문항
export type InstallmentRecallTwinMode = 'same' | 'next_twin'; // 디폴트: 동일 문항 재출제 | 승급 쌍둥이
export type InstallmentUnlockMode = 'sequential' | 'free'; // 디폴트: 순차 해금(완료 후 오픈) | 자유 선택

export interface InstallmentSetPlan {
  set_index: number; // 0-indexed (0: 1묶음, 1: 2묶음...)
  question_ids: string[]; // 해당 세트의 핵심 문항 ID 목록
  rounds: number; // 이 세트에 지정된 바퀴수 (개별 설정 가능)
  recall_schedule?: string[][]; // recall_schedule[roundIdx] = 해당 바퀴(1..rounds)에 투입될 리콜 원본 문항 ID 배열
}

export interface InstallmentConfig {
  enabled: boolean;
  chunk_size: number; // 세트당 문항 수 (기본 5)
  default_rounds_per_set: number; // 세트당 기본 바퀴수 (기본 5)
  recall_mode: InstallmentRecallMode; // 'per_set' (기본) | 'cumulative_pool'
  recall_pool_count: number; // 'cumulative_pool'일 때 바퀴당 리콜 문항 수 (기본 1)
  recall_twin_mode: InstallmentRecallTwinMode; // 'same' (기본) | 'next_twin'
  unlock_mode: InstallmentUnlockMode; // 'sequential' (기본) | 'free'
  show_recall_badge?: boolean; // 학생 화면 기억소환 뱃지 표시 여부 (기본 true)
  sets: InstallmentSetPlan[]; // 확정된 세트 분할 및 바퀴별 리콜 스케줄
  recall_variant_questions?: Record<string, any>; // next_twin 모드 시 리콜 전용 변형 문항 맵 (key: 세트 핵심 문항 id)
}

export interface TreasureConfig {
  enabled: boolean;
  total_rounds: number; // 회차수 (1 ~ 무제한) / 할부 모드 시 전체 총 바퀴 수
  enable_shuffle: boolean; // 매 회차 문항 믹싱 (셔플)
  time_attack_mode: TimeAttackMode; // 타임어택 방식
  base_duration_min: number; // 1회차 기준 시간 (분)
  percent_reduction: number; // 일괄 % 감소율
  manual_durations?: number[]; // 회차별 직접 입력 시간
  variable_reductions?: number[]; // 회차 사이별 가변 % 감소율
  installment?: InstallmentConfig; // 🧩 고등부·대량 오답용 할부·누적 보물회수 설정
}

export interface InstallmentTemplatePreset {
  enabled: boolean;
  chunk_size: number;
  default_rounds_per_set: number;
  recall_mode: InstallmentRecallMode;
  recall_pool_count: number;
  recall_twin_mode: InstallmentRecallTwinMode;
  unlock_mode: InstallmentUnlockMode;
  show_recall_badge?: boolean;
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
  installment_preset?: InstallmentTemplatePreset;
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
  {
    id: 'tpl_high_installment',
    name: '🧩 [고등 할부·누적 5바퀴] 5문항 분할 + 기억소환 (10% 감소, 믹싱 ON)',
    total_rounds: 5,
    enable_shuffle: true,
    time_attack_mode: 'percent',
    percent_reduction: 10,
    installment_preset: {
      enabled: true,
      chunk_size: 5,
      default_rounds_per_set: 5,
      recall_mode: 'per_set',
      recall_pool_count: 1,
      recall_twin_mode: 'same',
      unlock_mode: 'sequential',
      show_recall_badge: true,
    },
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

// 🏷️ 시험지 제목에서 오답/보물회수 N회차 및 순수 원본 제목 파싱 헬퍼
export interface ParsedExamTitleInfo {
  cleanBaseTitle: string;
  currentRound: number;
  nextRound: number;
  isWrong: boolean;
  isTreasure: boolean;
  isTwin: boolean;
  studentName?: string;
}

export function parseExamRoundAndBaseTitle(title: string): ParsedExamTitleInfo {
  let t = (title || '').trim();

  // 1. 끝에 붙은 (학생이름) 또는 [학생이름] 추출 및 제거 (여러 개 반복되어 있는 경우도 모두 제거)
  let studentName: string | undefined = undefined;
  while (true) {
    const studentMatch = t.match(/[\(\[]([가-힣a-zA-Z0-9\s]{2,10})[\)\]]\s*$/);
    if (studentMatch && studentMatch[1]) {
      const candidate = studentMatch[1].trim();
      if (!candidate.match(/(?:오답|보물|쌍둥이|회차|차|스페셜)/)) {
        if (!studentName) studentName = candidate;
        t = t.replace(/[\(\[][가-힣a-zA-Z0-9\s]{2,10}[\)\]]\s*$/, '').trim();
        continue;
      }
    }
    break;
  }

  const isTreasure = t.includes('보물');
  const isTwin = t.includes('쌍둥이');
  const isWrong = t.includes('오답') || isTreasure;

  // 2. 기존 회차 숫자 파싱 (예: [오답 2회차], [보물회수 3차], 오답 1회차 등)
  let currentRound = 0;
  const roundMatches = Array.from(t.matchAll(/(?:오답|보물회수|보물)[^\]\d]*?(\d+)\s*(?:회차|차)/gi));
  if (roundMatches.length > 0) {
    for (const rm of roundMatches) {
      const num = parseInt(rm[1], 10);
      if (num > currentRound) currentRound = num;
    }
  } else {
    // 회차 숫자가 없는 단일 [오답] 또는 [보물회수] 개수 카운트
    const count = (t.match(/\[?(?:오답|보물회수|보물)\]?/g) || []).length;
    currentRound = count;
  }

  // 3. 기존 모든 오답/보물회수/쌍둥이 접두사 태그 및 찌꺼기 완전 정제
  // (예: [오답 2회차·쌍둥이], [보물회수 1회차·쌍둥이], ·쌍둥이], [쌍둥이] 등이 결코 남지 않도록 루프로 정제)
  let cleanBaseTitle = t;
  let prev = '';
  while (prev !== cleanBaseTitle) {
    prev = cleanBaseTitle;
    cleanBaseTitle = cleanBaseTitle
      .replace(/^\[(?:오답|보물회수|보물|쌍둥이)[^\]]*\]\s*/i, '')
      .replace(/^(?:·|•|\s)*쌍둥이\]?\s*/i, '')
      .replace(/^(?:오답|보물회수|보물)(?:\s*\d+\s*(?:회차|차))?\s*/i, '')
      .replace(/^\[\s*\]\s*/, '')
      .trim();
  }

  return {
    cleanBaseTitle: cleanBaseTitle || title,
    currentRound,
    nextRound: currentRound > 0 ? currentRound + 1 : 1,
    isWrong,
    isTreasure,
    isTwin,
    studentName,
  };
}

// ============================================================================
// 🧩 할부·누적 보물회수 (Installment & Cumulative Recall) 전용 엔진 헬퍼
// ============================================================================

// 🎒 셔플-백(Shuffle-Bag) 비복원 순환 생성기: 바퀴 수만큼 중복 없이 골고루 추출
function generateShuffleBagPicks(pool: string[], totalPicks: number): string[] {
  if (pool.length === 0 || totalPicks <= 0) return [];
  const result: string[] = [];
  let bag: string[] = [];
  let lastPicked: string | null = null;

  for (let i = 0; i < totalPicks; i++) {
    if (bag.length === 0) {
      bag = shuffleArray(pool);
      // 재충전 시 직전 바퀴 마지막 문항과 연속 중복을 가능한 방지
      if (bag.length > 1 && lastPicked && bag[0] === lastPicked) {
        const swapIdx = 1 + Math.floor(Math.random() * (bag.length - 1));
        [bag[0], bag[swapIdx]] = [bag[swapIdx], bag[0]];
      }
    }
    const nextItem = bag.shift()!;
    result.push(nextItem);
    lastPicked = nextItem;
  }
  return result;
}

/**
 * 틀린 문항 ID 목록을 할부 세트([5, 5, 5, 2] 등)로 분할하고,
 * 각 세트의 바퀴별 기억소환(리콜) 스케줄을 비복원 순환(셔플-백)으로 생성합니다.
 */
export function buildInstallmentPlan(
  questionIds: string[],
  options: {
    chunkSize: number;
    defaultRoundsPerSet: number;
    setRoundsOverrides?: Record<number, number>;
    recallMode: InstallmentRecallMode;
    recallPoolCount?: number;
  }
): InstallmentSetPlan[] {
  const safeChunkSize = Math.max(1, Math.floor(options.chunkSize || 5));
  const safeDefaultRounds = Math.max(1, Math.floor(options.defaultRoundsPerSet || 5));
  const safePoolCount = Math.max(1, Math.floor(options.recallPoolCount || 1));

  // 1. 앞부터 chunkSize씩 세트 분할
  const chunks: string[][] = [];
  for (let i = 0; i < questionIds.length; i += safeChunkSize) {
    chunks.push(questionIds.slice(i, i + safeChunkSize));
  }

  // 2. 세트별 바퀴수 및 바퀴별 리콜 스케줄 생성
  const sets: InstallmentSetPlan[] = chunks.map((chunkQIds, setIdx) => {
    const rounds = Math.max(1, Math.floor(options.setRoundsOverrides?.[setIdx] ?? safeDefaultRounds));
    const recallSchedule: string[][] = Array.from({ length: rounds }, () => []);

    if (setIdx > 0) {
      if (options.recallMode === 'per_set') {
        // A안 (기본): 이전 0 ~ (setIdx-1) 각 묶음에서 독립 셔플-백으로 1문제씩 추출
        for (let prevIdx = 0; prevIdx < setIdx; prevIdx++) {
          const prevPool = chunks[prevIdx];
          const picks = generateShuffleBagPicks(prevPool, rounds);
          for (let r = 0; r < rounds; r++) {
            if (picks[r]) recallSchedule[r].push(picks[r]);
          }
        }
      } else {
        // B안: 이전 누적 전체 풀에서 매 바퀴 K문항(한 바퀴 내 중복 없이) 추출
        const cumulativePool = chunks.slice(0, setIdx).flat();
        const perRoundPick = Math.min(safePoolCount, cumulativePool.length);
        const flatPicks = generateShuffleBagPicks(cumulativePool, rounds * perRoundPick);
        for (let r = 0; r < rounds; r++) {
          const slice = flatPicks.slice(r * perRoundPick, (r + 1) * perRoundPick);
          // 혹시 재충전 경계에서 한 바퀴 내 동일 문항이 겹치면 보정
          const uniqueSlice: string[] = [];
          const seen = new Set<string>();
          for (const id of slice) {
            if (!seen.has(id)) {
              seen.add(id);
              uniqueSlice.push(id);
            }
          }
          if (uniqueSlice.length < perRoundPick) {
            for (const candidate of shuffleArray(cumulativePool)) {
              if (!seen.has(candidate)) {
                seen.add(candidate);
                uniqueSlice.push(candidate);
                if (uniqueSlice.length >= perRoundPick) break;
              }
            }
          }
          recallSchedule[r] = uniqueSlice;
        }
      }
    }

    return {
      set_index: setIdx,
      question_ids: chunkQIds,
      rounds,
      recall_schedule: recallSchedule,
    };
  });

  return sets;
}

/**
 * 할부 세트들의 전체 총 바퀴 수 계산
 */
export function getInstallmentTotalRounds(sets: InstallmentSetPlan[]): number {
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  return sets.reduce((acc, s) => acc + Math.max(1, Number(s.rounds) || 1), 0);
}

/**
 * (setIndex, setRound) -> 전체 누적 회차 번호 (1-indexed) 변환
 */
export function getInstallmentGlobalRound(
  sets: InstallmentSetPlan[],
  setIndex: number,
  setRound: number
): number {
  let offset = 0;
  for (let i = 0; i < setIndex && i < sets.length; i++) {
    offset += Math.max(1, Number(sets[i].rounds) || 1);
  }
  return offset + Math.max(1, setRound);
}

/**
 * 전체 누적 회차 번호(globalRound) -> (setIndex, setRound) 역변환
 */
export function resolveInstallmentCoordsFromGlobalRound(
  sets: InstallmentSetPlan[],
  globalRound: number
): { setIndex: number; setRound: number } {
  let remaining = Math.max(1, globalRound);
  for (let i = 0; i < sets.length; i++) {
    const r = Math.max(1, Number(sets[i].rounds) || 1);
    if (remaining <= r) {
      return { setIndex: i, setRound: remaining };
    }
    remaining -= r;
  }
  const lastIdx = Math.max(0, sets.length - 1);
  return {
    setIndex: lastIdx,
    setRound: Math.max(1, Number(sets[lastIdx]?.rounds) || 1),
  };
}

/**
 * 특정 세트 & 바퀴에 실제 출제될 문항 배열과 리콜 메타 정보 반환
 */
export function getInstallmentActiveQuestions<T extends { id: string }>(
  allExamQuestions: T[],
  installment: InstallmentConfig,
  setIndex: number,
  setRound: number
): {
  questions: T[];
  recallQuestionIds: Set<string>;
  recallOriginSetMap: Record<string, number>;
} {
  const qMap = new Map<string, T>();
  allExamQuestions.forEach((q) => qMap.set(q.id, q));

  // 어느 세트의 핵심 문항인지 역조회 맵 구성
  const ownerSetMap = new Map<string, number>();
  installment.sets.forEach((s) => {
    s.question_ids.forEach((qid) => ownerSetMap.set(qid, s.set_index));
  });

  const targetSet = installment.sets[setIndex] || installment.sets[0];
  if (!targetSet) {
    return { questions: allExamQuestions, recallQuestionIds: new Set(), recallOriginSetMap: {} };
  }

  const coreQuestions: T[] = [];
  targetSet.question_ids.forEach((qid) => {
    const found = qMap.get(qid);
    if (found) coreQuestions.push(found);
  });

  const roundIdx = Math.max(0, Math.min((targetSet.recall_schedule?.length || 1) - 1, setRound - 1));
  const recallIds = targetSet.recall_schedule?.[roundIdx] || [];
  const recallQuestionIds = new Set<string>();
  const recallOriginSetMap: Record<string, number> = {};
  const recallQuestions: T[] = [];

  recallIds.forEach((baseQId) => {
    const originSetIdx = ownerSetMap.get(baseQId) ?? 0;
    const variantQ =
      installment.recall_twin_mode === 'next_twin' && installment.recall_variant_questions?.[baseQId]
        ? (installment.recall_variant_questions[baseQId] as T)
        : undefined;
    const chosen = variantQ || qMap.get(baseQId);
    if (chosen) {
      recallQuestions.push(chosen);
      recallQuestionIds.add(chosen.id);
      recallOriginSetMap[chosen.id] = originSetIdx;
    }
  });

  return {
    questions: [...coreQuestions, ...recallQuestions],
    recallQuestionIds,
    recallOriginSetMap,
  };
}

/**
 * 할부 세트·바퀴별 제한시간 계산 (문항 수 비례 기본시간 스케일링 + 세트 내 바퀴 타임어택)
 */
export function calculateInstallmentRoundDuration(
  baseExamDurationMin: number,
  totalExamQuestionsCount: number,
  activeQuestionsCount: number,
  setRound: number,
  cfg: Pick<TreasureConfig, 'time_attack_mode' | 'percent_reduction' | 'manual_durations' | 'variable_reductions'>
): number {
  if (baseExamDurationMin <= 0) return 0; // 무제한
  const safeTotal = Math.max(1, totalExamQuestionsCount);
  const safeActive = Math.max(1, activeQuestionsCount);
  const scaledBaseMin = Math.max(1, Math.round((baseExamDurationMin * safeActive) / safeTotal));
  return calculateRoundDuration(
    scaledBaseMin,
    setRound,
    cfg.time_attack_mode || 'fixed',
    cfg.percent_reduction || 0,
    cfg.manual_durations,
    cfg.variable_reductions
  );
}

export interface InstallmentSetProgressItem {
  setIndex: number;
  totalRounds: number;
  coreCount: number;
  completedRoundsList: number[]; // 완료된 set_round (1-indexed)
  completedCount: number;
  isCompleted: boolean;
  isUnlocked: boolean;
  nextRound: number; // 다음 도전할 바퀴 (1..totalRounds)
}

export interface InstallmentOverallProgress {
  sets: InstallmentSetProgressItem[];
  totalCourseRounds: number;
  completedCourseRounds: number;
  isAllCompleted: boolean;
  activeSetIndex: number;
  activeSetRound: number;
}

/**
 * 학생의 round_history를 기반으로 할부 세트별 완주·해금 상태 계산
 * (완료 = 정답률과 무관하게 해당 세트의 모든 바퀴 제출 완료)
 */
export function computeInstallmentProgress(
  installment: InstallmentConfig,
  roundHistory: Array<{ round?: number; set_index?: number; set_round?: number }> = []
): InstallmentOverallProgress {
  const sets = installment.sets || [];
  const perSetCompleted = new Map<number, Set<number>>();
  sets.forEach((s) => perSetCompleted.set(s.set_index, new Set<number>()));

  (roundHistory || []).forEach((h) => {
    if (typeof h.set_index === 'number' && typeof h.set_round === 'number') {
      const bucket = perSetCompleted.get(h.set_index);
      if (bucket && h.set_round >= 1) {
        const maxR = sets[h.set_index]?.rounds || h.set_round;
        if (h.set_round <= maxR) bucket.add(h.set_round);
      }
    } else if (typeof h.round === 'number' && h.round >= 1) {
      const coords = resolveInstallmentCoordsFromGlobalRound(sets, h.round);
      perSetCompleted.get(coords.setIndex)?.add(coords.setRound);
    }
  });

  const setProgress: InstallmentSetProgressItem[] = [];
  let totalCourseRounds = 0;
  let completedCourseRounds = 0;

  sets.forEach((s, idx) => {
    const totalR = Math.max(1, Number(s.rounds) || 1);
    totalCourseRounds += totalR;

    const doneSet = perSetCompleted.get(s.set_index) || new Set<number>();
    const completedRoundsList = Array.from(doneSet).sort((a, b) => a - b);
    const completedCount = Math.min(totalR, completedRoundsList.length);
    completedCourseRounds += completedCount;

    const isCompleted = completedCount >= totalR;
    const isUnlocked =
      installment.unlock_mode === 'free' || idx === 0 || Boolean(setProgress[idx - 1]?.isCompleted);

    let nextRound = totalR;
    for (let r = 1; r <= totalR; r++) {
      if (!doneSet.has(r)) {
        nextRound = r;
        break;
      }
    }

    setProgress.push({
      setIndex: s.set_index,
      totalRounds: totalR,
      coreCount: s.question_ids.length,
      completedRoundsList,
      completedCount,
      isCompleted,
      isUnlocked,
      nextRound,
    });
  });

  const isAllCompleted = setProgress.length > 0 && setProgress.every((sp) => sp.isCompleted);

  // 현재 도전 추천 세트/바퀴 탐색 (해금되었지만 미완료인 첫 세트)
  const firstActive = setProgress.find((sp) => sp.isUnlocked && !sp.isCompleted) || setProgress[setProgress.length - 1];

  return {
    sets: setProgress,
    totalCourseRounds,
    completedCourseRounds,
    isAllCompleted,
    activeSetIndex: firstActive ? firstActive.setIndex : 0,
    activeSetRound: firstActive ? firstActive.nextRound : 1,
  };
}
