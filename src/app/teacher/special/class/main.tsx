'use client';

import React from 'react';
import Link from 'next/link'; // ✅ 새 탭 이동을 위한 Next.js 링크 컴포넌트
import { Play, Settings, History, Monitor, Cpu, ExternalLink } from 'lucide-react';

export default function ClassMain() {
  // 이제 내부 상태(isOSStarted)는 필요 없어져서 제거했어!
  
  return (
    <div className="flex flex-col h-full bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden min-h-[700px]">
      
      {/* 🚀 지존급 슬림 가로 메뉴바 */}
      <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100/50 mr-2">
            <Monitor size={18} className="text-indigo-600" />
            <span className="font-black text-indigo-900 text-sm tracking-tight">CLASS OS ENGINE</span>
          </div>

          <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            {/* 🔥 OS 시작 버튼: 이제 Link로 감싸서 새 탭으로 보낼 거야 */}
            <Link 
              href="/teacher/special/class/os" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm bg-white text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-100"
            >
              <Play size={16} className="fill-emerald-600" />
              OS 엔진 가동
            </Link>
            
            <div className="w-[1px] h-4 bg-slate-200 mx-1" />

            <button className="flex items-center gap-2 px-5 py-2.5 text-slate-400 font-black text-sm hover:text-slate-600 transition-all">
              <History size={16} />
              최근 수업
            </button>

            <button className="flex items-center gap-2 px-5 py-2.5 text-slate-400 font-black text-sm hover:text-slate-600 transition-all">
              <Settings size={16} />
              환경 설정
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-300" />
            Standby Mode
          </span>
        </div>
      </div>

      {/* 🖥️ 중앙 대기 화면 영역 (발사대 비주얼) */}
      <div className="flex-1 relative bg-slate-50 flex flex-col items-center justify-center p-20 text-center">
        {/* 배경 데코 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-100/30 blur-[120px] rounded-full" />
        </div>

        <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-emerald-500/20 blur-[40px] rounded-full animate-pulse" />
            <div className="relative p-12 bg-white rounded-[50px] shadow-2xl border border-slate-100">
              <Cpu size={100} className="text-emerald-500 animate-spin-slow" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-5xl font-black text-slate-800 tracking-tighter italic">
              READY TO BOOT?
            </h3>
            <p className="text-slate-400 font-bold max-w-md mx-auto leading-relaxed">
              수업 최적화 OS 환경을 새 창에서 실행합니다.<br/>
              화면 공간을 100% 활용하여 지존급 수업을 진행해봐, 자기야! ✨
            </p>
          </div>

          {/* 메인 가동 버튼 */}
          <Link 
            href="/teacher/special/class/os" 
            target="_blank" 
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-4 px-12 py-6 bg-slate-900 text-white rounded-[32px] font-black text-2xl hover:bg-emerald-600 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-emerald-200 active:scale-95"
          >
            <Play size={28} className="fill-white" />
            OS 엔진 가동하기
            <ExternalLink size={20} className="text-white/40 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}