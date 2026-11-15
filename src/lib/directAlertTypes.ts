// =========================================================================
// Eduest 무음 다이렉트 경고 시스템 (Silent Sniper Alert) 공용 타입 및 헬퍼
// =========================================================================

export type DirectAlertMode =
  | 'SNIPER_WATCH'    // ① 스나이퍼 상단 고정 주시 (풀이 유지 + 테두리 적색 맥박 + 고정 HUD)
  | 'SILENT_LOCKDOWN' // ② 무음 전체화면 적색경보 (암전 + 스포트라이트 + 타자기 + 잠금 해제)
  | 'CLEAN_RECEIPT'   // ③ 5초 이하 실수 필터링된 정밀 딴짓 영수증 (변명 차단형)
  | 'FOCUS_CHALLENGE'; // ④ 집중 검증 챌린지 (확인 후 상단 N분 무이탈 카운트다운 HUD)

export type UnlockMethod = 'countdown' | 'typing' | 'slider';

export interface DirectAlertReceiptItem {
  id: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  location_title?: string;
  context?: string;
}

export interface DirectAlertPayload {
  id: string;
  student_id: string;
  student_name: string;
  student_grade?: string;
  mode: DirectAlertMode;
  message: string;
  unlock_method: UnlockMethod;
  countdown_sec: number;
  required_phrase: string;
  vibrate: boolean;
  is_group?: boolean;
  group_count?: number;
  group_names?: string[];
  ambush_on_return?: boolean;
  ambush_away_sec?: number; // 복귀 시 직전 이탈 시간(초)
  // 정밀 딴짓 영수증 데이터
  receipt_items?: DirectAlertReceiptItem[];
  filtered_under_sec?: number;
  filtered_out_count?: number;
  // 집중 검증 챌린지 옵션
  attach_focus_challenge?: boolean;
  challenge_duration_min?: number;
  challenge_started_at?: string;
  challenge_end_at?: string;
  // 발송 시점 텔레메트리 스냅샷
  away_count_snapshot?: number;
  away_total_sec_snapshot?: number;
  location_snapshot?: string;
  stay_duration_str?: string;
  created_at: string;
  status: 'pending' | 'watching' | 'challenge' | 'acked';
  acked_at?: string;
  ack_elapsed_sec?: number;
  ack_note?: string;
  challenge_violations?: number;
}

export interface DirectAlertPreset {
  id: string;
  label: string;
  mode?: DirectAlertMode;
  template: string;
}

export const DIRECT_ALERT_PRESETS: DirectAlertPreset[] = [
  {
    id: 'quiet_stop',
    label: '🤐 소리 내지 말고 정숙',
    template: '{이름} 학생, 지금 옆 친구랑 말소리 들린다. 소리 내지 말고 바로 문제 집중해라.',
  },
  {
    id: 'watching_now',
    label: '👁️ 지금 다 보고 있다',
    template: '{이름} 학생, 선생님이 지금 화면이랑 태도 다 보고 있다. 고개 숙이고 바로 풀어라.',
  },
  {
    id: 'away_streak',
    label: '🚨 딴짓 N회째 경고',
    template: '{이름} 학생, 오늘만 딴짓 {딴짓횟수}회({딴짓시간})째다. 지금 당장 정신 차리고 집중해라.',
  },
  {
    id: 'receipt_confront',
    label: '🧾 변명 금지 영수증',
    template: '실수·렉은 다 빼줬는데도 확정 딴짓 {딴짓시간}이다. 변명 금지, 지금 바로 시작해라.',
  },
  {
    id: 'stay_progress',
    label: '⏱️ 체류시간 대비 진도 압박',
    template: '{이름} 학생, 지금 "{현재위치}"에서 {체류시간}째 머물고 있다. 딴짓 멈추고 손 움직여라.',
  },
];

export function formatKoreanDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export function substituteAlertVariables(
  template: string,
  vars: {
    name?: string;
    awayCount?: number;
    awayTotalSec?: number;
    location?: string;
    stayDuration?: string;
  }
): string {
  const safeName = vars.name || '학생';
  const countStr = String(vars.awayCount ?? 0);
  const awayTimeStr = formatKoreanDuration(vars.awayTotalSec ?? 0);
  const locStr = vars.location || '학습 화면';
  const stayStr = vars.stayDuration || '00:00';

  return template
    .replace(/\{이름\}/g, safeName)
    .replace(/\{딴짓횟수\}/g, countStr)
    .replace(/\{딴짓시간\}/g, awayTimeStr)
    .replace(/\{현재위치\}/g, locStr)
    .replace(/\{체류시간\}/g, stayStr);
}
