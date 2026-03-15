'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  Settings, 
  LogOut, 
  Bell, 
  LayoutDashboard, 
  UserCheck,
  Zap 
} from 'lucide-react';

// 🔗 하위 폴더 컴포넌트들 연동
import DashboardMain from './dashboard/main';
import SpecialMain from './special/main';

export default function TeacherAdminPage() {
  const [adminName, setAdminName] = useState('');
  const [activeMenu, setActiveMenu] = useState('dashboard');

  useEffect(() => {
    const storedName = localStorage.getItem('currentAdminName');
    if (storedName) {
      setAdminName(storedName);
    }
  }, []);

  const menuItems = [
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={19} /> },
    { id: 'students', label: '학생 관리', icon: <Users size={19} /> },
    { id: 'lessons', label: '수업/과제', icon: <BookOpen size={19} /> },
    { id: 'notices', label: '공지사항', icon: <Bell size={19} /> },
  ];

  if (adminName === '곽명용') {
    menuItems.push({ 
      id: 'special', 
      label: '스페셜 유틸리티', 
      icon: <Zap size={19} className="text-amber-500 fill-amber-500 animate-pulse" /> 
    });
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
      
      {/* 1. 상단 GNB (고정 높이) */}
      <nav className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm flex-shrink-0 z-50">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setActiveMenu('dashboard')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:rotate-12 transition-transform">
              <UserCheck className="text-white" size={22} />
            </div>
            <div className="text-xl font-black tracking-tighter text-slate-800 italic uppercase">
              Eduest
            </div>
          </div>

          <div className="flex items-center bg-slate-100/50 p-1 rounded-xl">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveMenu(item.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeMenu === item.id 
                  ? 'bg-white text-indigo-600 shadow-sm scale-[1.02]' 
                  : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-1">
              {adminName === '곽명용' ? 'Super Administrator' : 'Authenticated Teacher'}
            </p>
            <p className="text-sm font-bold text-slate-700">{adminName} 선생님</p>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
          <button 
            onClick={() => { localStorage.clear(); window.location.href = '/'; }}
            className="p-2.5 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* 2. 메인 콘텐츠 영역 (나머지 공간 전부 사용) */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* - max-w 제거: 화면 끝까지 사용
            - bg-white: 내부 카드 배경과 통일
            - h-full: 자식 컴포넌트들이 부모 높이를 100% 쓸 수 있게 함
        */}
        <div className="w-full h-full animate-in fade-in duration-500">
          
          {/* ✅ 대시보드 (대시보드만 여백이 필요하다면 내부에서 p-8 사용) */}
          {activeMenu === 'dashboard' && (
            <div className="p-8 max-w-[1600px] mx-auto">
              <DashboardMain />
            </div>
          )}

          {/* ✅ 스페셜 유틸리티 (여백 없이 꽉 채움!) */}
          {activeMenu === 'special' && (
            <div className="w-full h-full bg-slate-50">
              <SpecialMain />
            </div>
          )}

          {/* ✅ 학생 관리 (임시) */}
          {activeMenu === 'students' && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 italic">
               <Users size={48} className="mb-4 opacity-20" />
               <p>Student Management is coming soon...</p>
            </div>
          )}

          {/* ✅ 기타 공사중 */}
          {['lessons', 'notices'].includes(activeMenu) && (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic font-medium text-lg">
               Under Construction... ❤️
            </div>
          )}
        </div>
      </main>

      {/* 푸터는 공간을 너무 많이 차지하니까 삭제하거나 아주 작게 처리 */}
    </div>
  );
}