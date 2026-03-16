'use client';

import React from 'react';
import { Play, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';

interface Props {
  selectedPack: any;
  onLaunch: (index: number) => void;
  progress: number;
  isReady: boolean;
}

export default function ProblemWindow({ selectedPack, onLaunch, progress, isReady }: Props) {
  const problemCount = selectedPack?.count || 0;

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden relative">
      
      {/* 1️⃣ 로딩 오버레이 (isReady가 false일 때만 위를 덮음) */}
      {!isReady && (
        <div className="absolute inset-0 z-[999] bg-slate-900 flex flex-col items-center justify-center p-8 md:p-12 overflow-hidden">
          {/* 배경 로고 데코 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <FileText size={isReady ? 100 : 300} className="text-white" />
          </div>

          <div className="z-10 w-full max-w-md flex flex-col items-center">
            <Loader2 className="text-indigo-400 animate-spin mb-6" size={isReady ? 24 : 48} />
            
            <h2 className="text-xl md:text-2xl font-black text-white italic mb-2 tracking-tighter uppercase text-center">
              {selectedPack?.title || "SYSTEM"} LOADING...
            </h2>
            <p className="text-slate-500 text-[9px] md:text-[10px] font-bold tracking-[0.3em] mb-8 animate-pulse text-center">
              SYNCHRONIZING WITH GOOGLE DRIVE
            </p>

            {/* 🔋 지존 에너지바 */}
            <div className="w-full h-4 bg-white/5 rounded-full border border-white/10 p-1 relative mb-4">
              <div 
                className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className="flex justify-between w-full px-1">
              <span className="text-indigo-400 font-black text-[10px]">{progress}%</span>
              <span className="text-slate-500 font-black text-[10px] uppercase">
                {progress < 100 ? 'Downloading Resources...' : 'Complete'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2️⃣ 메인 콘텐츠 레이어 (로딩 뒤에 깔려 있음) */}
      {/* 상단 팩 정보 헤더 */}
      <div className="p-4 md:p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="text-emerald-500" size={14} />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Memory Synced</span>
          </div>
          <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight truncate max-w-[150px] md:max-w-none">
            {selectedPack?.title}
          </h1>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Items</span>
          <span className="text-xl md:text-2xl font-black text-indigo-600 italic leading-none">{problemCount}</span>
        </div>
      </div>

      {/* 문제 선택 그리드 영역 */}
      <div className="flex-1 overflow-auto p-4 md:p-6 scrollbar-hide">
        {problemCount > 0 ? (
          // 📱 모바일/폴드 접힘: 4열, 태블릿/데스크탑: 5열 (반응형 그리드)
          <div className="grid grid-cols-4 md:grid-cols-5 gap-3 md:gap-4">
            {Array.from({ length: problemCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => onLaunch(i + 1)}
                className="group relative aspect-square bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl flex flex-col items-center justify-center hover:bg-indigo-600 hover:border-indigo-500 transition-all active:scale-95 shadow-sm"
              >
                <span className="text-xl md:text-2xl font-black text-slate-300 group-hover:text-white/50 transition-colors italic">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="absolute bottom-2 md:bottom-3 opacity-0 group-hover:opacity-100 transition-all">
                  <Play size={14} className="text-white fill-current" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <AlertCircle size={48} className="mb-2 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-xs">No Problems Found</p>
          </div>
        )}
      </div>

      {/* 하단 안내바 */}
      <div className="p-3 bg-slate-900 text-white/40 text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-3 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        System ready. select a problem.
      </div>
    </div>
  );
}