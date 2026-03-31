'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Users, Timer, AlertCircle, CheckCircle2, PauseCircle, PlayCircle, Search, ShieldCheck, RotateCcw, Filter, Clock, Check
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TabType = 'incident' | 'testing' | 'waiting';

export default function TestManagePage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('testing'); 
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // 1초마다 현재 시간 업데이트 (실시간 싱크 계산용)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const fetchStudents = async () => {
      const { data } = await supabase.from('students').select('*').order('name');
      setStudents(data || []);
      setLoading(false);
    };

    fetchStudents();

    // 📡 실시간 구독 로직
    const channel = supabase
      .channel('proctoring_room')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, (payload) => {
        setStudents((current) => current.map((s) => s.id === payload.new.id ? payload.new : s));
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
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-slate-900 rounded-[24px] flex items-center justify-center text-white shadow-2xl rotate-3">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-slate-900 italic uppercase leading-none">Proctoring <span className="text-indigo-600">OS</span></h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em] mt-2">Precision Sync v3.5</p>
            </div>
          </div>

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
      `}</style>
    </div>
  );
}