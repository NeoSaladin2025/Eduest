'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, CheckSquare, Square, Users, Clock, BookOpen, Calendar } from 'lucide-react';
import { ClassItem, StudentBasicInfo } from './types';

interface ClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  initialClass?: ClassItem | null;
  onSave: (data: {
    id?: string;
    date: string;
    name: string;
    time: string;
    student_ids: string[];
  }) => void;
  allStudents: StudentBasicInfo[];
}

const TIME_PRESETS = [
  '14:00 ~ 16:00',
  '15:00 ~ 17:00',
  '16:00 ~ 18:00',
  '17:00 ~ 19:00',
  '18:30 ~ 20:30',
  '19:00 ~ 21:00',
  '20:00 ~ 22:00',
];

const GRADE_FILTERS = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'];

export default function ClassModal({
  isOpen,
  onClose,
  date,
  initialClass,
  onSave,
  allStudents,
}: ClassModalProps) {
  const [className, setClassName] = useState('');
  const [classTime, setClassTime] = useState('17:00 ~ 19:00');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('전체');

  useEffect(() => {
    if (initialClass) {
      setClassName(initialClass.name);
      setClassTime(initialClass.time);
      setSelectedStudentIds(new Set(initialClass.student_ids || []));
    } else {
      setClassName('');
      setClassTime('17:00 ~ 19:00');
      setSelectedStudentIds(new Set());
    }
    setSearchTerm('');
    setGradeFilter('전체');
  }, [initialClass, isOpen]);

  if (!isOpen) return null;

  const filteredStudents = allStudents.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = gradeFilter === '전체' || s.grade.trim() === gradeFilter.trim();
    return matchesSearch && matchesGrade;
  });

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      filteredStudents.forEach(s => next.add(s.id));
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      filteredStudents.forEach(s => next.delete(s.id));
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) {
      alert('수업명을 입력해주세요.');
      return;
    }
    if (!classTime.trim()) {
      alert('수업시간을 입력해주세요.');
      return;
    }

    onSave({
      id: initialClass?.id,
      date,
      name: className.trim(),
      time: classTime.trim(),
      student_ids: Array.from(selectedStudentIds),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col overflow-hidden max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                {initialClass ? '수업 정보 수정' : '새 수업 등록'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <Calendar size={13} /> {date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* 1. 수업명 */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
              수업명 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="예: 중3 수학 내신대비반, 고1 정규 심화"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
              autoFocus
            />
          </div>

          {/* 2. 수업시간 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={14} className="text-slate-500" />
                수업시간 <span className="text-rose-500">*</span>
              </label>
            </div>
            <input
              type="text"
              value={classTime}
              onChange={e => setClassTime(e.target.value)}
              placeholder="예: 17:00 ~ 19:00"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400 mb-2"
            />
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map(preset => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setClassTime(preset)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all ${
                    classTime === preset
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* 3. 학생 선택 */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-slate-500" />
                  수업 참여 학생 선택
                </label>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full">
                  {selectedStudentIds.size}명 선택됨
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                >
                  검색결과 전체선택
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllFiltered}
                  className="text-slate-500 hover:text-slate-700 font-bold hover:underline"
                >
                  전체해제
                </button>
              </div>
            </div>

            {/* 필터 및 검색바 */}
            <div className="space-y-2 mb-3">
              {/* 학년 필터 */}
              <div className="flex flex-wrap gap-1">
                {GRADE_FILTERS.map(g => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setGradeFilter(g)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      gradeFilter === g
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* 검색창 */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="학생 이름으로 검색..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            </div>

            {/* 학생 체크 목록 */}
            <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto p-2 divide-y divide-slate-50 bg-slate-50/50">
              {filteredStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  해당 조건에 맞는 학생이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {filteredStudents.map(student => {
                    const isSelected = selectedStudentIds.has(student.id);
                    return (
                      <div
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-indigo-600 flex-shrink-0" />
                          ) : (
                            <Square size={16} className="text-slate-300 flex-shrink-0" />
                          )}
                          <span className="text-sm">{student.name}</span>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {student.grade}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200 transition-all"
            >
              {initialClass ? '수정 완료' : '수업 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
