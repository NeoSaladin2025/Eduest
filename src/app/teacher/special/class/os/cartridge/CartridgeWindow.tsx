'use client';

import React from 'react';
// ✅ CheckCircle 아이콘 임포트 추가 완료!
import { Box, Download, RefreshCw, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { useCartridge, Material } from './useCartridge';

interface Props {
  onPackInsert: (pack: Material) => void;
  currentPackId?: string;
}

export default function CartridgeWindow({ onPackInsert, currentPackId }: Props) {
  // ✅ useCartridge 훅에서 필요한 데이터와 함수를 가져옵니다.
  const { materials, isLoading, refreshPacks } = useCartridge();

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* 1. 헤더 섹션 */}
      <div className="p-6 bg-slate-50 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-6 bg-indigo-600 rounded-full" />
          <h2 className="text-lg font-black text-slate-800 tracking-tighter uppercase italic">
            Cartridge Library
          </h2>
        </div>
        
        {/* 🔄 목록 새로고침 버튼 */}
        <button 
          onClick={refreshPacks} 
          disabled={isLoading}
          className="p-2.5 hover:bg-slate-200 rounded-2xl transition-all text-slate-500 active:scale-90 disabled:opacity-50"
          title="Refresh Library"
        >
           {isLoading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
        </button>
      </div>

      {/* 2. 리스트 영역 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        {/* 로딩 중일 때 표시 */}
        {isLoading && materials.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
            <p className="font-black italic text-xs tracking-widest uppercase">Syncing with Drive...</p>
          </div>
        )}

        {/* 데이터가 없을 때 표시 */}
        {!isLoading && materials.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300 border-2 border-dashed border-slate-100 rounded-[40px]">
            <AlertCircle size={40} className="mb-3" />
            <p className="font-bold text-sm">장착 가능한 카트리지가 없습니다.</p>
          </div>
        )}

        {/* 카트리지 리스트 매핑 */}
        {materials.map((pack) => (
          <div 
            key={pack.id}
            className={`group p-5 rounded-[32px] border-2 transition-all duration-300 flex items-center justify-between ${
              currentPackId === pack.id 
                ? 'border-indigo-500 bg-indigo-50/50 shadow-xl shadow-indigo-500/10' 
                : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-5">
              {/* 아이콘 박스 */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                currentPackId === pack.id 
                  ? 'bg-indigo-600 text-white rotate-6 scale-110' 
                  : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'
              }`}>
                <Box size={28} />
              </div>

              {/* 텍스트 정보 */}
              <div>
                <h3 className={`font-black text-base tracking-tight transition-colors ${
                  currentPackId === pack.id ? 'text-indigo-900' : 'text-slate-700 group-hover:text-slate-900'
                }`}>
                  {pack.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-lg">
                    {pack.count} Problems
                  </span>
                </div>
              </div>
            </div>

            {/* 🔥 인터랙션 버튼 */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onPackInsert(pack)}
                disabled={currentPackId === pack.id}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-tighter transition-all active:scale-95 shadow-lg ${
                  currentPackId === pack.id 
                    ? 'bg-emerald-500 text-white shadow-emerald-200 cursor-default' 
                    : 'bg-slate-900 text-white shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-200'
                }`}
              >
                {currentPackId === pack.id ? (
                  <>
                    <CheckCircle size={14} />
                    Active
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Load Data
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 💡 하단 팁 */}
      <div className="p-4 bg-slate-50/50 border-t text-center shrink-0">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] italic">
           EduOS Cartridge System // Powered by GAS
        </p>
      </div>
    </div>
  );
}