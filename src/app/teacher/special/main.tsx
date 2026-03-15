'use client';

import React, { useState } from 'react';
import { Database, Presentation, Share2, Sparkles } from 'lucide-react';
import DataRegMain from './datareg/mainrender';
import ClassMain from './class/main';
import ShareMain from './share/main';

type TabType = 'datareg' | 'class' | 'share';

export default function SpecialPage() {
  const [activeTab, setActiveTab] = useState<TabType>('datareg');

  const tabs = [
    { id: 'datareg', label: '자료 등록', icon: <Database size={18} />, color: 'text-amber-500' },
    { id: 'class', label: '수업 모드', icon: <Presentation size={18} />, color: 'text-indigo-500' },
    { id: 'share', label: '공유 관리', icon: <Share2 size={18} />, color: 'text-emerald-500' },
  ];

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-80px)] bg-white">
      
      {/* 1. 서브 메뉴바 (GNB 바로 아래 딱 붙음) */}
      <div className="flex-shrink-0 bg-slate-50/50 border-b border-slate-200 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* 타이틀 (작게 유지) */}
          <div className="flex items-center gap-2 pr-6 border-r border-slate-200">
            <Sparkles className="text-indigo-600" size={20} />
            <span className="font-black text-slate-800 tracking-tighter uppercase text-sm">Special Utility</span>
          </div>

          {/* 하위 메뉴 탭 */}
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`
                  flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all
                  ${activeTab === tab.id 
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'}
                `}
              >
                <span className={activeTab === tab.id ? '' : tab.color}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 오른쪽 상태 표시 (필요시 사용) */}
        <div className="text-[10px] font-black text-slate-300 tracking-widest uppercase hidden md:block">
          System Optimized for Education // WebP Active
        </div>
      </div>

      {/* 2. 콘텐츠 영역 (여백 0, 가로 끝에서 끝까지!) */}
      <main className="flex-1 w-full relative overflow-auto bg-white">
        <div className="h-full w-full animate-in fade-in duration-500">
          {/* 여기가 핵심이야 자기야! 
            p-0을 줘서 하위 컴포넌트(DataReg, Class 등)가 화면을 통째로 먹게 했어.
          */}
          {activeTab === 'datareg' && <DataRegMain />}
          {activeTab === 'class' && <ClassMain />}
          {activeTab === 'share' && <ShareMain />}
        </div>
      </main>
    </div>
  );
}