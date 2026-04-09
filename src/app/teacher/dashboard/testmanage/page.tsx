'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Users, Timer, AlertCircle, CheckCircle2, PauseCircle, PlayCircle, Search, ShieldCheck, RotateCcw, Filter, Clock, Check, ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation'; // useRouter 추가

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TabType = 'incident' | 'testing' | 'waiting';

type AlertNotification = {
  id: string;
  studentName: string;
  grade: string;
  status: 'AWAY' | 'PAUSED' | 'FINISHED';
  remainingSec: number;
};

export default function TestManagePage() {
  const router = useRouter(); // router 초기화
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('testing'); 
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const prevStudentsRef = useRef<any[]>([]);
  const isInitializedRef = useRef(false);

  // stale closure 방지: 매 렌더마다 최신 함수 참조 유지
  const addNotificationRef = useRef<(student: any) => void>(() => {});

  const playAlertSound = useCallback((status: 'AWAY' | 'PAUSED' | 'FINISHED') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      if (status === 'AWAY') {
        // 빰빰빰! - 3연속 긴급 경보
        [0, 0.28, 0.56].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1050, ctx.currentTime + delay);
          osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + delay + 0.2);
          gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.22);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.22);
        });
      } else if (status === 'PAUSED') {
        // 빰- 하강 경고음
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.55);
      } else if (status === 'FINISHED') {
        // 딩동 - 완료 멜로디
        [523, 659, 784, 1047].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
          gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.13);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.2);
          osc.start(ctx.currentTime + i * 0.13);
          osc.stop(ctx.currentTime + i * 0.13 + 0.2);
        });
      }
    } catch {}
  }, []);

  const addNotification = useCallback((student: any) => {
    const status = student.test_status as 'AWAY' | 'PAUSED' | 'FINISHED';

    // 소리
    playAlertSound(status);

    // 진동 (Android 모바일)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (status === 'AWAY')    navigator.vibrate([300, 100, 300, 100, 300]);
      else if (status === 'PAUSED')   navigator.vibrate([200, 150, 200]);
      else if (status === 'FINISHED') navigator.vibrate([100, 80, 100, 80, 500]);
    }

    // 윈도우 OS 알림
    const osLabels: Record<string, string> = {
      AWAY: '🚨 자리 이탈',
      PAUSED: '⏸️ 일시 정지',
      FINISHED: '✅ 시험 완료',
    };
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const rem = student.test_remaining_sec || 0;
      const remStr = rem > 0 ? ` · 남은 시간 ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}` : '';
      try {
        new Notification(`${student.name}  ${osLabels[status] ?? status}`, {
          body: `${student.grade}${remStr}`,
          icon: '/favicon.ico',
          tag: `alert-${student.id}`,
        });
      } catch {}
    }

    // 화면 내 토스트
    const notif: AlertNotification = {
      id: `${student.id}-${Date.now()}`,
      studentName: student.name,
      grade: student.grade,
      status,
      remainingSec: student.test_remaining_sec || 0,
    };
    setNotifications((prev) => [notif, ...prev].slice(0, 5));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    }, 7000);
  }, [playAlertSound]);

  // ref를 항상 최신 함수로 유지
  addNotificationRef.current = addNotification;

  // 윈도우 알림 권한 초기화 및 요청
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      return;
    }
    setNotifPermission(Notification.permission);
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => setNotifPermission(p));
    }
  }, []);

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      // 즉시 테스트 알림 발송
      new Notification('✅ 알림 연결 성공', { body: '이제 윈도우 알림이 전송됩니다.' });
    }
  };

  useEffect(() => {
    // 1초마다 현재 시간 업데이트 (실시간 싱크 계산용)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const fetchStudents = async () => {
      const { data } = await supabase.from('students').select('*').order('name');
      setStudents(data || []);
      prevStudentsRef.current = data || [];
      setLoading(false);
      isInitializedRef.current = true;
    };

    fetchStudents();

    // 📡 실시간 구독 로직
    const channel = supabase
      .channel('proctoring_room')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, (payload) => {
        if (isInitializedRef.current) {
          const newStatus = payload.new.test_status;
          if (['AWAY', 'PAUSED', 'FINISHED'].includes(newStatus)) {
            const prev = prevStudentsRef.current.find((s) => String(s.id) === String(payload.new.id));
            // 이전 상태와 다를 때만 알림 (prev 없으면 무조건 알림)
            if (!prev || prev.test_status !== newStatus) {
              addNotificationRef.current(payload.new);
            }
          }
        }
        setStudents((current) => {
          const updated = current.map((s) => String(s.id) === String(payload.new.id) ? payload.new : s);
          prevStudentsRef.current = updated;
          return updated;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  // --- 🔥 [핵심] 실시간 남은 시간 동기화 계산 로직 ---
  const getLiveRemainingTime = (s: any) => {
    // 1. 데이터가 없거나 대기/종료 상태면 0 혹은 기록된 값 반환
    if (!s.test_remaining_sec && s.test_remaining_sec !== 0) return 0;
    if (s.test_status === 'IDLE' || s.test_status === 'FINISHED') return 0;
    
    // 2. 일시정지(PAUSED)나 이탈(AWAY) 상태면 학생이 마지막으로 멈춘 시간을 그대로 반환 (정지 상태)
    if (s.test_status !== 'TESTING') {
      return s.test_remaining_sec;
    }

    // 3. 시험 중(TESTING)일 때: [학생이 보고한 마지막 시간] - [보고한 시점부터 지금까지 흐른 시간]
    const lastSyncTime = new Date(s.updated_at).getTime(); // DB 업데이트 시점
    const elapsedSinceSync = Math.floor((currentTime.getTime() - lastSyncTime) / 1000);
    
    const liveTime = s.test_remaining_sec - elapsedSinceSync;
    return Math.max(0, liveTime); // 0초 이하로 내려가지 않게
  };

  // 시간 포맷팅 (mm:ss)
  const formatRemainingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // --- 필터링 및 소팅 로직 ---
  const processedList = useMemo(() => {
    let list = students.filter(s => {
      if (activeTab === 'incident') return ['AWAY', 'PAUSED', 'FINISHED'].includes(s.test_status);
      if (activeTab === 'testing') return s.test_status === 'TESTING';
      if (activeTab === 'waiting') return s.test_status === 'IDLE' || !s.test_status;
      return true;
    });

    if (selectedGrade !== 'ALL') {
      list = list.filter(s => s.grade === selectedGrade);
    }

    if (searchTerm) {
      list = list.filter(s => s.name.includes(searchTerm));
    }

    // 소팅: 시험 중일 때 남은 실시간 시간이 적은 순으로 정렬
    if (activeTab === 'testing') {
      list.sort((a, b) => getLiveRemainingTime(a) - getLiveRemainingTime(b));
    }

    return list;
  }, [students, activeTab, selectedGrade, searchTerm, currentTime]);

  const grades = ['ALL', ...Array.from(new Set(students.map(s => s.grade))).sort()];

  const handleForceReset = async (student: any) => {
    if (!window.confirm(`${student.name} 학생을 강제 초기화할까요?`)) return;
    await supabase.from('students').update({ 
      test_status: 'IDLE', test_start_at: null, last_away_at: null, test_remaining_sec: null 
    }).eq('id', student.id);
  };

  const handleApproveReturn = async (student: any) => {
    if (!window.confirm(`${student.name} 학생을 시험으로 복귀시킬까요?`)) return;
    // 복귀 시점의 시간을 다시 스냅샷으로 찍어서 전송 (싱크 보정)
    await supabase.from('students').update({ 
      test_status: 'TESTING'
    }).eq('id', student.id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'TESTING': return <PlayCircle className="text-indigo-500 animate-pulse" size={18} />;
      case 'AWAY': return <AlertCircle className="text-rose-500 animate-bounce" size={18} />;
      case 'PAUSED': return <PauseCircle className="text-amber-500" size={18} />;
      case 'FINISHED': return <CheckCircle2 className="text-emerald-500" size={18} />;
      default: return <Clock className="text-slate-300" size={18} />;
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-300 uppercase tracking-widest italic">Syncing Command Center...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto space-y-10">
        
        {/* ✈️ 헤더 섹션 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            {/* 🔥 대시보드 돌아가기 버튼 추가 */}
            <button 
              onClick={() => router.push('../')} // 실제 대시보드 경로에 맞게 수정 가능
              className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:border-indigo-500 hover:shadow-lg transition-all active:scale-95"
            >
              <ArrowLeft size={16} /> Dashboard
            </button>

            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-slate-900 rounded-[24px] flex items-center justify-center text-white shadow-2xl rotate-3">
                <ShieldCheck size={36} />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter text-slate-900 italic uppercase leading-none">Proctoring <span className="text-indigo-600">OS</span></h1>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em] mt-2">Precision Sync v3.5</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 윈도우 알림 권한 상태 배지 */}
            {notifPermission === 'granted' && (
              <button
                onClick={() => addNotification({ id: 'test', name: '테스트학생', grade: '1학년', test_status: 'AWAY', test_remaining_sec: 300 })}
                className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-2xl font-black text-xs text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95 whitespace-nowrap"
                title="클릭하면 테스트 알림 발송"
              >
                🔔 <span>알림 ON</span>
              </button>
            )}
            {notifPermission === 'denied' && (
              <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs whitespace-nowrap">
                <span className="font-black text-rose-600">🚫 알림 차단됨</span>
                <span className="text-rose-400 font-bold">— 주소창 🔒 클릭 → 알림 → 허용</span>
              </div>
            )}
            {notifPermission === 'default' && (
              <button
                onClick={requestNotifPermission}
                className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-2xl font-black text-xs text-amber-600 hover:bg-amber-100 transition-all active:scale-95 whitespace-nowrap"
              >
                🔔 알림 허용하기
              </button>
            )}

            <div className="relative group min-w-[350px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
              <input 
                type="text"
                placeholder="Search Student..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-8 py-5 bg-white border-2 border-slate-100 rounded-[28px] focus:outline-none focus:border-indigo-500 transition-all shadow-xl shadow-slate-200/50 font-bold text-lg"
              />
            </div>
          </div>
        </div>

        {/* 📑 탭 및 학년 필터 */}
        <div className="flex flex-wrap items-center justify-between gap-6 bg-white/50 p-2 rounded-[32px] border border-white">
          <div className="flex p-1.5 bg-slate-200/50 rounded-[24px] gap-2 overflow-x-auto scrollbar-hide">
            {[
              { id: 'incident', label: '상황 발생', icon: <AlertCircle size={18}/>, color: 'hover:text-rose-600' },
              { id: 'testing', label: '시험 중', icon: <PlayCircle size={18}/>, color: 'hover:text-indigo-600' },
              { id: 'waiting', label: '시험 전', icon: <Users size={18}/>, color: 'hover:text-slate-600' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-3 px-6 py-4 rounded-[20px] font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white shadow-lg text-slate-900 scale-105' : `text-slate-400 ${tab.color}`}`}
              >
                {tab.icon} {tab.label}
                <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                  {students.filter(s => {
                    if (tab.id === 'incident') return ['AWAY', 'PAUSED', 'FINISHED'].includes(s.test_status);
                    if (tab.id === 'testing') return s.test_status === 'TESTING';
                    return s.test_status === 'IDLE' || !s.test_status;
                  }).length}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pr-4">
            <Filter size={16} className="text-slate-400" />
            <div className="flex gap-2">
              {grades.map(grade => (
                <button
                  key={grade}
                  onClick={() => setSelectedGrade(grade)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedGrade === grade ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 hover:bg-slate-100'}`}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 🎬 대시보드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {processedList.map((s) => {
            const liveRemaining = getLiveRemainingTime(s);
            const isUrgent = liveRemaining > 0 && liveRemaining < 300; 

            return (
              <div 
                key={s.id} 
                className={`group relative p-8 rounded-[48px] border-2 transition-all duration-500 bg-white ${isUrgent ? 'border-amber-400 animate-pulse shadow-amber-200' : 'border-transparent shadow-xl shadow-slate-200/50'} hover:border-indigo-500 hover:-translate-y-2`}
              >
                <button onClick={() => handleForceReset(s)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100">
                  <RotateCcw size={18} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                  {getStatusIcon(s.test_status)}
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.grade}</span>
                </div>

                <div className="space-y-1 mb-10">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{s.name}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase">Snapshot: {s.test_duration_min || '--'} MIN TEST</p>
                </div>

                <div className="pt-6 border-t border-slate-50 space-y-5">
                  {activeTab === 'testing' && (
                    <div className="flex items-end justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Remaining</p>
                        <p className={`text-4xl font-black tabular-nums tracking-tighter ${isUrgent ? 'text-rose-500' : 'text-indigo-600'}`}>
                          {formatRemainingTime(liveRemaining)}
                        </p>
                      </div>
                      <Timer className={isUrgent ? 'text-rose-500 animate-spin-slow' : 'text-indigo-200'} size={36} />
                    </div>
                  )}

                  {activeTab === 'incident' && (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-2xl ${s.test_status === 'AWAY' ? 'bg-rose-50' : s.test_status === 'PAUSED' ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                        <p className="text-[10px] font-black uppercase mb-1 opacity-60">Incident Report</p>
                        <p className={`font-black text-sm ${s.test_status === 'AWAY' ? 'text-rose-600' : s.test_status === 'PAUSED' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {s.test_status === 'AWAY' ? `Locked at ${formatRemainingTime(s.test_remaining_sec || 0)}` : 
                           s.test_status === 'PAUSED' ? `Paused at ${formatRemainingTime(s.test_remaining_sec || 0)}` : 'Test Completed'}
                        </p>
                      </div>
                      
                      {(s.test_status === 'AWAY' || s.test_status === 'PAUSED') && (
                        <button
                          onClick={() => handleApproveReturn(s)}
                          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                        >
                          <Check size={16} /> 정상 복귀 승인
                        </button>
                      )}
                    </div>
                  )}

                  {activeTab === 'waiting' && (
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs italic">
                      <Clock size={14} /> Ready for Session
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes notif-in {
          from { opacity: 0; transform: translateX(110%) scale(0.9); }
          to   { opacity: 1; transform: translateX(0)   scale(1);   }
        }
        @keyframes notif-out {
          from { opacity: 1; max-height: 120px; margin-bottom: 12px; }
          to   { opacity: 0; max-height: 0;     margin-bottom: 0;    }
        }
        .notif-enter { animation: notif-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
      `}</style>

      {/* 🔔 오른쪽 하단 알림 */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none" style={{ maxWidth: 340 }}>
        {notifications.map((notif) => {
          const isAway = notif.status === 'AWAY';
          const isPaused = notif.status === 'PAUSED';
          const bg = isAway ? 'bg-rose-600' : isPaused ? 'bg-amber-500' : 'bg-emerald-500';
          const badge = isAway ? '자리 이탈' : isPaused ? '일시 정지' : '시험 완료';
          const icon = isAway ? '🚨' : isPaused ? '⏸️' : '✅';
          const remaining = notif.remainingSec > 0
            ? `${Math.floor(notif.remainingSec / 60)}:${String(notif.remainingSec % 60).padStart(2, '0')} 남음`
            : '';
          return (
            <div
              key={notif.id}
              className={`notif-enter pointer-events-auto w-full rounded-3xl shadow-2xl overflow-hidden flex items-stretch`}
              style={{ boxShadow: isAway ? '0 8px 40px rgba(225,29,72,0.45)' : isPaused ? '0 8px 40px rgba(245,158,11,0.4)' : '0 8px 40px rgba(16,185,129,0.4)' }}
            >
              <div className={`${bg} flex items-center justify-center px-5 text-2xl`}>{icon}</div>
              <div className="bg-white flex-1 px-5 py-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isAway ? 'text-rose-500' : isPaused ? 'text-amber-500' : 'text-emerald-500'}`}>{badge}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{notif.grade}</span>
                </div>
                <p className="text-lg font-black text-slate-900 tracking-tighter leading-none">{notif.studentName}</p>
                {remaining && <p className="text-[11px] font-bold text-slate-400 mt-1">{remaining}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}