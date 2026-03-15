'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  Zap, 
  Clock, 
  ChevronRight, 
  Calendar,
  ArrowUpRight
} from 'lucide-react';

export default function DashboardMain() {
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    const name = localStorage.getItem('currentAdminName');
    if (name) setAdminName(name);
  }, []);

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
            HELLO, <span className="text-indigo-600">{adminName}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">오늘도 에듀이스트와 함께 차원을 관리할 시간입니다.</p>
        </div>

        {/* 현재 날짜 표시 (디테일!) */}
        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 font-bold text-sm">
          <Calendar size={18} />
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
      </div>

      {/* 📊 핵심 지표 카드 (3그리드) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: '전체 관리 학생', value: '14', unit: '명', icon: <Users size={24} />, color: 'bg-indigo-500' },
          { label: '주간 활성 지수', value: '98', unit: '%', icon: <TrendingUp size={24} />, color: 'bg-emerald-500' },
          { label: '미확인 과제', value: '05', unit: '건', icon: <Clock size={24} />, color: 'bg-rose-500' },
        ].map((stat, i) => (
          <div key={i} className="relative overflow-hidden p-8 rounded-[35px] bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group cursor-default">
            <div className={`absolute top-0 right-0 w-32 h-32 ${stat.color} opacity-[0.03] -mr-8 -mt-8 rounded-full group-hover:scale-150 transition-transform duration-500`}></div>
            
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 rounded-2xl ${stat.color} text-white shadow-lg shadow-${stat.color.split('-')[1]}-200`}>
                {stat.icon}
              </div>
              <ArrowUpRight className="text-slate-300 group-hover:text-slate-900 transition-colors" size={20} />
            </div>

            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{stat.value}</span>
              <span className="text-lg font-bold text-slate-400">{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 📋 하단 상세 영역 (2컬럼) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 최근 활동 로그 */}
        <div className="p-8 rounded-[40px] bg-slate-50/50 border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-800 italic tracking-tight">RECENT ACTIVITY</h3>
            <button className="text-xs font-bold text-indigo-600 hover:underline">모두 보기</button>
          </div>
          
          <div className="space-y-4">
            {[
              { msg: '신규 학생 "이학생"님이 초대 코드로 가입했습니다.', time: '2시간 전', type: 'new' },
              { msg: '기말고사 대비 모의고사 과제가 배포되었습니다.', time: '5시간 전', type: 'task' },
              { msg: '시스템 정기 업데이트가 완료되었습니다.', time: '어제', type: 'sys' },
            ].map((log, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-100 transition-colors">
                <p className="text-sm font-medium text-slate-600 truncate mr-4">{log.msg}</p>
                <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap uppercase tracking-tighter">{log.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 퀵 가이드 / 공지 */}
        <div className="p-8 rounded-[40px] bg-indigo-600 text-white shadow-2xl shadow-indigo-200 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 blur-[80px] -mr-20 -mt-20"></div>
          
          <div className="relative z-10">
            <h3 className="text-2xl font-black italic mb-4 tracking-tighter">NEW FEATURE</h3>
            <p className="text-indigo-100 font-medium leading-relaxed">
              이제 학생들에게 <span className="text-white font-bold underline">실시간 화상 피드백</span>을 <br/>
              보낼 수 있는 기능이 업데이트되었습니다.
            </p>
          </div>

          <button className="relative z-10 w-full mt-8 py-4 bg-white text-indigo-600 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors">
            업데이트 내용 확인하기
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}