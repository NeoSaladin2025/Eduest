'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  ShieldAlert,
  Receipt,
  Timer,
  VolumeX,
  Zap,
  Trash2,
  Sparkles,
  CheckCircle2,
  Send,
  Users,
} from 'lucide-react';
import { StudentAwayLog } from '@/app/api/monitoring/away-logs/route';
import {
  DirectAlertMode,
  DirectAlertPayload,
  DIRECT_ALERT_PRESETS,
  UnlockMethod,
  formatKoreanDuration,
  substituteAlertVariables,
} from '@/lib/directAlertTypes';

interface TargetStudentInfo {
  id: string;
  name: string;
  grade: string;
  locationTitle?: string;
  stayDurationStr?: string;
  isAway?: boolean;
  todayAwayCount: number;
  todayAwaySec: number;
}

interface DirectAlertModalProps {
  isOpen: boolean;
  targets: TargetStudentInfo[];
  awayLogs: StudentAwayLog[];
  onClose: () => void;
  onSendAlerts: (alerts: DirectAlertPayload[]) => Promise<void>;
  onDeleteAwayLog: (logId: string) => Promise<void>;
  onClearShortLogs: (studentId: string, maxSeconds: number) => Promise<void>;
}

export default function DirectAlertModal({
  isOpen,
  targets,
  awayLogs,
  onClose,
  onSendAlerts,
  onDeleteAwayLog,
  onClearShortLogs,
}: DirectAlertModalProps) {
  const isGroup = targets.length > 1;
  const primary = targets[0];

  const [mode, setMode] = useState<DirectAlertMode>('SILENT_LOCKDOWN');
  const [messageTemplate, setMessageTemplate] = useState<string>(
    DIRECT_ALERT_PRESETS[0].template
  );
  const [unlockMethod, setUnlockMethod] = useState<UnlockMethod>('typing');
  const [countdownSec, setCountdownSec] = useState<number>(5);
  const [requiredPhrase, setRequiredPhrase] = useState<string>('집중하겠습니다');
  const [vibrate, setVibrate] = useState<boolean>(true);

  // 사후 집중 검증 챌린지 옵션
  const [attachChallenge, setAttachChallenge] = useState<boolean>(false);
  const [challengeDurationMin, setChallengeDurationMin] = useState<number>(10);

  // 🧾 5초 이하 실수/렉 필터 설정 (오라버니 요청: 옵션으로 기준 초 변경 가능 + 개별 제외)
  const [filterUnderSec, setFilterUnderSec] = useState<number>(5);
  const [excludedLogIds, setExcludedLogIds] = useState<Set<string>>(new Set());
  const [isCleaningLogs, setIsCleaningLogs] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);

  // 모달이 새로 열릴 때 기본 상태 초기화
  useEffect(() => {
    if (!isOpen || !primary) return;
    setMode('SILENT_LOCKDOWN');
    setExcludedLogIds(new Set());
    if (isGroup) {
      setMessageTemplate(
        `지금 떠드는 ${targets.length}명 말소리 다 들린다. 소리 내지 말고 바로 문제 집중해라.`
      );
      setUnlockMethod('countdown');
    } else {
      const rendered = substituteAlertVariables(DIRECT_ALERT_PRESETS[0].template, {
        name: primary.name,
        awayCount: primary.todayAwayCount,
        awayTotalSec: primary.todayAwaySec,
        location: primary.locationTitle,
        stayDuration: primary.stayDurationStr,
      });
      setMessageTemplate(rendered);
      setUnlockMethod('typing');
    }
  }, [isOpen, targets.length, primary?.id]);

  // 단일 학생의 오늘 딴짓 내역
  const todayPrefix = useMemo(() => new Date().toISOString().slice(0, 10), [isOpen]);

  const studentTodayLogs = useMemo(() => {
    if (!primary || isGroup) return [];
    return awayLogs.filter(
      (l) => l.student_id === primary.id && l.started_at.startsWith(todayPrefix)
    );
  }, [awayLogs, primary, isGroup, todayPrefix]);

  // 기준 초 이하로 자동 걸러지는 건수
  const shortLogsCount = useMemo(() => {
    return studentTodayLogs.filter((l) => l.duration_sec <= filterUnderSec && !l.is_archived).length;
  }, [studentTodayLogs, filterUnderSec]);

  // 영수증에 실제로 담길 확정 딴짓 리스트 (기준 초 초과 & 교사 수동 제외 아님)
  const receiptLogs = useMemo(() => {
    return studentTodayLogs.filter(
      (l) => l.duration_sec > filterUnderSec && !excludedLogIds.has(l.id)
    );
  }, [studentTodayLogs, filterUnderSec, excludedLogIds]);

  if (!isOpen || targets.length === 0 || !primary) return null;

  const handleSelectPreset = (template: string) => {
    if (isGroup) {
      setMessageTemplate(template);
    } else {
      setMessageTemplate(
        substituteAlertVariables(template, {
          name: primary.name,
          awayCount: primary.todayAwayCount,
          awayTotalSec: primary.todayAwaySec,
          location: primary.locationTitle,
          stayDuration: primary.stayDurationStr,
        })
      );
    }
  };

  const handleBulkCleanShort = async () => {
    if (!primary || shortLogsCount === 0 || isCleaningLogs) return;
    setIsCleaningLogs(true);
    try {
      await onClearShortLogs(primary.id, filterUnderSec);
    } finally {
      setIsCleaningLogs(false);
    }
  };

  const handleSubmit = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      const nowIso = new Date().toISOString();
      const baseId = `da_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const payloads: DirectAlertPayload[] = targets.map((st, idx) => {
        const finalMsg = substituteAlertVariables(messageTemplate.trim() || '지금 당장 집중하세요.', {
          name: st.name,
          awayCount: st.todayAwayCount,
          awayTotalSec: st.todayAwaySec,
          location: st.locationTitle,
          stayDuration: st.stayDurationStr,
        });

        const isCleanReceipt = !isGroup && mode === 'CLEAN_RECEIPT';
        const isChallengeMode = mode === 'FOCUS_CHALLENGE';

        return {
          id: `${baseId}_${idx}`,
          student_id: st.id,
          student_name: st.name,
          student_grade: st.grade,
          mode,
          message: finalMsg,
          unlock_method: unlockMethod,
          countdown_sec: countdownSec,
          required_phrase: requiredPhrase.trim() || '집중하겠습니다',
          vibrate,
          is_group: isGroup,
          group_count: isGroup ? targets.length : undefined,
          group_names: isGroup ? targets.map((t) => t.name) : undefined,
          ambush_on_return: Boolean(st.isAway),
          receipt_items: isCleanReceipt
            ? receiptLogs.map((l) => ({
                id: l.id,
                started_at: l.started_at,
                ended_at: l.ended_at,
                duration_sec: l.duration_sec,
                location_title: l.location_title,
                context: l.context,
              }))
            : undefined,
          filtered_under_sec: isCleanReceipt ? filterUnderSec : undefined,
          filtered_out_count: isCleanReceipt
            ? studentTodayLogs.length - receiptLogs.length
            : undefined,
          attach_focus_challenge: isChallengeMode || attachChallenge,
          challenge_duration_min: challengeDurationMin,
          away_count_snapshot: st.todayAwayCount,
          away_total_sec_snapshot: st.todayAwaySec,
          location_snapshot: st.locationTitle,
          stay_duration_str: st.stayDurationStr,
          created_at: nowIso,
          status: mode === 'SNIPER_WATCH' ? 'watching' : 'pending',
        };
      });

      await onSendAlerts(payloads);
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-rose-200 overflow-hidden">
        {/* 헤더 */}
        <div className="p-5 sm:p-6 bg-slate-950 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center shrink-0">
                {isGroup ? <Users size={17} /> : <ShieldAlert size={17} />}
              </span>
              <h3 className="text-base sm:text-lg font-black truncate">
                {isGroup
                  ? `📢 단체 무음 다이렉트 경고 (${targets.length}명)`
                  : `🚨 무음 다이렉트 경고 — ${primary.name} (${primary.grade})`}
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5 flex-wrap text-[11px] text-slate-300 font-bold">
              {isGroup ? (
                <span className="text-rose-300">
                  대상: {targets.map((t) => t.name).join(', ')}
                </span>
              ) : (
                <>
                  <span>위치: {primary.locationTitle || '학습 중'}</span>
                  <span className="text-amber-300">
                    오늘 딴짓: {primary.todayAwayCount}회 ({formatKoreanDuration(primary.todayAwaySec)})
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-rose-300">
                <VolumeX size={11} /> 교실 무음 모드
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* 1. 경고 모드 4종 선택 */}
          <div>
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-2">
              1. 경고 연출 모드 선택
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  id: 'SNIPER_WATCH' as DirectAlertMode,
                  icon: Eye,
                  title: '스나이퍼 주시',
                  desc: '상단 바 고정 + 테두리 맥박',
                },
                {
                  id: 'SILENT_LOCKDOWN' as DirectAlertMode,
                  icon: ShieldAlert,
                  title: '전체화면 적색경보',
                  desc: '화면 잠금 + 타자기 경고',
                },
                {
                  id: 'CLEAN_RECEIPT' as DirectAlertMode,
                  icon: Receipt,
                  title: '딴짓 정밀 영수증',
                  desc: '5초↓ 제거 후 내역 발송',
                  disabled: isGroup,
                },
                {
                  id: 'FOCUS_CHALLENGE' as DirectAlertMode,
                  icon: Timer,
                  title: '집중 검증 퀘스트',
                  desc: '확인 후 N분 이탈 금지 바',
                },
              ].map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => setMode(item.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${
                      item.disabled
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100'
                        : active
                        ? 'border-rose-600 bg-rose-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                    }`}
                  >
                    <Icon size={18} className={active ? 'text-rose-600' : 'text-slate-500'} />
                    <div className="text-xs font-black text-slate-900 mt-0.5">{item.title}</div>
                    <div className="text-[10px] font-bold text-slate-500 leading-tight">{item.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 🧾 정밀 딴짓 영수증 모드 선택 시: N초 이하 제거 + 개별 항목 삭제/제외 */}
          {mode === 'CLEAN_RECEIPT' && !isGroup && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Receipt size={15} className="text-rose-600" />
                    <span>영수증 수록 내역 정밀 편집 (오늘 기준 {studentTodayLogs.length}건)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    실수·렉으로 판단되는 기록은 기준 시간 이하 일괄 제거 또는 우측 휴지통으로 바로 삭제하세요.
                  </p>
                </div>

                {/* 기준 초 직접 설정 + 일괄 제거 버튼 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-700">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={filterUnderSec}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setFilterUnderSec(isNaN(val) ? 1 : Math.max(1, Math.min(600, val)));
                      }}
                      className="w-11 text-center bg-slate-50 rounded border border-slate-200 py-0.5 text-xs font-black text-slate-900 outline-none focus:border-emerald-500"
                      title="제외/제거 기준 시간(초) 직접 입력"
                    />
                    <span>초 이하</span>
                  </div>

                  <button
                    type="button"
                    disabled={shortLogsCount === 0 || isCleaningLogs}
                    onClick={handleBulkCleanShort}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                    title="선택한 기준 시간 이하인 오늘 딴짓 기록을 DB에서 일괄 삭제합니다"
                  >
                    <Sparkles size={12} />
                    <span>
                      {isCleaningLogs
                        ? '정리 중...'
                        : `🧹 ${filterUnderSec}초 이하 DB 제거 (${shortLogsCount}건)`}
                    </span>
                  </button>
                </div>
              </div>

              {/* 항목 리스트 (각 항목마다 영구 삭제 및 이번 영수증 제외 토글 제공) */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {studentTodayLogs.length === 0 ? (
                  <div className="py-4 text-center text-xs font-bold text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                    오늘 기록된 자리 이탈 내역이 없습니다.
                  </div>
                ) : (
                  studentTodayLogs.map((log) => {
                    const isShortFiltered = log.duration_sec <= filterUnderSec;
                    const isManuallyExcluded = excludedLogIds.has(log.id);
                    const willInclude = !isShortFiltered && !isManuallyExcluded;
                    const startStr = new Date(log.started_at).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={log.id}
                        className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          willInclude
                            ? 'bg-white border-rose-200'
                            : 'bg-slate-100/70 border-slate-200 opacity-55'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={willInclude}
                            disabled={isShortFiltered}
                            onChange={() => {
                              setExcludedLogIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(log.id)) next.delete(log.id);
                                else next.add(log.id);
                                return next;
                              });
                            }}
                            className="accent-rose-600 w-3.5 h-3.5 shrink-0"
                            title="이번 영수증에 포함 여부"
                          />
                          <span className="font-mono font-bold text-slate-600 shrink-0">{startStr}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 ${
                              isShortFiltered
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {formatKoreanDuration(log.duration_sec)}
                          </span>
                          <span className="text-slate-500 truncate">
                            {log.location_title || log.context || '이탈'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeleteAwayLog(log.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0"
                          title="이 기록 영구 삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="text-[11px] font-black text-rose-700 flex items-center justify-between pt-1">
                <span>
                  이번 영수증에 포함될 확정 딴짓: {receiptLogs.length}건 (
                  {formatKoreanDuration(receiptLogs.reduce((a, b) => a + b.duration_sec, 0))})
                </span>
                <span className="text-slate-500 font-bold">
                  ※ 학부모 자동 발송 안 됨 (학생 화면 압박 전용)
                </span>
              </div>
            </div>
          )}

          {/* 3. 빠른 프리셋 칩 + 메시지 작성 */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
              2. 즉석 경고 프리셋 & 직접 입력
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DIRECT_ALERT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.template)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-[11px] font-black transition-all cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="학생 태블릿/PC 화면 중앙에 타자기로 한 글자씩 찍혀 나올 경고 멘트를 입력하세요."
              className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-rose-500 text-sm font-bold text-slate-900 outline-none resize-none"
            />
            {isGroup && (
              <p className="text-[11px] text-slate-400 font-medium">
                💡 팁: <code className="text-rose-600">{'{이름}'}</code>,{' '}
                <code className="text-rose-600">{'{딴짓횟수}'}</code> 를 넣으면 학생별로 자동 맞춤 치환됩니다.
              </p>
            )}
          </div>

          {/* 4. 잠금 해제 조건 & 사후 챌린지 옵션 (스나이퍼 주시 모드 제외) */}
          {mode !== 'SNIPER_WATCH' && (
            <div className="rounded-2xl bg-rose-50/40 border border-rose-200/80 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-black text-slate-800">3. 학생 경고창 해제 조건</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'typing' as UnlockMethod, label: '⌨️ 문구 타이핑' },
                    { id: 'slider' as UnlockMethod, label: '👉 밀어서 서약' },
                    { id: 'countdown' as UnlockMethod, label: '⏱️ 카운트 확인' },
                  ].map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnlockMethod(u.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer ${
                        unlockMethod === u.id
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-600">최소 강제 응시</span>
                  <select
                    value={countdownSec}
                    onChange={(e) => setCountdownSec(Number(e.target.value))}
                    className="text-xs font-black text-slate-900 bg-transparent outline-none"
                  >
                    <option value={0}>즉시 가능 (0초)</option>
                    <option value={5}>5초 동안 못 닫음</option>
                    <option value={10}>10초 동안 못 닫음</option>
                    <option value={15}>15초 동안 못 닫음</option>
                  </select>
                </div>

                {unlockMethod === 'typing' && (
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-600 shrink-0">입력 문구</span>
                    <input
                      type="text"
                      value={requiredPhrase}
                      onChange={(e) => setRequiredPhrase(e.target.value)}
                      className="w-full text-xs font-black text-rose-700 outline-none text-right"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vibrate}
                    onChange={(e) => setVibrate(e.target.checked)}
                    className="accent-rose-600 w-4 h-4"
                  />
                  <span>모바일/태블릿 짧은 진동 동반 (교실 무음 유지)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-black text-amber-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mode === 'FOCUS_CHALLENGE' || attachChallenge}
                    disabled={mode === 'FOCUS_CHALLENGE'}
                    onChange={(e) => setAttachChallenge(e.target.checked)}
                    className="accent-amber-600 w-4 h-4"
                  />
                  <span>확인 후</span>
                  <select
                    value={challengeDurationMin}
                    onChange={(e) => setChallengeDurationMin(Number(e.target.value))}
                    className="px-1.5 py-0.5 rounded-lg bg-white border border-amber-300 text-xs font-black"
                  >
                    <option value={5}>5분</option>
                    <option value={10}>10분</option>
                    <option value={15}>15분</option>
                  </select>
                  <span>무이탈 검증 HUD 유지</span>
                </label>
              </div>
            </div>
          )}

          {/* 이탈 중인 학생 안내 */}
          {targets.some((t) => t.isAway) && (
            <div className="rounded-2xl bg-amber-50 border border-amber-300 px-4 py-2.5 text-xs font-bold text-amber-900 flex items-center gap-2">
              <Zap size={15} className="text-amber-600 shrink-0" />
              <span>
                현재 자리 이탈 중인 학생은 <strong>복귀 매복 트랩</strong>이 자동 장착되어,
                학생이 에듀이스트로 돌아오는 0.1초 뒤에 즉시 경고가 터집니다!
              </span>
            </div>
          )}
        </div>

        {/* 푸터 발송 버튼 */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>교실 소리 0% · 화면 즉시 점령</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={handleSubmit}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white text-xs sm:text-sm font-black shadow-lg shadow-rose-200 flex items-center gap-2 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
            >
              <Send size={15} />
              <span>
                {isSending
                  ? '발송 중...'
                  : mode === 'SNIPER_WATCH'
                  ? '👁️ 실시간 주시 시작'
                  : '⚡ 지금 즉시 학생 화면 점령 발송'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
