'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Play, Pause, AlertTriangle, ShieldAlert, Zap, RotateCcw, CheckCircle, Lock, Edit3 } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false); // 시간 수정 모드
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const setTestRunning = useCallback((running: boolean) => {
    setIsRunning(running);
    onStatusChange(running);
  }, [onStatusChange]);

  const resetLocalState = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setIsLocked(false);
    setIsFinished(false);
    setTimeLeft(0);
    onStatusChange(false);
  }, [onStatusChange]);

  // 📥 [세션 복구]
  useEffect(() => {
    const restoreSession = async () => {
      const { data } = await supabase.from('students').select('*').eq('id', studentId).single();
      if (data) {
        if (data.test_status === 'FINISHED') {
          setIsFinished(true);
          setTimeLeft(0);
        } else if (data.test_status === 'TESTING' && data.test_remaining_sec > 0) {
          const lastUpdate = new Date(data.updated_at).getTime();
          const elapsed = Math.floor((new Date().getTime() - lastUpdate) / 1000);
          const actualRemaining = Math.max(0, data.test_remaining_sec - elapsed);
          if (actualRemaining > 0) {
            setTimeLeft(actualRemaining);
            setTestRunning(true);
          } else {
            setIsFinished(true);
            await supabase.from('students').update({ test_status: 'FINISHED', test_remaining_sec: 0 }).eq('id', studentId);
          }
        } else if (data.test_status === 'AWAY') {
          setTimeLeft(data.test_remaining_sec || 0);
          setIsLocked(true);
        } else if (data.test_status === 'PAUSED') {
          setTimeLeft(data.test_remaining_sec || 0);
        }
        if (data.test_duration_min) setMinutes(data.test_duration_min);
      }
      setIsInitialLoading(false);
    };
    restoreSession();
  }, [studentId, setTestRunning, resetLocalState]);

  // 📡 [실시간 구독]
  useEffect(() => {
    if (!studentId) return;
    const channel = supabase.channel(`test_sync_${studentId}`).on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${studentId}` }, 
      (payload) => {
        const newStatus = payload.new.test_status;
        if (newStatus === 'IDLE') resetLocalState();
        else if (newStatus === 'TESTING' && !isRunning && !isFinished) {
          if (payload.new.test_remaining_sec !== undefined) setTimeLeft(payload.new.test_remaining_sec);
          setIsLocked(false);
          setTestRunning(true);
        }
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [studentId, resetLocalState, isRunning, isFinished, setTestRunning]);

  // 🚨 [이탈 감지]
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && isRunning) {
        const snapshotTime = timeLeft;
        setTestRunning(false);
        setIsLocked(true);
        await supabase.from('students').update({ 
          test_status: 'AWAY', test_remaining_sec: snapshotTime, last_away_at: new Date().toISOString() 
        }).eq('id', studentId);
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
    if (isLocked || isFinished || isEditing) return;
    const now = new Date().toISOString();
    let currentSec = timeLeft > 0 ? timeLeft : minutes * 60;
    if (timeLeft === 0) setTimeLeft(currentSec);
    setTestRunning(true);
    await supabase.from('students').update({ 
      test_status: 'TESTING', test_start_at: now, test_duration_min: minutes, test_remaining_sec: currentSec
    }).eq('id', studentId);
  };

  // ⏸️ [일시 정지]
  const handlePause = async () => {
    const snapshotTime = timeLeft;
    setTestRunning(false);
    await supabase.from('students').update({ 
      test_status: 'PAUSED', test_remaining_sec: snapshotTime 
    }).eq('id', studentId);
  };

  // ✅ [종료]
  const handleComplete = async () => {
    if (window.confirm("시험을 종료하시겠습니까? 종료 후에는 재시작이 불가능합니다.")) {
      setTestRunning(false);
      setIsFinished(true); 
      await supabase.from('students').update({ test_status: 'FINISHED', test_remaining_sec: 0 }).eq('id', studentId);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 🔥 시간 수정 확정 로직 (최소 1분 보정)
  const finalizeMinutes = () => {
    if (minutes < 1) setMinutes(1);
    setIsEditing(false);
  };

  if (isInitialLoading) return (
    <div className="flex items-center justify-center py-20 text-indigo-400 font-black animate-pulse uppercase tracking-widest text-sm">
      Syncing Session...
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-12 animate-in fade-in zoom-in duration-700 relative">
      
      {/* 🔒 잠금 오버레이 */}
      {(isLocked || isFinished) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500 p-6">
          <div className="bg-white/10 p-10 rounded-[50px] border border-white/20 text-center space-y-6 shadow-2xl max-w-sm mx-auto">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-lg animate-bounce ${isFinished ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              {isFinished ? <CheckCircle size={40} className="text-white" /> : <Lock size={40} className="text-white" />}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">{isFinished ? 'Test Completed' : 'Access Denied'}</h2>
              <p className={isFinished ? "text-emerald-200 font-bold text-sm" : "text-rose-200 font-bold text-sm"}>
                {isFinished ? "시험이 성공적으로 종료되었습니다." : "화면 이탈이 감지되어 시험이 잠겼습니다."}
              </p>
            </div>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest animate-pulse">선생님의 최종 확인을 기다리는 중...</p>
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
          
          <div className="relative flex flex-col items-center">
            {!isRunning && timeLeft === 0 && !isFinished ? (
              <div className="flex flex-col items-center gap-4">
                {isEditing ? (
                  <div className="flex items-center gap-4 animate-in zoom-in duration-300">
                    <input 
                      type="number" 
                      autoFocus
                      // 🔥 minutes가 0이거나 빈값이면 화면엔 빈칸으로 표시
                      value={minutes === 0 ? "" : minutes} 
                      onChange={(e) => {
                        const val = e.target.value;
                        // 🔥 지우는 도중에는 0으로 세팅 (제약 없이 다 지워지게)
                        setMinutes(val === "" ? 0 : Number(val));
                      }}
                      onBlur={finalizeMinutes}
                      onKeyDown={(e) => e.key === 'Enter' && finalizeMinutes()}
                      className="bg-white/10 border-b-4 border-indigo-500 text-7xl md:text-8xl font-black text-white text-center w-40 py-2 focus:outline-none transition-all tabular-nums"
                    />
                    <span className="text-3xl font-black text-slate-500 italic mt-6">MIN</span>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="group flex items-center gap-4 hover:scale-105 transition-transform"
                  >
                    <div className="text-8xl md:text-9xl font-black text-white italic tracking-tighter tabular-nums">
                      {minutes}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-3xl font-black text-slate-500 italic">MIN</span>
                      <Edit3 size={20} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                )}
                <p className="text-slate-500 font-bold tracking-[0.2em] uppercase text-[10px]">숫자를 클릭하여 시간을 수정하세요</p>
              </div>
            ) : (
              <div className="text-8xl md:text-9xl font-black text-white italic tracking-tighter tabular-nums">
                {formatTime(timeLeft)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-indigo-400 font-black text-xs uppercase tracking-[0.2em] mt-8">
            {isRunning ? <>Proctoring in progress...</> : <span className="text-rose-500 italic">{studentName} is waiting</span>}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md px-6 flex flex-col gap-4">
        {!isRunning ? (
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleStart}
              className={`w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-xl shadow-2xl flex items-center justify-center gap-3 transition-all ${ (isLocked || isFinished || isEditing) ? 'opacity-50 cursor-not-allowed' : '' }`}
              disabled={isLocked || isFinished || isEditing}
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