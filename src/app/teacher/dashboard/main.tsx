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
  AlertCircle
} from 'lucide-react';

// 🔥 [업데이트] 권한 승인 및 주소 수정이 완료된 최종 GAS URL이야!
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec';

export default function DashboardMain() {
  const [adminName, setAdminName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    const name = localStorage.getItem('currentAdminName');
    if (name) setAdminName(name);
  }, []);

  // 🚀 [핵심] 라이브러리 동기화 함수 (구글맵 카피 전략 실행)
  const handleSyncLibrary = async () => {
    if (!window.confirm("구글 드라이브의 최신 라이브러리 구조를 Supabase DB로 동기화할까요?")) return;

    setSyncStatus('loading');
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'sync_to_supabase', 
          apiKey: "eduest_super_secret_key_1234" 
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSyncStatus('success');
        setSyncMessage(data.message || "동기화가 완료되었습니다.");
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncMessage("동기화 중 오류 발생: " + err.message);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-10">
      
      {/* 🌤️ 상단 환영 섹션 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm mb-2 uppercase tracking-widest">
            <Zap size={16} fill="currentColor" />
            System Status: Operational
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic">
            HELL-O, <span className="text-indigo-600">{adminName}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">라이브러리 지도를 최신 상태로 유지하세요.</p>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 font-bold text-sm shadow-sm">
          <Calendar size={18} />
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
      </div>

      {/* ⚡ 동기화 메인 컨트롤 패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 0.1초 컷 데이터 지도 동기화 카드 */}
        <div className="p-10 rounded-[45px] bg-white border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 opacity-40 blur-[80px] -mr-20 -mt-20 group-hover:opacity-60 transition-opacity"></div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-200">
              <RefreshCw size={32} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
            </div>
            
            <h3 className="text-2xl font-black italic mb-2 tracking-tighter uppercase">Library Synchronization</h3>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              구글 드라이브의 모든 해설지 구조를 스캔하여 <br/>
              Supabase 초고속 데이터베이스로 복사합니다. <br/>
              <span className="text-indigo-600 font-bold">학생 진입 속도가 0.1초로 단축됩니다.</span>
            </p>

            <button 
              onClick={handleSyncLibrary}
              disabled={syncStatus === 'loading'}
              className="w-full py-5 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:bg-slate-300 shadow-xl"
            >
              {syncStatus === 'loading' ? (
                <>데이터 지도 그리는 중... <Loader2 className="animate-spin" size={20} /></>
              ) : (
                <>동기화 프로세스 실행 <ChevronRight size={20} /></>
              )}
            </button>
          </div>
        </div>

        {/* 상태 모니터링 카드 */}
        <div className="flex flex-col gap-6">
          <div className={`p-8 rounded-[40px] border flex items-center gap-6 transition-all ${
            syncStatus === 'success' ? 'bg-emerald-50 border-emerald-100' : 
            syncStatus === 'error' ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              syncStatus === 'success' ? 'bg-emerald-500 text-white' : 
              syncStatus === 'error' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400'
            }`}>
              {syncStatus === 'success' ? <CheckCircle2 size={28} /> : 
               syncStatus === 'error' ? <AlertCircle size={28} /> : <Database size={28} />}
            </div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Status Message</p>
              <p className={`font-bold tracking-tight ${
                syncStatus === 'success' ? 'text-emerald-700' : 
                syncStatus === 'error' ? 'text-rose-700' : 'text-slate-600'
              }`}>
                {syncStatus === 'idle' ? "동기화 대기 중..." : syncMessage}
              </p>
            </div>
          </div>

          <div className="p-8 rounded-[40px] bg-slate-900 text-white flex flex-col justify-between h-full relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <h4 className="text-sm font-black text-indigo-400 uppercase tracking-[0.3em] mb-4">Quick Tip</h4>
              <p className="text-slate-300 font-medium leading-relaxed">
                시험지 폴더 구조가 바뀌거나 <br/> 
                새로운 해설지(.html)를 드라이브에 넣었다면 <br/>
                반드시 <span className="text-white font-bold underline">동기화 버튼</span>을 눌러야 학생들에게 반영됩니다.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase">
              <Clock size={12} /> Last Sync: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 아이콘 에러 방지용 (Lucide-react에 Loader2가 없을 경우)
function Loader2({ size, className }: { size: number, className: string }) {
  return <RefreshCw size={size} className={className} />;
}