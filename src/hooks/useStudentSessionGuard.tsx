'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, ShieldAlert, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';

interface StudentSessionGuardOptions {
  studentId?: string;
  studentName?: string;
  enabled?: boolean;
  onLogout?: () => void;
  // 설정값 (기본: 10분 = 600,000ms, 경고: 만료 1분 전 = 60,000ms)
  timeoutMs?: number;
  warningMs?: number;
}

export function useStudentSessionGuard({
  studentId,
  studentName,
  enabled = true,
  onLogout,
  timeoutMs = 10 * 60 * 1000, // 10분
  warningMs = 60 * 1000,      // 1분 전 경고
}: StudentSessionGuardOptions) {
  // 모달 상태
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(60);
  const [kickedOutReason, setKickedOutReason] = useState<'duplicate_login' | 'timeout' | null>(null);

  // 세션 고유 식별자 (현재 브라우저 탭/인스턴스 고유 ID)
  const sessionIdRef = useRef<string>('');
  const lastActivityTimeRef = useRef<number>(Date.now());
  const channelRef = useRef<any>(null);

  // 1. 세션 식별자 생성 및 유지
  useEffect(() => {
    if (!sessionIdRef.current) {
      // sessionStorage를 이용해 새로고침 시에는 동일 세션 ID 유지
      let existingSession = '';
      try {
        existingSession = sessionStorage.getItem(`eduest_session_${studentId}`) || '';
      } catch (e) {}

      if (!existingSession) {
        existingSession = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        try {
          sessionStorage.setItem(`eduest_session_${studentId}`, existingSession);
        } catch (e) {}
      }
      sessionIdRef.current = existingSession;
    }
  }, [studentId]);

  // 활동 감지 갱신 (쓰로틀링 3초)
  const lastThrottleRef = useRef<number>(0);
  const registerUserActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current > 3000) {
      lastThrottleRef.current = now;
      lastActivityTimeRef.current = now;

      // 만약 경고 모달이 떠있었다면 활동 감지 시 닫기
      if (showInactivityWarning) {
        setShowInactivityWarning(false);
      }
    }
  }, [showInactivityWarning]);

  // 사용자 명시적 세션 연장 클릭
  const extendSession = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    lastThrottleRef.current = Date.now();
    setShowInactivityWarning(false);
  }, []);

  // 2. [기능 1] 10분 무입력 타이머
  useEffect(() => {
    if (!enabled || !studentId || kickedOutReason) return;

    // 감지 이벤트 등록
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => registerUserActivity();

    events.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    // 1초마다 무입력 경과 시간 확인
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityTimeRef.current;
      const remainingMs = timeoutMs - elapsed;

      if (remainingMs <= 0) {
        // 10분 초과 -> 자동 로그아웃
        setShowInactivityWarning(false);
        setKickedOutReason('timeout');
        clearInterval(interval);
        if (onLogout) onLogout();
      } else if (remainingMs <= warningMs) {
        // 1분 미만 남음 -> 경고 모달 표시 및 카운트다운
        setShowInactivityWarning(true);
        setCountdownSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
      } else {
        if (showInactivityWarning) {
          setShowInactivityWarning(false);
        }
      }
    }, 1000);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
      clearInterval(interval);
    };
  }, [enabled, studentId, timeoutMs, warningMs, kickedOutReason, registerUserActivity, showInactivityWarning, onLogout]);

  // 3. [기능 2] 단일 세션 (1계정당 1개 로그인 - 다른 기기에서 로그인 시 기존 기기 자동 로그아웃)
  useEffect(() => {
    if (!enabled || !studentId || kickedOutReason) return;

    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;

    // 학생 전용 실시간 세션 채널 구독
    const sessionChannelName = `student_auth_session_${studentId}`;
    const channel = supabase.channel(sessionChannelName);
    channelRef.current = channel;

    // 다른 기기에서 로그인 브로드캐스트를 보냈는지 청취
    channel.on('broadcast', { event: 'new_login_session' }, (payload: any) => {
      const data = payload?.payload;
      if (data && data.studentId === studentId && data.sessionId !== currentSessionId) {
        // 다른 기기나 다른 브라우저에서 새로 접속함 -> 현재 기기 세션 강제 종료
        console.warn(`[EDUEST Auth] Duplicate login detected for student ${studentId}. Kicking current session.`);
        setKickedOutReason('duplicate_login');
        if (onLogout) onLogout();
      }
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        // 내가 새로 접속했음을 채널에 브로드캐스트하여 이전 기기를 튕겨냄
        channel.send({
          type: 'broadcast',
          event: 'new_login_session',
          payload: {
            studentId,
            sessionId: currentSessionId,
            loggedInAt: Date.now(),
          },
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, studentId, kickedOutReason, onLogout]);

  // 재로그인 또는 홈으로 이동 핸들러
  const handleReloadOrHome = () => {
    try {
      if (studentId) {
        sessionStorage.removeItem(`eduest_session_${studentId}`);
      }
    } catch (e) {}
    window.location.reload();
  };

  const handleGoHome = () => {
    try {
      if (studentId) {
        sessionStorage.removeItem(`eduest_session_${studentId}`);
      }
    } catch (e) {}
    window.location.href = '/';
  };

  // 4. 모달 UI 렌더링 컴포넌트 반환
  const renderModals = () => {
    // A. 다른 기기 중복 로그인 차단 모달
    if (kickedOutReason === 'duplicate_login') {
      return (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-rose-500/30 rounded-3xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl shadow-rose-950/50">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert size={34} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">다른 기기에서 로그인되었습니다</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-rose-400 font-bold">{studentName || '학생'}</strong>님의 계정이 다른 기기 또는 브라우저에서 로그인되어, 안전을 위해 현재 접속이 종료되었습니다.
              </p>
              <p className="text-[11px] text-slate-400">
                (에듀이스트는 1계정당 1개 기기 동시 접속을 기본 원칙으로 합니다)
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGoHome}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-all"
              >
                메인 홈으로
              </button>
              <button
                onClick={handleReloadOrHome}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-rose-600/30"
              >
                현재 기기에서 다시 접속
              </button>
            </div>
          </div>
        </div>
      );
    }

    // B. 10분 무입력 만료 자동 로그아웃 모달
    if (kickedOutReason === 'timeout') {
      return (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-amber-500/30 rounded-3xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl shadow-amber-950/50">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <Clock size={34} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">자동 로그아웃 안내</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                10분간 입력 및 활동이 감지되지 않아 계정 보안을 위해 자동으로 안전 로그아웃되었습니다.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGoHome}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-all"
              >
                메인 홈으로
              </button>
              <button
                onClick={handleReloadOrHome}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/30"
              >
                다시 로그인
              </button>
            </div>
          </div>
        </div>
      );
    }

    // C. 1분 전 경고 & 세션 연장 모달
    if (showInactivityWarning) {
      return (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-5 shadow-2xl">
            <div className="w-12 h-12 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto text-amber-400 animate-pulse">
              <AlertTriangle size={26} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-black text-white">자동 로그아웃 예정 안내</h4>
              <p className="text-xs text-slate-300">
                활동이 없어 <span className="text-amber-400 font-black text-sm">{countdownSeconds}초 후</span> 자동 로그아웃됩니다.
              </p>
              <p className="text-[11px] text-slate-400">
                학습을 계속하시려면 아래 버튼을 눌러주세요!
              </p>
            </div>
            <button
              onClick={extendSession}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className="animate-spin" />
              <span>로그인 유지 (시간 연장)</span>
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return {
    registerUserActivity,
    extendSession,
    renderModals,
    kickedOutReason,
  };
}
