'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Eye,
  ShieldAlert,
  AlertTriangle,
  VolumeX,
  Clock,
  Lock,
  CheckCircle2,
  Zap,
  ChevronRight,
  Sparkles,
  Receipt,
} from 'lucide-react';
import { DirectAlertPayload, formatKoreanDuration } from '@/lib/directAlertTypes';

export type DirectAlertSignal =
  | { type: 'send'; alert: DirectAlertPayload; seq: number }
  | { type: 'clear'; seq: number }
  | null;

interface StudentDirectAlertOverlayProps {
  studentId?: string;
  studentName?: string;
  studentGrade?: string;
  proctorChannel?: any;
  isAway?: boolean;
  /** proctoring_room 브로드캐스트에서 직접 전달받는 최신 신호 */
  incomingSignal?: DirectAlertSignal;
  /** 학생이 자리 이탈에서 복귀할 때마다 1씩 증가하는 트리거 카운터와 이탈 초 */
  awayReturnEvent?: { seq: number; awaySec: number } | null;
}

export default function StudentDirectAlertOverlay({
  studentId,
  studentName,
  studentGrade,
  proctorChannel,
  incomingSignal,
  awayReturnEvent,
}: StudentDirectAlertOverlayProps) {
  const [activeAlert, setActiveAlert] = useState<DirectAlertPayload | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // 타자기 애니메이션 진행 글자 수
  const [typedLen, setTypedLen] = useState<number>(0);

  // 잠금 해제 상태들
  const [typingInput, setTypingInput] = useState<string>('');
  const [sliderPct, setSliderPct] = useState<number>(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const [isSubmittingAck, setIsSubmittingAck] = useState<boolean>(false);

  // 검증 완료 축하 배너 (잠깐 띄우고 닫힘)
  const [challengeCompletedToast, setChallengeCompletedToast] = useState<boolean>(false);

  // 경고 최초 화면 노출 시각 (열람 경과 시간 측정용)
  const shownAtMsRef = useRef<number>(Date.now());
  const activeAlertRef = useRef<DirectAlertPayload | null>(null);
  activeAlertRef.current = activeAlert;

  // 1초 타이머 (카운트다운 / 열람 경과 / 집중 검증 챌린지 남은 시간용)
  useEffect(() => {
    if (!activeAlert) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeAlert]);

  // 새 pending 경고가 도착했을 때 초기화 + 진동(옵션, 완전 무음)
  const activateNewAlert = useCallback((incoming: DirectAlertPayload) => {
    setActiveAlert(incoming);
    setNowMs(Date.now());
    shownAtMsRef.current = Date.now();
    setTypedLen(0);
    setTypingInput('');
    setSliderPct(0);
    setIsSubmittingAck(false);

    if (
      incoming.vibrate &&
      incoming.status === 'pending' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate([140, 80, 140]);
      } catch {}
    }
  }, []);

  // 서버에서 미확인/활성 경고 조회 (초기 진입 + 복귀 시)
  const syncPendingFromServer = useCallback(
    async (returnedAwaySec?: number) => {
      if (!studentId) return;
      try {
        const res = await fetch(`/api/monitoring/direct-alerts?studentId=${encodeURIComponent(studentId)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!data?.success) return;

        const fetched: DirectAlertPayload | null = data.alert || null;
        if (!fetched) {
          if (activeAlertRef.current && activeAlertRef.current.status !== 'acked') {
            setActiveAlert(null);
          }
          return;
        }

        // 이미 acked면 학생 화면엔 더 이상 방해하지 않음
        if (fetched.status === 'acked') {
          setActiveAlert(null);
          return;
        }

        const enriched =
          returnedAwaySec && returnedAwaySec >= 3 && fetched.status === 'pending'
            ? {
                ...fetched,
                ambush_on_return: true,
                ambush_away_sec: fetched.ambush_away_sec || returnedAwaySec,
              }
            : fetched;

        if (!activeAlertRef.current || activeAlertRef.current.id !== enriched.id || activeAlertRef.current.status !== enriched.status) {
          activateNewAlert(enriched);
        }
      } catch {}
    },
    [studentId, activateNewAlert]
  );

  // 최초 마운트 시 미확인 경고 확인
  useEffect(() => {
    syncPendingFromServer();
  }, [syncPendingFromServer]);

  // Realtime proctoring_room 브로드캐스트 수신 (부모가 전달한 incomingSignal 반영)
  const lastSignalSeqRef = useRef<number>(0);
  useEffect(() => {
    if (!incomingSignal || incomingSignal.seq === lastSignalSeqRef.current) return;
    lastSignalSeqRef.current = incomingSignal.seq;

    if (incomingSignal.type === 'send') {
      activateNewAlert(incomingSignal.alert);
    } else if (incomingSignal.type === 'clear') {
      setActiveAlert(null);
    }
  }, [incomingSignal, activateNewAlert]);

  // 이탈 복귀 매복 검거 + 집중 검증 챌린지 중 이탈 적발
  const lastHandledSeqRef = useRef<number>(0);
  useEffect(() => {
    if (!awayReturnEvent || awayReturnEvent.seq === lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = awayReturnEvent.seq;

    const current = activeAlertRef.current;
    // 1) 집중 검증 챌린지 도중 3초 이상 이탈 시 즉시 적발 재발동!
    if (current && current.status === 'challenge' && awayReturnEvent.awaySec >= 3 && studentId) {
      fetch('/api/monitoring/direct-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'challenge_violation',
          studentId,
          awaySec: awayReturnEvent.awaySec,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && data.alert) {
            activateNewAlert(data.alert);
            if (proctorChannel) {
              proctorChannel.send({
                type: 'broadcast',
                event: 'direct_alert_ack',
                payload: {
                  student_id: studentId,
                  alert: data.alert,
                },
              });
            }
          }
        })
        .catch(() => {});
      return;
    }

    // 2) 대기 중(매복)인 경고가 있는지 서버 확인 후 즉시 폭발
    syncPendingFromServer(awayReturnEvent.awaySec);
  }, [awayReturnEvent, studentId, proctorChannel, activateNewAlert, syncPendingFromServer]);

  // 타자기 애니메이션
  useEffect(() => {
    if (!activeAlert || activeAlert.status !== 'pending') return;
    const targetLen = (activeAlert.message || '').length;
    if (typedLen >= targetLen) return;

    const timer = setTimeout(() => {
      setTypedLen((prev) => Math.min(targetLen, prev + 1));
    }, 28);
    return () => clearTimeout(timer);
  }, [activeAlert, typedLen]);

  // 집중 검증 챌린지 만료 감지
  useEffect(() => {
    if (!activeAlert || activeAlert.status !== 'challenge' || !activeAlert.challenge_end_at) return;
    const endMs = new Date(activeAlert.challenge_end_at).getTime();
    if (nowMs >= endMs) {
      setActiveAlert(null);
      setChallengeCompletedToast(true);
      if (proctorChannel && studentId) {
        proctorChannel.send({
          type: 'broadcast',
          event: 'direct_alert_ack',
          payload: {
            student_id: studentId,
            alert: { ...activeAlert, status: 'acked' },
          },
        });
      }
      setTimeout(() => setChallengeCompletedToast(false), 5000);
    }
  }, [activeAlert, nowMs, proctorChannel, studentId]);

  // 경고 확인/해제 제출
  const handleAcknowledge = async (note?: string) => {
    if (!activeAlert || !studentId || isSubmittingAck) return;
    setIsSubmittingAck(true);

    const elapsedSec = Math.max(1, Math.round((Date.now() - shownAtMsRef.current) / 1000));
    try {
      const res = await fetch('/api/monitoring/direct-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ack',
          studentId,
          alertId: activeAlert.id,
          ackElapsedSec: elapsedSec,
          ackNote: note || '확인 완료',
        }),
      });
      const data = await res.json();
      const nextAlert: DirectAlertPayload = data?.alert || {
        ...activeAlert,
        status: 'acked',
        acked_at: new Date().toISOString(),
        ack_elapsed_sec: elapsedSec,
      };

      if (proctorChannel) {
        proctorChannel.send({
          type: 'broadcast',
          event: 'direct_alert_ack',
          payload: {
            student_id: studentId,
            alert: nextAlert,
          },
        });
      }

      if (nextAlert.status === 'challenge') {
        setActiveAlert(nextAlert);
      } else {
        setActiveAlert(null);
      }
    } catch {
      setActiveAlert(null);
    } finally {
      setIsSubmittingAck(false);
    }
  };

  // 슬라이더 드래그 핸들러 (터치/마우스 공용)
  const updateSliderFromClientX = (clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPct(pct);
    if (pct >= 88) {
      setIsDraggingSlider(false);
      setSliderPct(100);
      handleAcknowledge('슬라이드 서약 제출');
    }
  };

  // ── 0. 집중 검증 챌린지 통과 토스트 ──
  if (!activeAlert && challengeCompletedToast) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9995] px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm shadow-2xl border border-emerald-400 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
        <Sparkles size={18} />
        <span>🎉 집중 검증 완료! 끝까지 흐트러짐 없이 잘 유지했습니다.</span>
      </div>
    );
  }

  if (!activeAlert || activeAlert.status === 'acked') return null;

  // ── 1. 👁️ 스나이퍼 상단 주시 HUD (화면 차단 없이 테두리 맥박 + 상단 고정 바) ──
  if (activeAlert.status === 'watching' || activeAlert.mode === 'SNIPER_WATCH') {
    return (
      <>
        {/* 테두리 적색 네온 맥박 */}
        <div
          className="fixed inset-0 z-[9980] pointer-events-none border-4 border-rose-500/80 shadow-[inset_0_0_45px_rgba(244,63,94,0.38)] animate-pulse"
        />
        {/* 상단 고정 감시 바 */}
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9990] w-[96%] max-w-4xl rounded-2xl bg-gradient-to-r from-rose-950/95 via-red-900/95 to-rose-950/95 text-white border border-rose-400/70 shadow-2xl px-4 py-2.5 flex items-center justify-between gap-3 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 animate-pulse">
              <Eye size={15} />
            </span>
            <p className="text-xs sm:text-sm font-black truncate">
              <span className="text-rose-300 mr-1.5">[실시간 집중 주시 중]</span>
              {activeAlert.message || `${studentName || '학생'} — 선생님이 현재 화면을 실시간으로 보고 있습니다.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof activeAlert.away_count_snapshot === 'number' && activeAlert.away_count_snapshot > 0 && (
              <span className="hidden md:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-black/40 border border-rose-400/40 text-rose-200">
                오늘 딴짓 {activeAlert.away_count_snapshot}회
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 text-[11px] font-black tracking-wider">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              LIVE
            </span>
          </div>
        </div>
      </>
    );
  }

  // ── 2. ⏳ 집중 검증 챌린지 HUD (확인 후 상단 N분 무이탈 카운트다운) ──
  if (activeAlert.status === 'challenge') {
    const endMs = activeAlert.challenge_end_at ? new Date(activeAlert.challenge_end_at).getTime() : nowMs;
    const startMs = activeAlert.challenge_started_at ? new Date(activeAlert.challenge_started_at).getTime() : nowMs;
    const totalMs = Math.max(1000, endMs - startMs);
    const remainSec = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
    const progressPct = Math.max(0, Math.min(100, ((nowMs - startMs) / totalMs) * 100));
    const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const ss = String(remainSec % 60).padStart(2, '0');

    return (
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9990] w-[96%] max-w-3xl rounded-2xl bg-slate-950/95 text-white border border-amber-400/60 shadow-2xl px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <ShieldAlert size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black truncate text-amber-300">
                선생님 집중 검증 진행 중 (화면 이탈·딴짓 금지!)
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                검증 시간 내 이탈 시 즉시 적색경보가 재발동됩니다
                {activeAlert.challenge_violations ? ` · 재이탈 적발 ${activeAlert.challenge_violations}회` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-400">남은 검증 시간</div>
              <div className="font-mono text-lg sm:text-xl font-black text-emerald-400 leading-none">
                {mm}:{ss}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-lime-400 to-emerald-400 transition-all duration-1000"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    );
  }

  // ── 3. 🔴 전체화면 적색경보 / 🧾 정밀 딴짓 영수증 / ⚡ 매복 검거 (모달 점령) ──
  const elapsedShownSec = Math.max(0, Math.floor((nowMs - shownAtMsRef.current) / 1000));
  const requiredWait = Math.max(0, activeAlert.countdown_sec ?? 5);
  const remainCountdown = Math.max(0, requiredWait - elapsedShownSec);
  const countdownReady = remainCountdown === 0;

  const elapsedMm = String(Math.floor(elapsedShownSec / 60)).padStart(2, '0');
  const elapsedSs = String(elapsedShownSec % 60).padStart(2, '0');

  const requiredPhrase = (activeAlert.required_phrase || '집중하겠습니다').trim();
  const isTypingMatched = typingInput.trim() === requiredPhrase;

  const isReceiptMode = activeAlert.mode === 'CLEAN_RECEIPT';
  const receiptItems = activeAlert.receipt_items || [];
  const receiptTotalSec = receiptItems.reduce((acc, item) => acc + (item.duration_sec || 0), 0);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto select-none"
      style={{
        boxShadow: 'inset 0 0 90px rgba(225, 29, 72, 0.55)',
      }}
    >
      {/* 외곽 적색 경보 테두리 */}
      <div className="fixed inset-2 sm:inset-3 rounded-3xl border-2 border-rose-500/70 pointer-events-none animate-pulse" />

      {/* 상단 레이저 스포트라이트 빛줄기 연출 */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-80 h-56 pointer-events-none opacity-45"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(244,63,94,0.65), transparent 72%)',
        }}
      />

      {/* 최상단 배지 줄 */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-2 mb-4 relative z-10 flex-wrap">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/70 text-rose-200 text-xs font-black shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span>● REC 실시간 감시 포착됨</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 text-xs font-bold shadow-lg">
          <VolumeX size={14} className="text-rose-400" />
          <span>완전 무음 모드 (주변 학생 모름)</span>
        </div>
      </div>

      {/* 메인 경고 카드 */}
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900/95 border-2 border-rose-500/80 shadow-[0_0_50px_rgba(225,29,72,0.4)] p-5 sm:p-7 relative z-10 space-y-5">
        {/* 복귀 매복 검거 또는 단체 경보 배너 */}
        {activeAlert.ambush_on_return && (
          <div className="rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 text-white px-4 py-3 flex items-center justify-between gap-2 shadow-lg animate-pulse">
            <div className="flex items-center gap-2 font-black text-sm sm:text-base">
              <Zap size={18} className="shrink-0" />
              <span>
                복귀 즉시 매복 검거!
                {activeAlert.ambush_away_sec
                  ? ` 방금 ${formatKoreanDuration(activeAlert.ambush_away_sec)} 동안 화면 이탈 포착`
                  : ''}
              </span>
            </div>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-black/30">자동 발동</span>
          </div>
        )}

        {activeAlert.is_group && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 px-3.5 py-2 text-rose-200 text-xs font-black flex items-center justify-between">
            <span>📢 단체 정숙 경보 ({activeAlert.group_count || 2}명 동시 수신)</span>
            {activeAlert.group_names && activeAlert.group_names.length > 0 && (
              <span className="text-rose-300/80 truncate ml-2">{activeAlert.group_names.join(' · ')}</span>
            )}
          </div>
        )}

        {/* 학생 텔레메트리 스냅샷 바 */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-2 font-black text-white">
            <Eye size={15} className="text-rose-400" />
            <span>
              {activeAlert.student_name || studentName}
              {activeAlert.student_grade || studentGrade ? ` (${activeAlert.student_grade || studentGrade})` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold">
            {typeof activeAlert.away_count_snapshot === 'number' && (
              <span className="text-amber-300">
                오늘 딴짓 {activeAlert.away_count_snapshot}회 (
                {formatKoreanDuration(activeAlert.away_total_sec_snapshot || 0)})
              </span>
            )}
            {activeAlert.location_snapshot && (
              <span className="text-slate-400 truncate max-w-[200px]">
                위치: {activeAlert.location_snapshot}
              </span>
            )}
          </div>
        </div>

        {/* 🧾 모드 ③: 5초 이하 실수/렉 필터링된 정밀 딴짓 영수증 */}
        {isReceiptMode ? (
          <div className="bg-white text-slate-900 rounded-2xl p-5 shadow-xl border-t-4 border-b-4 border-dashed border-rose-500 space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-black text-base sm:text-lg text-slate-900">
                <Receipt size={20} className="text-rose-600" />
                <span>실시간 딴짓 정밀 영수증 (변명 불가)</span>
              </div>
              {typeof activeAlert.filtered_out_count === 'number' && (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  🧹 {activeAlert.filtered_under_sec || 5}초 이하 실수/렉 {activeAlert.filtered_out_count}건 제외됨
                </span>
              )}
            </div>

            <div className="divide-y divide-dashed divide-slate-200 max-h-44 overflow-y-auto border-y border-slate-200 py-1 font-mono text-xs">
              {receiptItems.length === 0 ? (
                <div className="py-4 text-center text-slate-500 font-sans font-bold">
                  선생님이 직접 확인 후 발송한 집중 경고입니다.
                </div>
              ) : (
                receiptItems.map((item) => {
                  const sTime = new Date(item.started_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const eTime = new Date(item.ended_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                      <span className="text-slate-600 shrink-0">
                        {sTime} ~ {eTime}
                      </span>
                      <span className="font-black text-rose-600 shrink-0">
                        {formatKoreanDuration(item.duration_sec)}
                      </span>
                      <span className="text-slate-500 truncate font-sans text-right">
                        {item.location_title || item.context || '이탈'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {receiptItems.length > 0 && (
              <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-black text-rose-700">
                <span>확정 딴짓 합계 ({receiptItems.length}건)</span>
                <span>총 {formatKoreanDuration(receiptTotalSec)}</span>
              </div>
            )}

            <div className="bg-slate-900 text-white rounded-xl p-3.5 text-sm sm:text-base font-bold leading-relaxed">
              📢 선생님 메시지: {activeAlert.message}
            </div>
          </div>
        ) : (
          /* 🔴 모드 ②: 타자기 효과 강렬한 선생님 다이렉트 메시지 */
          <div className="py-4 px-2 text-center space-y-4">
            <div className="inline-flex items-center gap-2 text-rose-400 font-black text-xs uppercase tracking-widest">
              <AlertTriangle size={15} />
              <span>선생님 다이렉트 경고 메시지</span>
            </div>
            <p className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-snug tracking-tight whitespace-pre-wrap break-keep drop-shadow-[0_0_18px_rgba(244,63,94,0.45)]">
              {(activeAlert.message || '').slice(0, typedLen)}
              {typedLen < (activeAlert.message || '').length && (
                <span className="inline-block w-1 h-7 bg-rose-500 ml-1 align-middle animate-pulse" />
              )}
            </p>
          </div>
        )}

        {/* 실시간 열람 타이머 */}
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
          <Clock size={13} className="text-rose-400 animate-spin" style={{ animationDuration: '6s' }} />
          <span>
            선생님이 실시간 열람 여부를 확인 중입니다 (경과 {elapsedMm}:{elapsedSs})
          </span>
        </div>

        {/* 🔒 잠금 해제 액션 영역 (카운트다운 / 직접 타이핑 / 슬라이드 서약) */}
        <div className="pt-3 border-t border-slate-800 space-y-3">
          {!countdownReady && (
            <div className="text-center text-xs font-black text-amber-300">
              🔒 경고 내용을 끝까지 확인하세요 — {remainCountdown}초 후 해제 활성화
            </div>
          )}

          {activeAlert.unlock_method === 'typing' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Lock size={13} className="text-rose-400" />
                  닫으려면 아래 문장을 정확히 입력하세요
                </span>
                <span className="font-black text-rose-300">"{requiredPhrase}"</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={typingInput}
                  onChange={(e) => setTypingInput(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder={`입력: ${requiredPhrase}`}
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 focus:border-rose-500 text-white font-black text-sm sm:text-base outline-none"
                />
                <button
                  type="button"
                  disabled={!countdownReady || !isTypingMatched || isSubmittingAck}
                  onClick={() => handleAcknowledge(`반성문 입력 완료: ${typingInput.trim()}`)}
                  className={`px-5 py-3 rounded-2xl font-black text-sm transition-all shrink-0 flex items-center justify-center gap-1.5 ${
                    countdownReady && isTypingMatched
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {!countdownReady
                      ? `${remainCountdown}초 대기`
                      : isTypingMatched
                      ? '확인 및 학습 복귀'
                      : '문구 입력 필요'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {activeAlert.unlock_method === 'slider' && (
            <div className="space-y-2">
              <div
                ref={sliderTrackRef}
                onPointerDown={(e) => {
                  if (!countdownReady || isSubmittingAck) return;
                  setIsDraggingSlider(true);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  updateSliderFromClientX(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (!isDraggingSlider || !countdownReady) return;
                  updateSliderFromClientX(e.clientX);
                }}
                onPointerUp={() => {
                  if (!isDraggingSlider) return;
                  setIsDraggingSlider(false);
                  if (sliderPct < 88) setSliderPct(0);
                }}
                className={`relative h-14 rounded-2xl border-2 overflow-hidden flex items-center justify-center transition-all touch-none ${
                  countdownReady
                    ? 'bg-rose-950/60 border-rose-500/80 cursor-grab active:cursor-grabbing'
                    : 'bg-slate-900 border-slate-700 opacity-60 cursor-not-allowed'
                }`}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600/70 to-red-500/70 transition-all duration-75"
                  style={{ width: `${sliderPct}%` }}
                />
                <div
                  className="absolute left-1.5 top-1.5 bottom-1.5 w-11 rounded-xl bg-white text-rose-600 flex items-center justify-center shadow-lg font-black transition-all duration-75"
                  style={{
                    left: `calc(${Math.min(86, sliderPct)}% + 6px)`,
                  }}
                >
                  <ChevronRight size={22} />
                </div>
                <span className="relative z-10 text-xs sm:text-sm font-black text-white pointer-events-none">
                  {countdownReady
                    ? `👉 끝까지 밀어서 [${requiredPhrase}] 서약 제출`
                    : `🔒 ${remainCountdown}초 후 슬라이드 잠금 해제 가능`}
                </span>
              </div>
            </div>
          )}

          {activeAlert.unlock_method === 'countdown' && (
            <button
              type="button"
              disabled={!countdownReady || isSubmittingAck}
              onClick={() => handleAcknowledge('확인 완료')}
              className={`w-full py-3.5 rounded-2xl font-black text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
                countdownReady
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-xl cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
              }`}
            >
              <CheckCircle2 size={18} />
              <span>
                {countdownReady
                  ? '🙇 확인했습니다. 바로 조용히 집중하겠습니다 (선생님께 전송)'
                  : `🔒 확인 중... (${remainCountdown}초 후 학습 복귀 가능)`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
