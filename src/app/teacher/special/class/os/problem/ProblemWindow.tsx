'use client';

import React from 'react';
import { Play, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';

// ✅ 부모(EduOSContainer)로부터 받을 데이터 규격 정의
interface Props {
  selectedPack: any;           // 선택된 팩 정보
  onLaunch: (index: number) => void; // 문제 클릭 시 실행될 함수
  progress: number;            // 구글 드라이브 동기화 진행률 (0~100)
  isReady: boolean;             // 로딩 완료 여부
}

export default function ProblemWindow({ selectedPack, onLaunch, progress, isReady }: Props) {
  
  // 1️⃣ [로딩 상태] 아직 구글 드라이브에서 파일을 다 못 가져왔을 때 (에너지바 연출)
  if (!isReady) {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-12 overflow-hidden relative">
        {/* 배경 로고 데코 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
          <FileText size={400} className="text-white" />
        </div>

        <div className="z-10 w-full max-w-md flex flex-col items-center">
          <Loader2 className="text-indigo-400 animate-spin mb-6" size={48} />
          
          <h2 className="text-2xl font-black text-white italic mb-2 tracking-tighter uppercase">
            {selectedPack?.title || "SYSTEM"} LOADING...
          </h2>
          <p className="text-slate-500 text-[10px] font-bold tracking-[0.3em] mb-8 animate-pulse">
            SYNCHRONIZING WITH GOOGLE DRIVE
          </p>

          {/* 🔋 지존 에너지바 (주루룩 차오르는 핵심 UI) */}
          <div className="w-full h-4 bg-white/5 rounded-full border border-white/10 p-1 relative mb-4">
            <div 
              className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_15px_rgba(52,211,153,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex justify-between w-full px-1">
            <span className="text-indigo-400 font-black text-[10px]">{progress}%</span>
            <span className="text-slate-500 font-black text-[10px] uppercase">
              {progress < 20 ? 'Connecting...' : progress < 100 ? 'Downloading Resources...' : 'Complete'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 2️⃣ [준비 완료] 로딩이 끝나면 문제 번호 리스트를 뙇!
  const problemCount = selectedPack?.count || 0;

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      {/* 상단 팩 정보 헤더 */}
      <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="text-emerald-500" size={16} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Memory Synced</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            {selectedPack?.title}
          </h1>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Items</span>
          <span className="text-2xl font-black text-indigo-600 italic leading-none">{problemCount}</span>
        </div>
      </div>

      {/* 문제 선택 그리드 영역 */}
      <div className="flex-1 overflow-auto p-6 scrollbar-hide">
        {problemCount > 0 ? (
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: problemCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => onLaunch(i + 1)}
                className="group relative aspect-square bg-slate-50 border-2 border-slate-100 rounded-2xl flex flex-col items-center justify-center hover:bg-indigo-600 hover:border-indigo-500 transition-all active:scale-95 hover:shadow-lg hover:shadow-indigo-200"
              >
                <span className="text-2xl font-black text-slate-300 group-hover:text-white/50 transition-colors italic">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="absolute bottom-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                  <Play size={16} className="text-white fill-current" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <AlertCircle size={48} className="mb-2 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-sm">No Problems Found</p>
          </div>
        )}
      </div>

      {/* 하단 안내바 */}
      <div className="p-4 bg-slate-900 text-white/40 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        System ready. select a problem to mount on viewers.
      </div>
    </div>
  );
}