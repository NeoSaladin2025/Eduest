'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Play, Pause, AlertTriangle, ShieldAlert, Zap, RotateCcw, CheckCircle, Lock } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface TestProps {
  studentId: string;
  studentName: string;
  onStatusChange: (isRunning: boolean) => void;
}

export default function TestModule({ studentId, studentName, onStatusChange }: TestProps) {
  const [minutes, setMinutes] = useState(50); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isLocked, setIsLocked] = useState(false); 
  const [isFinished, setIsFinished] = useState(false); 
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 🛡️ 부모 상태 동기화 헬퍼
  const setTestRunning = useCallback((running: boolean) => {
    setIsRunning(running);
    onStatusChange(running);
  }, [onStatusChange]);

  // 🔄 [리셋 핵심] 모든 락과 타이머를 강제로 초기화하는 함수
  const resetLocalState = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setIsLocked(false);   // 이탈 잠금 해제
    setIsFinished(false); // 종료 잠금 해제
    setTimeLeft(0);
    onStatusChange(false);
    console.log("Local state has been fully reset.");
  }, [onStatusChange]);

  // 📥 [세션 복구] 페이지 로드 시 DB에서 상태 불러오기
  useEffect(() => {
    const restoreSession = async () => {
      const { data } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      if (data) {
        if (data.test_status === 'FINISHED') {
          setIsFinished(true);
          setTestRunning(false);
          setTimeLeft(0);
        } 
        else if (data.test_status === 'TESTING' && data.test_remaining_sec > 0) {
          const lastUpdate = new Date(data.updated_at).getTime();
          const elapsed = Math.floor((new Date().getTime() - lastUpdate) / 1000);
          const actualRemaining = Math.max(0, data.test_remaining_sec - elapsed);

          if (actualRemaining > 0) {
            setTimeLeft(actualRemaining);
            setTestRunning(true);
          } else {
            setIsFinished(true);
            setTestRunning(false);
            await supabase.from('students').update({ test_status: 'FINISHED', test_remaining_sec: 0 }).eq('id', studentId);
          }
        } 
        else if (data.test_status === 'AWAY') {
          setTimeLeft(data.test_remaining_sec || 0);
          setIsLocked(true);
          setTestRunning(false);
        }
        else if (data.test_status === 'PAUSED') {
          setTimeLeft(data.test_remaining_sec || 0);
          setTestRunning(false);
        }
        
        if (data.test_duration_min) setMinutes(data.test_duration_min);
      }
      setIsInitialLoading(false);
    };

    restoreSession();
  }, [studentId, setTestRunning, resetLocalState]);

  // 📡 [실시간 구독] 선생님의 원격 제어 명령 감시
  useEffect(() => {
    if (!studentId) return;

    const channel = supabase
      .channel(`test_sync_${studentId}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${studentId}` }, 
        (payload) => {
          const newStatus = payload.new.test_status;
          console.log("Remote Status Received:", newStatus);
          
          // 1. 🔥 선생님이 'IDLE'로 바꾼 경우 (강제 초기화)
          if (newStatus === 'IDLE') {
            resetLocalState();
          } 
          // 2. 선생님이 'TESTING'으로 바꾼 경우 (정상 복귀 승인)
          else if (newStatus === 'TESTING' && !isRunning) {
            // 종료 상태였다면 복귀 승인이 무의미하므로 무시, 그 외 상태에서만 작동
            if (!isFinished) {
              if (payload.new.test_remaining_sec !== undefined) {
                setTimeLeft(payload.new.test_remaining_sec);
              }
              setIsLocked(false);
              setTestRunning(true);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId, resetLocalState, isRunning, isFinished, setTestRunning]);

  // 🚨 [이탈 감지]
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && isRunning) {
        const snapshotTime = timeLeft;
        setTestRunning(false);
        setIsLocked(true);

        await supabase
          .from('students')
          .update({ 
            test_status: 'AWAY', 
            test_remaining_sec: snapshotTime,
            last_away_at: new Date().toISOString() 
          })
          .eq('id', studentId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, studentId, setTestRunning, timeLeft]);

  // ⏳ [타이머 엔진]
  useEffect(() => {
    if (isRunning && timeLeft > 0 && !isLocked && !isFinished) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, timeLeft, isLocked, isFinished]);

  // ▶️ [시작 / 이어하기]
  const handleStart = async () => {
    if (isLocked || isFinished) return;

    const now = new Date().toISOString();
    let currentSec = timeLeft > 0 ? timeLeft : minutes * 60;

    if (timeLeft === 0) setTimeLeft(currentSec);
    setTestRunning(true);
    
    await supabase.from('students').update({ 
      test_status: 'TESTING', 
      test_start_at: now,
      test_duration_min: minutes,
      test_remaining_sec: currentSec
    }).eq('id', studentId);
  };

  // ⏸️ [일시 정지]
  const handlePause = async () => {
    const snapshotTime = timeLeft;
    setTestRunning(false);
    await supabase.from('students').update({ 
      test_status: 'PAUSED',
      test_remaining_sec: snapshotTime 
    }).eq('id', studentId);
  };

  // ✅ [종료]
  const handleComplete = async () => {
    if (window.confirm("시험을 종료하시겠습니까? 종료 후에는 선생님의 승인 없이 재시작이 불가능합니다.")) {
      setTestRunning(false);
      setIsFinished(true); // 로컬에서 즉시 종료 락
      await supabase.from('students').update({ 
        test_status: 'FINISHED',
        test_remaining_sec: 0 
      }).eq('id', studentId);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (isInitialLoading) return (
    <div className="flex items-center justify-center py-20 text-indigo-400 font-black animate-pulse uppercase tracking-widest text-sm">
      Syncing Session...
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-12 animate-in fade-in zoom-in duration-700 relative">
      
      {/* 🔒 [통합 잠금 오버레이] 이탈 혹은 종료 시 작동 */}
      {(isLocked || isFinished) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500 p-6">
          <div className="bg-white/10 p-10 rounded-[50px] border border-white/20 text-center space-y-6 shadow-2xl max-w-sm mx-auto">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-lg animate-bounce ${isFinished ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-rose-500 shadow-rose-500/50'}`}>
              {isFinished ? <CheckCircle size={40} className="text-white" /> : <Lock size={40} className="text-white" />}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">
                {isFinished ? 'Test Completed' : 'Access Denied'}
              </h2>
              <p className={isFinished ? "text-emerald-200 font-bold text-sm" : "text-rose-200 font-bold text-sm"}>
                {isFinished ? "시험이 안전하게 종료되었습니다." : "화면 이탈이 감지되어 시험이 잠겼습니다."}
              </p>
            </div>
            <div className="pt-4 border-t border-white/10">
              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest animate-pulse">
                선생님의 최종 확인을 기다리는 중...
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-[0.3em] mb-2">
          <Zap size={14} fill="currentColor" /> Digital Proctoring System
        </div>
        <h2 className="text-3xl font-black italic text-white tracking-tighter uppercase">
          Focus Mode: <span className="text-indigo-500">{(isRunning && !isLocked && !isFinished) ? 'Locked' : 'Active'}</span>
        </h2>
      </div>

      <div className="relative group">
        <div className={`absolute inset-0 bg-indigo-600/20 blur-[100px] rounded-full transition-all duration-1000 ${isRunning ? 'opacity-100 scale-125' : 'opacity-0'}`}></div>
        <div className="relative bg-white/5 border border-white/10 backdrop-blur-3xl rounded-[64px] p-16 shadow-3xl text-center min-w-[340px] md:min-w-[450px]">
          <ShieldAlert size={48} className={`mx-auto mb-8 transition-all duration-500 ${isRunning ? 'text-indigo-400 animate-pulse' : 'text-slate-700'}`} />
          
          <div className="text-8xl md:text-9xl font-black text-white italic tracking-tighter tabular-nums">
            {(timeLeft === 0 && !isRunning && !isFinished) ? minutes : formatTime(timeLeft)}
          </div>
          <div className="flex items-center justify-center gap-3 text-indigo-400 font-black text-xs uppercase tracking-[0.2em] mt-4">
            {isRunning ? <>Proctoring in progress...</> : <span className="text-rose-500 italic">{studentName} is waiting</span>}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md px-6 flex flex-col gap-4">
        {!isRunning ? (
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleStart}
              className={`w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-xl shadow-2xl flex items-center justify-center gap-3 transition-all ${ (isLocked || isFinished) ? 'opacity-50 cursor-not-allowed' : '' }`}
              disabled={isLocked || isFinished}
            >
              {timeLeft > 0 ? 'RESUME TEST' : 'START TEST'} <Play size={20} fill="currentColor" />
            </button>

            {timeLeft > 0 && (
              <button 
                onClick={handleComplete}
                className={`w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[32px] font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all ${ (isLocked || isFinished) ? 'opacity-50 cursor-not-allowed' : '' }`}
                disabled={isLocked || isFinished}
              >
                FINISH TEST <CheckCircle size={20} />
              </button>
            )}
          </div>
        ) : (
          <button 
            onClick={handlePause}
            className="w-full py-6 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-[32px] font-black text-xl flex items-center justify-center gap-3 transition-all"
          >
            <Pause size={20} fill="currentColor" /> PAUSE
          </button>
        )}
      </div>
    </div>
  );
}