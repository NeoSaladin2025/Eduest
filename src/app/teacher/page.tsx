'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  BookOpen, 
  Settings, 
  LogOut, 
  Bell, 
  LayoutDashboard, 
  UserCheck,
  CalendarDays,
  SlidersHorizontal,
  FileCheck,
  Layers,
  Radio,
  ChevronDown,
  CalendarCheck
} from 'lucide-react';

// 🔗 하위 폴더 컴포넌트들 연동
import DashboardMain from './dashboard/main';
import StudentManagerMain from './studentmanager/main'; 
import ClassManagerMain from './classmanager/main';
import StudentViewManagerMain from './studentviewmanager/main';
import ExamManagerMain from './exammgr/main';
import TestDataManagerMain from './testdatamgr/main';
import ReviewManagerMain from './reviewmgr/main';
import MonitoringCenterMain from './monitoring/main';
import ScheduleManagerMain from './schedule/main';

// 🌟 신규 통합 알림 센터 모달
import NotificationHubModal from './notifications/NotificationHubModal';

interface NavDropdownItem {
  id: string;
  label: string;
  desc?: string;
  icon: React.ReactNode;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  children?: NavDropdownItem[];
}

export default function TeacherAdminPage() {
  const [adminName, setAdminName] = useState('');
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [pendingGradingCount, setPendingGradingCount] = useState<number>(0);
  const [isNotificationHubOpen, setIsNotificationHubOpen] = useState<boolean>(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const navRef = useRef<HTMLDivElement>(null);

  const handleMouseEnterDropdown = (groupId: string) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenDropdown(groupId);
  };

  const handleMouseLeaveDropdown = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  // 채점 대기 건수 확인
  const checkPendingGrading = async () => {
    try {
      const res = await fetch('/api/test2/descriptive-grading');
      const data = await res.json();
      if (data.success && typeof data.pending_total === 'number') {
        setPendingGradingCount(data.pending_total);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const storedName = localStorage.getItem('currentAdminName');
    if (storedName) {
      setAdminName(storedName);
    }

    checkPendingGrading();
    const interval = setInterval(checkPendingGrading, 30000); // 30초마다 폴링
    return () => {
      clearInterval(interval);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 네비게이션 그룹 구조 (가로 스크롤 제거 & 3~4개 카테고리로 압축)
  const navGroups: NavGroup[] = [
    {
      id: 'dashboard',
      label: '대시보드',
      icon: <LayoutDashboard size={15} />,
    },
    {
      id: 'group_students',
      label: '학생 관리',
      icon: <Users size={15} />,
      children: [
        { 
          id: 'students', 
          label: '학생 기본 정보', 
          desc: '학생 등록, 계정 및 명단 관리', 
          icon: <Users size={15} /> 
        },
        { 
          id: 'studentview', 
          label: '학생화면 관리', 
          desc: '학생 태블릿 화면 레이아웃 설정', 
          icon: <SlidersHorizontal size={15} /> 
        },
      ],
    },
    {
      id: 'group_classes',
      label: '수업 및 복습',
      icon: <CalendarDays size={15} />,
      children: [
        { 
          id: 'classes', 
          label: '수업 & 출석 관리', 
          desc: '수업 일정, 출결, 과제 배정', 
          icon: <CalendarDays size={15} /> 
        },
        { 
          id: 'reviewmgr', 
          label: '복습 & 과제 관리', 
          desc: '복습 현황 모니터링, 특별 복습지 배정', 
          icon: <BookOpen size={15} /> 
        },
      ],
    },
    {
      id: 'group_exams',
      label: '테스트 관리',
      icon: <FileCheck size={15} />,
      children: [
        { 
          id: 'exammgr', 
          label: '테스트 출제 및 배정', 
          desc: '시험지 제작 및 실시간 응시 배정', 
          icon: <FileCheck size={15} /> 
        },
        { 
          id: 'testdatamgr', 
          label: '테스트자료 DB 구축', 
          desc: '원천 문항 데이터 선별 및 시험 DB', 
          icon: <Layers size={15} /> 
        },
      ],
    },
    {
      id: 'schedule',
      label: '일정 관리',
      icon: <CalendarCheck size={15} />,
    },
    {
      id: 'monitoring',
      label: '실시간 모니터링',
      icon: <Radio size={15} />,
    },
    {
      id: 'notices',
      label: '공지사항',
      icon: <Bell size={15} />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      
      {/* 1. 상단 GNB (고정 높이 & 모던 그룹형 드롭다운 네비게이션) */}
      <nav 
        ref={navRef}
        className="h-18 bg-white border-b border-slate-200/80 px-4 md:px-7 flex items-center justify-between gap-4 shadow-xs flex-shrink-0 z-50 select-none"
      >
        <div className="flex items-center gap-5 lg:gap-8 min-w-0">
          {/* 로고 */}
          <div 
            className="flex items-center gap-2.5 group cursor-pointer shrink-0" 
            onClick={() => {
              setActiveMenu('dashboard');
              setOpenDropdown(null);
            }}
            title="대시보드 홈으로 이동"
          >
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 group-hover:scale-105 transition-all">
              <UserCheck className="text-white" size={20} />
            </div>
            <div className="text-lg font-black tracking-tighter text-slate-900 italic uppercase">
              Eduest
            </div>
          </div>

          {/* 중앙 네비게이션 메뉴 (드롭다운형 - 스크롤바 완전 제거) */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl border border-slate-200/70">
            {navGroups.map((group) => {
              // 단독 버튼 형태
              if (!group.children) {
                const isActive = activeMenu === group.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => {
                      setActiveMenu(group.id);
                      setOpenDropdown(null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 rounded-xl text-xs md:text-[13px] font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                      isActive 
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70 font-black' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>
                      {group.icon}
                    </span>
                    <span>{group.label}</span>
                    {group.id === 'monitoring' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    )}
                  </button>
                );
              }

              // 드롭다운 그룹 형태
              const isChildActive = group.children.some((c) => c.id === activeMenu);
              const isOpen = openDropdown === group.id;

              return (
                <div 
                  key={group.id} 
                  className="relative"
                  onMouseEnter={() => handleMouseEnterDropdown(group.id)}
                  onMouseLeave={handleMouseLeaveDropdown}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                      setOpenDropdown(isOpen ? null : group.id);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 rounded-xl text-xs md:text-[13px] font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                      isChildActive
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70 font-black'
                        : isOpen
                        ? 'bg-white/80 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span className={isChildActive ? 'text-indigo-600' : 'text-slate-400'}>
                      {group.icon}
                    </span>
                    <span>{group.label}</span>
                    <ChevronDown 
                      size={13} 
                      className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`} 
                    />
                    {group.id === 'group_exams' && pendingGradingCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black animate-pulse">
                        {pendingGradingCount}
                      </span>
                    )}
                  </button>

                  {/* 드롭다운 플로팅 패널 (투명 가상 브릿지로 틈새 마우스 이탈 완전 방지) */}
                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 before:content-[''] before:absolute before:-top-3 before:left-0 before:w-full before:h-3">
                      <div className="space-y-1">
                        {group.children.map((sub) => {
                          const isSubActive = activeMenu === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                setActiveMenu(sub.id);
                                setOpenDropdown(null);
                              }}
                              className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                                isSubActive
                                  ? 'bg-indigo-50/80 text-indigo-700'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              <div className={`mt-0.5 p-1 rounded-lg ${isSubActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {sub.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-bold leading-tight ${isSubActive ? 'text-indigo-900 font-black' : 'text-slate-800'}`}>
                                    {sub.label}
                                  </span>
                                  {sub.id === 'exammgr' && pendingGradingCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black">
                                      {pendingGradingCount}
                                    </span>
                                  )}
                                </div>
                                {sub.desc && (
                                  <p className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5 truncate">
                                    {sub.desc}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측 알림 버튼 & 관리자 프로필 & 로그아웃 */}
        <div className="flex items-center gap-2.5 shrink-0">
          
          {/* 🔔 [통합 알림 센터] 버튼 */}
          <button
            type="button"
            onClick={() => setIsNotificationHubOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
              pendingGradingCount > 0
                ? 'bg-rose-50/90 border-rose-300 text-rose-700 hover:bg-rose-100 shadow-sm shadow-rose-100'
                : 'bg-slate-50 border-slate-200/90 text-slate-600 hover:bg-slate-100/80'
            }`}
            title="통합 알림 센터 열기"
          >
            <div className="relative">
              <Bell 
                size={16} 
                className={pendingGradingCount > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-400'} 
              />
              {pendingGradingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
              )}
            </div>
            <span className="font-extrabold text-[12px] md:text-xs">통합 알림</span>
            {pendingGradingCount > 0 ? (
              <span className="px-2 py-0.5 bg-rose-600 text-white rounded-full text-[10px] font-black animate-pulse">
                {pendingGradingCount}건
              </span>
            ) : (
              <span className="px-1.5 py-0.2 bg-slate-200 text-slate-500 rounded-full text-[10px] font-bold">
                0
              </span>
            )}
          </button>

          <div className="h-6 w-[1px] bg-slate-200 mx-0.5 hidden sm:block"></div>

          {/* 선생님 프로필 */}
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-1">
              {adminName === '곽명용' ? 'Super Administrator' : 'Authenticated Teacher'}
            </p>
            <p className="text-xs md:text-sm font-bold text-slate-700">{adminName} 선생님</p>
          </div>
          
          <div className="h-7 w-[1px] bg-slate-200 mx-0.5 hidden sm:block"></div>
          
          {/* 로그아웃 */}
          <button 
            onClick={() => { 
              localStorage.clear(); 
              document.cookie = 'currentAdminName=; path=/; max-age=0; SameSite=Strict; Secure';
              window.location.href = '/'; 
            }}
            className="p-2 md:p-2.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-100 cursor-pointer"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* 2. 메인 콘텐츠 영역 */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="w-full h-full animate-in fade-in duration-300">
          
          {/* ✅ 대시보드 */}
          {activeMenu === 'dashboard' && (
            <div className="p-8 max-w-[1600px] mx-auto overflow-y-auto h-full">
              <DashboardMain onNavigate={(menu: string) => setActiveMenu(menu)} />
            </div>
          )}

          {/* ✅ 학생 관리 */}
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

          {/* ✅ 수업관리 (달력형 수업/출석/숙제 관리) */}
          {activeMenu === 'classes' && (
            <div className="w-full h-full bg-white overflow-hidden">
              <ClassManagerMain />
            </div>
          )}

          {/* ✅ 복습관리 (학생별 복습 현황 모니터링 & 스페셜 테스트 제작/인증샷 확인) */}
          {activeMenu === 'reviewmgr' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <ReviewManagerMain />
            </div>
          )}

          {/* ✅ 테스트 관리 (시험지 제작 및 배정) */}
          {activeMenu === 'exammgr' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <ExamManagerMain onNavigate={(menu: string) => setActiveMenu(menu)} />
            </div>
          )}

          {/* ✅ 테스트자료 관리 (원천DB 선별 및 시험DB 구축) */}
          {activeMenu === 'testdatamgr' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <TestDataManagerMain />
            </div>
          )}

          {/* ✅ 일정 관리 (학사일정 & 주요일정 포스트잇) */}
          {activeMenu === 'schedule' && (
            <div className="w-full h-full bg-white overflow-hidden">
              <ScheduleManagerMain />
            </div>
          )}

          {/* ✅ 공지사항 */}
          {activeMenu === 'notices' && (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic font-medium text-lg">
               Under Construction... ❤️
            </div>
          )}

          {/* ✅ 실시간 모니터링 독립 센터 */}
          {activeMenu === 'monitoring' && (
            <div className="w-full h-full bg-slate-50 overflow-y-auto">
              <MonitoringCenterMain />
            </div>
          )}
        </div>
      </main>

      {/* 🌟 신규 통합 알림 센터 모달 (Notification Hub) */}
      <NotificationHubModal
        isOpen={isNotificationHubOpen}
        onClose={() => setIsNotificationHubOpen(false)}
        pendingGradingCount={pendingGradingCount}
        onGradedChange={(cnt) => setPendingGradingCount(cnt)}
        adminName={adminName}
      />
    </div>
  );
}