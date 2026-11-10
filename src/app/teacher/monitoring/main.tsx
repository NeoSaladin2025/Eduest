'use client';

import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  FileCheck, 
  Eye, 
  ShieldAlert, 
  Users, 
  Loader2, 
  Sparkles,
  Home,
  Library
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import RealtimeProctorTab from '../exammgr/RealtimeProctorTab';
import DailyActivityMonitoringTab from './DailyActivityMonitoringTab';
import HomeStudyMonitoringTab from './HomeStudyMonitoringTab';
import LibraryContentAnalyticsTab from './LibraryContentAnalyticsTab';

interface Student {
  id: string;
  name: string;
  grade: string;
  is_unlocked?: boolean;
}

export default function MonitoringCenterMain() {
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'home_study' | 'library_content' | 'test'>('daily');
  const [targetStudentId, setTargetStudentId] = useState<string | undefined>(undefined);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 전체 학생 목록 로드
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('students')
          .select('id, name, grade, is_unlocked')
          .order('grade', { ascending: true })
          .order('name', { ascending: true });

        if (!error && data) {
          setStudents(data);
        }
      } catch (err) {
        console.error('Students fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col">
      {/* 서브 탭 네비게이션 헤더 */}
      <div className="bg-white border-b border-slate-200/80 px-6 md:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
            <Radio size={20} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              실시간 모니터링 센터
            </h2>
            <p className="text-[11px] text-slate-400 font-bold">
              Eduest Live Student Monitoring System
            </p>
          </div>
        </div>

        {/* 3-Track 모드 전환 탭 */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shadow-2xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('daily')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeSubTab === 'daily'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye size={15} />
            <span>일상 모니터링 (상시 감시)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('home_study')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeSubTab === 'home_study'
                ? 'bg-white text-violet-700 shadow-sm border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Home size={15} />
            <span>가정·자기주도 학습 분석</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('library_content')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeSubTab === 'library_content'
                ? 'bg-white text-purple-700 shadow-sm border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Library size={15} />
            <span>컨텐츠(라이브러리) 분석</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 font-extrabold border border-purple-200">
              NEW
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('test')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeSubTab === 'test'
                ? 'bg-white text-rose-600 shadow-sm border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldAlert size={15} />
            <span>테스트 모니터링 (시험 감독)</span>
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 뷰 */}
      <div className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[500px] gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={36} />
            <p className="text-xs font-bold text-slate-400">학생 데이터를 불러오는 중...</p>
          </div>
        ) : (
          <>
            {activeSubTab === 'daily' && (
              <DailyActivityMonitoringTab
                allStudents={students}
                onSwitchToExamProctor={(studentId) => {
                  setTargetStudentId(studentId);
                  setActiveSubTab('test');
                }}
              />
            )}

            {activeSubTab === 'home_study' && (
              <HomeStudyMonitoringTab
                allStudents={students}
              />
            )}

            {activeSubTab === 'library_content' && (
              <LibraryContentAnalyticsTab />
            )}

            {activeSubTab === 'test' && (
              <RealtimeProctorTab 
                allStudents={students} 
                initialStudentId={targetStudentId}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
