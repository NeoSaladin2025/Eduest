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
  Zap,
  CalendarDays,
  SlidersHorizontal,
  FileCheck,
  Layers
} from 'lucide-react';

// 🔗 하위 폴더 컴포넌트들 연동
import DashboardMain from './dashboard/main';
import SpecialMain from './special/main';
// ✅ 학생 관리 컴포넌트 추가
import StudentManagerMain from './studentmanager/main'; 
// ✅ 수업 관리 컴포넌트 추가
import ClassManagerMain from './classmanager/main';
// ✅ 학생화면 관리 컴포넌트 추가
import StudentViewManagerMain from './studentviewmanager/main';
// ✅ 테스트 관리 컴포넌트 추가
import ExamManagerMain from './exammgr/main';
// ✅ 테스트자료 관리 컴포넌트 추가
import TestDataManagerMain from './testdatamgr/main';

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
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={16} /> },
    { id: 'students', label: '학생 관리', icon: <Users size={16} /> },
    { id: 'studentview', label: '학생화면 관리', icon: <SlidersHorizontal size={16} /> },
    { id: 'classes', label: '수업관리', icon: <CalendarDays size={16} /> },
    { id: 'exammgr', label: '테스트 관리', icon: <FileCheck size={16} /> },
    { id: 'testdatamgr', label: '테스트자료 관리', icon: <Layers size={16} /> },
    { id: 'notices', label: '공지사항', icon: <Bell size={16} /> },
  ];

  if (adminName === '곽명용') {
    menuItems.push({ 
      id: 'special', 
      label: '스페셜 유틸리티', 
      icon: <Zap size={16} className="text-amber-500 fill-amber-500" /> 
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      
      {/* 1. 상단 GNB (고정 높이 & 모던 탭 네비게이션) */}
      <nav className="h-18 bg-white border-b border-slate-200/80 px-6 md:px-8 flex items-center justify-between gap-4 shadow-xs flex-shrink-0 z-50">
        <div className="flex items-center gap-6 lg:gap-8 min-w-0 flex-1">
          {/* 로고 */}
          <div 
            className="flex items-center gap-2.5 group cursor-pointer shrink-0" 
            onClick={() => setActiveMenu('dashboard')}
            title="대시보드 홈으로 이동"
          >
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 group-hover:scale-105 transition-all">
              <UserCheck className="text-white" size={20} />
            </div>
            <div className="text-lg font-black tracking-tighter text-slate-900 italic uppercase">
              Eduest
            </div>
          </div>

          {/* 중앙 네비게이션 탭 메뉴 (줄바꿈 방지 & 스크롤 지원) */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 overflow-x-auto scrollbar-hide max-w-full">
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 rounded-xl text-xs md:text-[13px] font-bold transition-all duration-150 whitespace-nowrap shrink-0 ${
                    isActive 
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70 font-black' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                  }`}
                >
                  <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 우측 관리자 프로필 & 로그아웃 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-1">
              {adminName === '곽명용' ? 'Super Administrator' : 'Authenticated Teacher'}
            </p>
            <p className="text-xs md:text-sm font-bold text-slate-700">{adminName} 선생님</p>
          </div>
          <div className="h-7 w-[1px] bg-slate-200 mx-0.5 hidden sm:block"></div>
          <button 
            onClick={() => { 
              localStorage.clear(); 
              document.cookie = 'currentAdminName=; path=/; max-age=0; SameSite=Strict; Secure';
              window.location.href = '/'; 
            }}
            className="p-2 md:p-2.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-100"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* 2. 메인 콘텐츠 영역 */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="w-full h-full animate-in fade-in duration-500">
          
          {/* ✅ 대시보드 */}
          {activeMenu === 'dashboard' && (
            <div className="p-8 max-w-[1600px] mx-auto overflow-y-auto h-full">
              <DashboardMain onNavigate={(menu: string) => setActiveMenu(menu)} />
            </div>
          )}

          {/* ✅ 학생 관리 (연동 완료!) */}
          {activeMenu === 'students' && (
            <div className="w-full h-full bg-white overflow-y-auto">
              <StudentManagerMain />
            </div>
          )}

          {/* ✅ 학생화면 관리 */}
          {activeMenu === 'studentview' && (
            <div className="w-full h-full bg-white overflow-y-auto">
              <StudentViewManagerMain />
            </div>
          )}

          {/* ✅ 스페셜 유틸리티 */}
          {activeMenu === 'special' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <SpecialMain />
            </div>
          )}

          {/* ✅ 수업관리 (신규 달력형 수업/출석/숙제 관리) */}
          {activeMenu === 'classes' && (
            <div className="w-full h-full bg-white overflow-hidden">
              <ClassManagerMain />
            </div>
          )}

          {/* ✅ 테스트 관리 (시험지 제작 및 배정) */}
          {activeMenu === 'exammgr' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <ExamManagerMain />
            </div>
          )}

          {/* ✅ 테스트자료 관리 (원천DB 선별 및 시험DB 구축) */}
          {activeMenu === 'testdatamgr' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <TestDataManagerMain />
            </div>
          )}

          {/* ✅ 기타 공사중 */}
          {activeMenu === 'notices' && (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic font-medium text-lg">
               Under Construction... ❤️
            </div>
          )}
        </div>
      </main>
    </div>
  );
}