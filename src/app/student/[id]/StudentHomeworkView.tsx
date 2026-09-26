'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  CalendarDays,
  Filter,
  Check
} from 'lucide-react';
import { StudentHomeworkItem } from './types';

interface StudentHomeworkViewProps {
  studentId: string;
  studentName?: string;
  studentGrade?: string;
}

export default function StudentHomeworkView({
  studentId,
  studentName,
  studentGrade,
}: StudentHomeworkViewProps) {
  const [loading, setLoading] = useState(true);
  const [homeworkList, setHomeworkList] = useState<StudentHomeworkItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DONE' | 'NOT_DONE' | 'UNCHECKED'>('ALL');

  useEffect(() => {
    let isCancelled = false;

    const fetchHomework = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/classes');
        if (!res.ok) throw new Error('수업 데이터 로드 실패');
        const data = await res.json();
        const classes: any[] = data.classes || [];

        // 학생에게 배정된 모든 숙제 추출
        const assignedItems: StudentHomeworkItem[] = [];
        const checkedMap = new Map<string, { status: 'DONE' | 'NOT_DONE' | 'UNCHECKED'; dueDate: string }>();

        classes.forEach(c => {
          const rec = c.students_attendance?.[studentId];
          if (!rec) return;

          // 검사된 숙제 상태 맵핑
          if (rec.previous_homework && rec.previous_homework.trim()) {
            const trimmed = rec.previous_homework.trim();
            checkedMap.set(trimmed, {
              status: (rec.homework_check || 'UNCHECKED') as any,
              dueDate: rec.previous_homework_due_date || '',
            });
          }

          // 부여받은 숙제
          if (rec.today_homework && rec.today_homework.trim()) {
            const trimmed = rec.today_homework.trim();
            assignedItems.push({
              id: `${c.id}_${studentId}_today`,
              classId: c.id,
              className: c.name,
              classDate: c.date,
              content: trimmed,
              dueDate: rec.today_homework_due_date || '',
              status: (rec.homework_check || 'UNCHECKED') as any,
            });
          }
        });

        // 후속 수업에서 검사된 상태가 있으면 반영
        assignedItems.forEach(item => {
          const checked = checkedMap.get(item.content);
          if (checked) {
            item.status = checked.status;
            if (!item.dueDate && checked.dueDate) {
              item.dueDate = checked.dueDate;
            }
          }
        });

        // 날짜 기준 내림차순 (최신 부여 날짜가 맨 위로)
        assignedItems.sort((a, b) => b.classDate.localeCompare(a.classDate));

        if (!isCancelled) {
          setHomeworkList(assignedItems);
        }
      } catch (err) {
        console.error('Failed to fetch homework:', err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchHomework();
    return () => {
      isCancelled = true;
    };
  }, [studentId]);

  // 가장 최근 숙제 (첫 번째 항목)
  const latestHomework = useMemo(() => {
    return homeworkList.length > 0 ? homeworkList[0] : null;
  }, [homeworkList]);

  // 필터링된 과거 숙제 목록 (최근 숙제 포함 전체 목록 필터링)
  const filteredList = useMemo(() => {
    if (filter === 'ALL') return homeworkList;
    return homeworkList.filter(item => item.status === filter);
  }, [homeworkList, filter]);

  // D-Day 계산 유틸리티
  const getDDayBadge = (dueDateStr: string) => {
    if (!dueDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl font-black text-xs">
          기한 마감 ({Math.abs(diffDays)}일 전)
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-black text-xs animate-pulse">
          🔥 오늘 마감 (D-Day)
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl font-black text-xs">
          D-{diffDays}
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
        <p className="text-sm font-bold tracking-widest uppercase">숙제 정보를 불러오고 있습니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500 max-w-5xl mx-auto">
      
      {/* 🌟 1. 최근 부여받은 숙제 Hero Section (사용자 요청: 부여받은 날짜 및 제출 기한 표시) */}
      {latestHomework ? (
        <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-indigo-950/40 via-white/5 to-purple-950/30 border border-indigo-500/30 p-8 md:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <BookOpen size={160} className="text-indigo-400" />
          </div>

          <div className="relative z-10 space-y-6">
            {/* Top Badges */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-black tracking-wider uppercase flex items-center gap-1.5 shadow-md shadow-indigo-600/30">
                  <Sparkles size={14} />
                  현재 진행 중인 최근 숙제
                </span>
                <span className="px-3 py-1 bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10">
                  {latestHomework.className}
                </span>
                {getDDayBadge(latestHomework.dueDate)}
              </div>

              {/* Status Badge */}
              <div>
                {latestHomework.status === 'DONE' ? (
                  <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> 숙제 완료
                  </span>
                ) : latestHomework.status === 'NOT_DONE' ? (
                  <span className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black flex items-center gap-1.5">
                    <XCircle size={15} /> 숙제 미완료
                  </span>
                ) : (
                  <span className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center gap-1.5">
                    <Clock size={15} /> 진행 중 / 검사 대기
                  </span>
                )}
              </div>
            </div>

            {/* Date Details Bar */}
            <div className="flex flex-wrap items-center gap-6 py-3 border-y border-white/10 text-xs md:text-sm font-bold text-slate-300">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-indigo-400" />
                <span className="text-slate-400">부여받은 날짜:</span>
                <span className="text-white font-black">{latestHomework.classDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-amber-400" />
                <span className="text-slate-400">제출 기한:</span>
                <span className="text-white font-black">
                  {latestHomework.dueDate ? latestHomework.dueDate : '기한 미지정'}
                </span>
              </div>
            </div>

            {/* Content Area */}
            <div className="space-y-2">
              <label className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                📝 숙제 내용 및 범위
              </label>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 md:p-6 text-white text-base md:text-lg font-medium leading-relaxed whitespace-pre-wrap">
                {latestHomework.content}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[36px] bg-white/5 border border-white/10 p-12 text-center text-slate-400 space-y-3">
          <BookOpen size={48} className="mx-auto text-indigo-400 opacity-60" />
          <h3 className="text-xl font-black text-white">현재 부여받은 숙제가 없습니다! 🎉</h3>
          <p className="text-xs text-slate-400">선생님이 수업에서 숙제를 등록하면 이곳에 바로 표시됩니다.</p>
        </div>
      )}

      {/* 🌟 2. 숙제 내역 히스토리 (전체 목록) */}
      <div className="space-y-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <BookOpen size={20} className="text-indigo-400" />
            <h2 className="text-xl font-black text-white tracking-tight">전체 숙제 히스토리</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-bold text-slate-300">
              {homeworkList.length}건
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-2xl border border-white/10 text-xs font-bold">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setFilter('DONE')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === 'DONE' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              완료됨
            </button>
            <button
              onClick={() => setFilter('NOT_DONE')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === 'NOT_DONE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              미완료
            </button>
            <button
              onClick={() => setFilter('UNCHECKED')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === 'UNCHECKED' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              진행 중
            </button>
          </div>
        </div>

        {/* List of cards */}
        {filteredList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-bold text-sm">
            해당 조건의 숙제 내역이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredList.map((item, idx) => (
              <div
                key={item.id || idx}
                className="bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-2xl p-5 md:p-6 transition-all space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 font-black text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-400">부여일:</span>
                    <span className="text-xs font-black text-white">{item.classDate}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-xs font-bold text-slate-400">기한일:</span>
                    <span className="text-xs font-black text-amber-300">
                      {item.dueDate || '기한 미지정'}
                    </span>
                    <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                      {item.className}
                    </span>
                  </div>

                  <div>
                    {item.status === 'DONE' ? (
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-black flex items-center gap-1">
                        <CheckCircle2 size={12} /> 완료
                      </span>
                    ) : item.status === 'NOT_DONE' ? (
                      <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-black flex items-center gap-1">
                        <XCircle size={12} /> 미완료
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-black flex items-center gap-1">
                        <Clock size={12} /> 진행 중
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm font-medium text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
