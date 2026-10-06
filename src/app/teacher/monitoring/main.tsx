'use client';

import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  FileCheck, 
  Eye, 
  ShieldAlert, 
  Users, 
  Loader2,
  Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import RealtimeProctorTab from '../exammgr/RealtimeProctorTab';
import DailyActivityMonitoringTab from './DailyActivityMonitoringTab';

interface Student {
  id: string;
  name: string;
  grade: string;
  is_unlocked?: boolean;
}

export default function MonitoringCenterMain() {
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'test'>('daily');
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
      <div className="bg-white border-b border-slate-200/80 px-6 md:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
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

        {/* 2-Track 모드 전환 탭 */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
          <button
            onClick={() => setActiveSubTab('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeSubTab === 'daily'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye size={15} />
            <span>일상 모니터링 (상시 감시)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('test')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
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
                onSwitchToExamProctor={() => setActiveSubTab('test')}
              />
            )}

            {activeSubTab === 'test' && (
              <RealtimeProctorTab allStudents={students} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
