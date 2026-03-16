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
    // 전체 컨테이너에 최소 높이를 부여해서 모바일에서 씹히는 걸 방지!
    <div className="w-full h-full min-h-[400px] bg-white flex flex-col overflow-hidden relative border-0">
      
      {/* 1️⃣ 로딩 오버레이: z-index를 지존급으로 높이고 inset-0으로 꽉 채움 */}
      {!isReady && (
        <div className="absolute inset-0 z-[9999] bg-[#0f172a] flex flex-col items-center justify-center p-6 touch-none">
          <div className="flex flex-col items-center w-full max-w-xs text-center">
            <Loader2 className="text-indigo-400 animate-spin mb-4" size={40} />
            
            <h2 className="text-lg font-black text-white italic mb-1 uppercase tracking-tight">
              {selectedPack?.title || "SYSTEM"}
            </h2>
            <p className="text-slate-500 text-[9px] font-bold tracking-[0.2em] mb-6 animate-pulse">
              SYNCING RESOURCES...
            </p>

            {/* 에너지바: 모바일에서 잘 보이게 두께 살짝 조절 */}
            <div className="w-full h-3 bg-white/10 rounded-full p-[2px] mb-3">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(progress, 5)}%` }} // 최소 5%는 보이게!
              />
            </div>
            
            <div className="flex justify-between w-full px-1">
              <span className="text-indigo-400 font-black text-[10px]">{progress}%</span>
              <span className="text-slate-500 font-bold text-[9px] uppercase tracking-tighter">
                {progress < 100 ? 'Loading...' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2️⃣ 메인 콘텐츠 */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-black text-slate-900 truncate">
            {selectedPack?.title}
          </h1>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Memory Synced</span>
        </div>
        <div className="shrink-0 text-right ml-4">
          <span className="text-xl font-black text-indigo-600 italic leading-none">{problemCount}</span>
        </div>
      </div>

      {/* 문제 리스트 영역: -webkit-overflow-scrolling 추가로 모바일 스크롤 최적화 */}
      <div className="flex-1 overflow-y-auto p-4 bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
        {problemCount > 0 ? (
          <div className="grid grid-cols-4 md:grid-cols-5 gap-2 md:gap-4 pb-10">
            {Array.from({ length: problemCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => onLaunch(i + 1)}
                className="group relative aspect-square bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center hover:bg-indigo-600 active:scale-90 transition-all"
              >
                <span className="text-lg font-black text-slate-400 group-hover:text-white transition-colors">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300">
            <AlertCircle size={32} className="mb-2 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-[10px]">No Data</p>
          </div>
        )}
      </div>
    </div>
  );
}