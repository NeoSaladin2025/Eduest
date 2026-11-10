// =========================================================================
// Eduest 가정·자기주도 학습 분석 & 학원 수업 제외 필터 타입 및 유틸리티
// =========================================================================

export type WeekdayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface ExclusionRule {
  id: string;
  title: string;
  days: WeekdayCode[];
  start_time: string; // "HH:mm" (e.g. "18:00")
  end_time: string;   // "HH:mm" (e.g. "22:00")
  created_at: string;
}

export interface HomeStudyRulesConfig {
  grade_rules: Record<string, ExclusionRule[]>; // e.g. "고2": [rule1, rule2]
  student_overrides: Record<string, ExclusionRule[]>; // e.g. "student_id": [ruleA]
  updated_at: string;
}

export interface ActivitySpan {
  mode: 'library' | 'review' | 'test' | 'video' | 'homework' | 'idle';
  title: string;
  sub_detail?: string;
  duration_sec: number;
}

export interface HomeStudySessionItem {
  id: string;
  started_at: string; // ISO
  ended_at: string;   // ISO
  duration_sec: number;
  activities: ActivitySpan[];
}

export interface StudentHomeStudyDayRecord {
  id: string; // `${student_id}_${date}`
  student_id: string;
  student_name: string;
  student_grade: string;
  date: string; // "YYYY-MM-DD" in KST
  total_duration_sec: number;
  first_access_at: string;
  last_access_at: string;
  sessions: HomeStudySessionItem[];
  activities_summary: {
    library_sec: number;
    review_sec: number;
    test_sec: number;
    video_sec: number;
    homework_sec: number;
    other_sec: number;
  };
  updated_at: string;
}

// -------------------------------------------------------------------------
// 헬퍼 함수들 (한국 표준시 KST UTC+9 기준)
// -------------------------------------------------------------------------

export const WEEKDAY_KO_MAP: Record<WeekdayCode, string> = {
  MON: '월',
  TUE: '화',
  WED: '수',
  THU: '목',
  FRI: '금',
  SAT: '토',
  SUN: '일',
};

export const WEEKDAY_ORDER: WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function getKoreanDateString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

export function getKoreanDayOfWeek(d: Date = new Date()): WeekdayCode {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dayIndex = kst.getUTCDay(); // 0 is SUN, 1 is MON ...
  const map: WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return map[dayIndex];
}

export function getKoreanTimeString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDurationKo(sec: number): string {
  if (!sec || sec < 60) return `${Math.max(0, Math.floor(sec || 0))}초`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}시간 ${remM}분` : `${h}시간`;
}

/**
 * 특정 시각이 학원 수업 제외 시간대에 속하는지 판별
 */
export function isTimeExcluded(
  d: Date,
  studentId: string,
  studentGrade: string,
  rulesConfig: HomeStudyRulesConfig | null
): boolean {
  if (!rulesConfig) return false;

  const dayOfWeek = getKoreanDayOfWeek(d);
  const currentTime = getKoreanTimeString(d);

  // 1. 학생 개별 오버라이드 룰 우선 확인
  if (studentId && rulesConfig.student_overrides?.[studentId]) {
    const overrides = rulesConfig.student_overrides[studentId];
    if (Array.isArray(overrides) && overrides.length > 0) {
      for (const rule of overrides) {
        if (rule.days.includes(dayOfWeek)) {
          if (currentTime >= rule.start_time && currentTime <= rule.end_time) {
            return true;
          }
        }
      }
      return false; // 학생 개별 룰이 있으면 학년 룰 대신 이것만 따름
    }
  }

  // 2. 학년 기본 룰 확인
  const baseGrade = studentGrade ? studentGrade.split('-')[0].trim() : '';
  const gradeRules = rulesConfig.grade_rules?.[baseGrade] || rulesConfig.grade_rules?.[studentGrade];
  if (Array.isArray(gradeRules) && gradeRules.length > 0) {
    for (const rule of gradeRules) {
      if (rule.days.includes(dayOfWeek)) {
        if (currentTime >= rule.start_time && currentTime <= rule.end_time) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * 기본 제외 규칙 프리셋
 */
export const DEFAULT_HOME_STUDY_RULES: HomeStudyRulesConfig = {
  grade_rules: {
    '고2': [
      {
        id: 'rule_g2_regular',
        title: '고2 정규 단과 수업',
        days: ['MON', 'WED', 'FRI'],
        start_time: '18:00',
        end_time: '22:00',
        created_at: new Date().toISOString(),
      },
      {
        id: 'rule_g2_clinic',
        title: '고2 주말 클리닉',
        days: ['SAT'],
        start_time: '14:00',
        end_time: '18:00',
        created_at: new Date().toISOString(),
      },
    ],
    '고1': [
      {
        id: 'rule_g1_regular',
        title: '고1 정규 단과 수업',
        days: ['TUE', 'THU'],
        start_time: '18:00',
        end_time: '22:00',
        created_at: new Date().toISOString(),
      },
      {
        id: 'rule_g1_clinic',
        title: '고1 주말 클리닉',
        days: ['SAT'],
        start_time: '14:00',
        end_time: '18:00',
        created_at: new Date().toISOString(),
      },
    ],
    '중3': [
      {
        id: 'rule_m3_regular',
        title: '중3 집중반 수업',
        days: ['MON', 'WED'],
        start_time: '17:00',
        end_time: '20:30',
        created_at: new Date().toISOString(),
      },
    ],
  },
  student_overrides: {},
  updated_at: new Date().toISOString(),
};
