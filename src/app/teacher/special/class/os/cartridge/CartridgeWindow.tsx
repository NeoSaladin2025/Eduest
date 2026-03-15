'use client';

import React from 'react';
import { Box, Download, CheckCircle, Loader2, Play } from 'lucide-react';
import { useCartridge, Material } from './useCartridge';

interface Props {
  onPackInsert: (pack: Material) => void;
  currentPackId?: string;
}

export default function CartridgeWindow({ onPackInsert, currentPackId }: Props) {
  const { materials, isLoading, refreshPacks } = useCartridge();
  
  // ✅ 로딩 상태는 OS 컨테이너나 엔진에서 관리하게 연결할 거야
  // 여기서는 버튼 디자인과 클릭 이벤트에 집중하자!

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
        <h2 className="text-lg font-black text-slate-800 tracking-tighter uppercase">Cartridge Library</h2>
        <button onClick={refreshPacks} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
           <Box size={20} className="text-slate-500" />
        </button>
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {materials.map((pack) => (
          <div 
            key={pack.id}
            className={`group p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
              currentPackId === pack.id ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${currentPackId === pack.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Box size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{pack.title}</h3>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{pack.count} Problems</p>
              </div>
            </div>

            {/* 🔥 [LOAD] 버튼 & [START] 버튼 제어 */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onPackInsert(pack)} // 이 함수가 이제 엔진 로딩을 시작할 거야!
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-600 transition-all active:scale-95"
              >
                <Download size={14} />
                LOAD DATA
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}