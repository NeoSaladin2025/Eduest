'use client';

import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Clock, 
  ChevronRight, 
  Calendar,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Users,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

/** 브라우저→GAS 직접 호출은 CORS 차단 → 서버 프록시 (`GAS_LIBRARY_WEBAPP_URL`로 타깃 덮어쓰기 가능) */
const GAS_LIBRARY_PROXY = "/api/gas/library";

export default function DashboardMain() {
  const [adminName, setAdminName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [isIncremental, setIsIncremental] = useState<boolean>(true);
  
  // 🔥 [핵심] 하이드레이션 에러 방지를 위한 마운트 상태
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true); // 브라우저 마운트 완료
    const name = localStorage.getItem('currentAdminName');
    if (name) setAdminName(name);
  }, []);

  const handleSyncLibrary = async () => {
    const gradeText = selectedGrade === 'ALL' ? '전체 학년' : selectedGrade;
    const modeText = isIncremental 
      ? '⚡ 빠른 증분 동기화 (약 1~2초)' 
      : '🛡️ 드라이브 정밀 재스캔 (전체 스캔으로 30~50초 소요될 수 있음)';
    
    if (!window.confirm(`구글 드라이브 라이브러리를 동기화할까요?\n\n• 대상: ${gradeText}\n• 모드: ${modeText}`)) return;

    setSyncStatus('loading');
    setSyncMessage(isIncremental ? "빠른 증분 동기화 중..." : "드라이브 전체를 정밀 스캔 중입니다 (잠시만 기다려주세요)...");

    try {
      const res = await fetch(GAS_LIBRARY_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'sync_to_supabase', 
          apiKey: "eduest_super_secret_key_1234",
          mode: isIncremental ? 'incremental' : 'full',
          grade: selectedGrade,
        }),
      });

      const data = await res.json().catch(() => null);

      if (data && data.success) {
        setSyncStatus('success');
        const extra =
          typeof data.cleanupDeleted === "number" && data.cleanupDeleted > 0
            ? ` (고아 삭제 ${data.cleanupDeleted}건)`
            : "";
        setSyncMessage((data.message || "동기화가 완료되었습니다.") + extra);
      } else {
        const errorMsg = data?.error || (res.status === 504 ? "서버 처리 시간 초과 (타임아웃)" : `서버 오류 (HTTP ${res.status})`);
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncMessage(err?.message || "동기화 중 오류가 발생했습니다. '빠른 증분 동기화'로 다시 시도해 주세요.");
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-10 pb-20">
      
      {/* 🌤️ 상단 환영 섹션 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm mb-2 uppercase tracking-widest">
            <Zap size={16} fill="currentColor" />
            System Status: Operational
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic">
            HELL-O, <span className="text-indigo-600">{isMounted ? adminName : '---'}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">학생들의 학습과 시험을 실시간으로 관리하세요.</p>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 font-bold text-sm shadow-sm">
          <Calendar size={18} />
          {/* 🔥 마운트 전에는 빈 텍스트를 보여줘서 서버와 클라이언트를 맞춤 */}
          {isMounted ? new Date().toLocaleDateString('ko-KR', { 
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' 
          }) : "Loading..."}
        </div>
      </div>

      {/* ⚡ 메인 컨트롤 패널 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 1. 라이브러리 동기화 카드 */}
        <div className="p-8 md:p-10 rounded-[45px] bg-white border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 opacity-40 blur-[80px] -mr-20 -mt-20 group-hover:opacity-60 transition-opacity pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <RefreshCw size={28} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
              </div>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black tracking-wider uppercase">
                Dual-Engine
              </span>
            </div>
            
            <h3 className="text-2xl font-black italic mb-2 tracking-tighter uppercase">Library Synchronization</h3>
            <p className="text-slate-500 font-medium leading-relaxed mb-6 text-xs md:text-sm">
              구글 드라이브 구조를 DB로 복사합니다. <br/>
              <span className="text-indigo-600 font-bold">학생 진입 속도가 0.1초로 단축됩니다.</span>
            </p>

            {/* 🎛️ 동기화 세부 옵션 패널 */}
            <div className="space-y-4 mb-6 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
              {/* 학년 선택 알약 탭 */}
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  동기화 대상 학년
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'ALL', label: '전체' },
                    { id: '고1', label: '고1' },
                    { id: '고2', label: '고2' },
                    { id: '고3', label: '고3' },
                    { id: '중1', label: '중1' },
                    { id: '중2', label: '중2' },
                    { id: '중3', label: '중3' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      disabled={syncStatus === 'loading'}
                      onClick={() => setSelectedGrade(g.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                        selectedGrade === g.id
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 증분 동기화 토글 */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                    <Sparkles size={14} className="text-amber-500 fill-amber-500" />
                    <span>빠른 증분 동기화</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {isIncremental ? "⚡ 변경된 파일만 1초 만에 반영" : "🛡️ 드라이브 정밀 재스캔 (백업 모드)"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={syncStatus === 'loading'}
                  onClick={() => setIsIncremental(!isIncremental)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isIncremental ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                      isIncremental ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button 
              onClick={handleSyncLibrary}
              disabled={syncStatus === 'loading'}
              className="w-full py-4 md:py-5 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black text-base md:text-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:bg-slate-300 shadow-xl"
            >
              {syncStatus === 'loading' ? (
                <>동기화 중... <Loader2 className="animate-spin" size={20} /></>
              ) : (
                <>{selectedGrade === 'ALL' ? '전체' : selectedGrade} 동기화 실행 <ChevronRight size={20} /></>
              )}
            </button>
          </div>
        </div>

        {/* 🔥 2. 실시간 시험 관리 진입 카드 */}
        <Link href="/teacher/dashboard/testmanage" className="group">
          <div className="p-10 h-full rounded-[45px] bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xl shadow-rose-200/50 relative overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 blur-[80px] -mr-20 -mt-20"></div>
            
            <div className="relative z-10 h-full flex flex-col justify-between">
              <div>
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md text-white rounded-3xl flex items-center justify-center mb-8 shadow-xl">
                  <ShieldAlert size={32} />
                </div>
                
                <h3 className="text-2xl font-black italic mb-2 tracking-tighter uppercase text-white">Live Proctoring</h3>
                <p className="text-rose-100 font-medium leading-relaxed mb-8 text-sm md:text-base">
                  현재 시험 중인 학생들을 실시간으로 감시합니다. <br/>
                  <span className="text-white font-bold underline decoration-rose-300">이탈 발생 시 즉시 빨간색 경고등이 점등됩니다.</span>
                </p>
              </div>

              <div className="flex items-center justify-between bg-black/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 group-hover:bg-black/20 transition-colors mt-auto">
                <span className="font-black text-sm uppercase tracking-widest">시험 관리 페이지 입장</span>
                <ArrowUpRight size={20} />
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* 📊 하단 상태 정보 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`col-span-1 lg:col-span-2 p-8 rounded-[40px] border flex items-center gap-6 transition-all ${
            syncStatus === 'success' ? 'bg-emerald-50 border-emerald-100' : 
            syncStatus === 'error' ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              syncStatus === 'success' ? 'bg-emerald-500 text-white' : 
              syncStatus === 'error' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400'
            }`}>
              {syncStatus === 'success' ? <CheckCircle2 size={28} /> : 
               syncStatus === 'error' ? <AlertCircle size={28} /> : <Database size={28} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Sync Status</p>
              <p className={`font-bold tracking-tight truncate ${
                syncStatus === 'success' ? 'text-emerald-700' : 
                syncStatus === 'error' ? 'text-rose-700' : 'text-slate-600'
              }`}>
                {syncStatus === 'idle' ? "동기화 대기 중..." : syncMessage}
              </p>
            </div>
          </div>

          <div className="p-8 rounded-[40px] bg-slate-900 text-white flex flex-col justify-between h-full relative overflow-hidden shadow-2xl min-h-[160px]">
            <div className="relative z-10">
              <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 leading-none">Quick Status</h4>
              <div className="flex items-center gap-3">
                <Users size={20} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-300 uppercase tracking-widest">Monitor Active</span>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase">
              <Clock size={12} /> Last Refresh: {isMounted ? new Date().toLocaleTimeString() : '--:--:--'}
            </div>
          </div>
      </div>
    </div>
  );
}

function Loader2({ size, className }: { size: number, className: string }) {
  return <RefreshCw size={size} className={className} />;
}