'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  Users, 
  Search, 
  Check, 
  Loader2, 
  UserCheck, 
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { ExamPaper } from '@/app/api/test2/exam/route';

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface BatchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExamIds: string[];
  exams: ExamPaper[];
  students: Student[];
  onApply: (mode: 'add' | 'replace' | 'clear', targetStudentIds: string[]) => Promise<void>;
}

export default function BatchAssignModal({
  isOpen,
  onClose,
  selectedExamIds,
  exams,
  students,
  onApply,
}: BatchAssignModalProps) {
  const [assignMode, setAssignMode] = useState<'add' | 'replace' | 'clear'>('add');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  // 대상 시험지 제목들
  const selectedExams = useMemo(() => {
    return exams.filter(e => selectedExamIds.includes(e.id));
  }, [exams, selectedExamIds]);

  // 필터된 학생 목록
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchGrade = gradeFilter === 'ALL' || s.grade.includes(gradeFilter);
      const matchSearch = !searchKeyword.trim() || s.name.toLowerCase().includes(searchKeyword.trim().toLowerCase());
      return matchGrade && matchSearch;
    });
  }, [students, gradeFilter, searchKeyword]);

  // 학생 선택 토글
  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  // 현재 필터된 학생 전체 선택 / 해제
  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredStudents.map(s => s.id);
    const isAllSelected = allFilteredIds.every(id => selectedStudentIds.has(id));

    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (isAllSelected) {
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 실행
  const handleConfirm = async () => {
    if (assignMode !== 'clear' && selectedStudentIds.size === 0) {
      alert('배정할 학생을 최소 1명 이상 선택해 주세요.');
      return;
    }

    try {
      setIsApplying(true);
      await onApply(assignMode, Array.from(selectedStudentIds));
      onClose();
    } catch (err: any) {
      alert(`배정 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>시험지 {selectedExams.length}개 일괄 학생 배정</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                선택한 여러 시험지에 동일한 학생 그룹을 한 번에 배정하거나 수정합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 선택된 대상 시험지 안내 칩 */}
        <div className="shrink-0 bg-slate-50 px-6 py-3 border-b border-slate-200/80">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">배정 대상 시험지 ({selectedExams.length}개)</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {selectedExams.map(ex => (
              <span key={ex.id} className="text-xs bg-white text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                {ex.title}
              </span>
            ))}
          </div>
        </div>

        {/* 모달 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 배정 방식 선택 */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">배정 방식 선택</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAssignMode('add')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  assignMode === 'add'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">➕ 기존 배정에 추가</span>
                  {assignMode === 'add' && <Check size={14} className="text-indigo-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">기존에 배정된 학생을 유지하고 선택 학생 추가</p>
              </button>

              <button
                type="button"
                onClick={() => setAssignMode('replace')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  assignMode === 'replace'
                    ? 'border-violet-600 bg-violet-50/70 text-violet-900 ring-2 ring-violet-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">🔄 배정 덮어쓰기</span>
                  {assignMode === 'replace' && <Check size={14} className="text-violet-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">기존 배정을 비우고 이번 선택 학생들로 교체</p>
              </button>

              <button
                type="button"
                onClick={() => setAssignMode('clear')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  assignMode === 'clear'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-900 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">➖ 일괄 배정 해제</span>
                  {assignMode === 'clear' && <Check size={14} className="text-rose-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">선택한 시험지에서 모든 학생 배정 비우기</p>
              </button>
            </div>
          </div>

          {/* 학생 선택 영역 (clear 모드가 아닐 때 노출) */}
          {assignMode !== 'clear' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700">
                  배정할 학생 선택 <span className="text-indigo-600 font-bold">({selectedStudentIds.size}명 선택됨)</span>
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  현재 조건 전체 {filteredStudents.every(s => selectedStudentIds.has(s.id)) ? '해제' : '선택'}
                </button>
              </div>

              {/* 검색 및 학년 필터 */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="학생 이름으로 검색..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium"
                  />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {['ALL', '중1', '중2', '중3', '고1', '고2', '고3'].map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeFilter(g)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        gradeFilter === g
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {g === 'ALL' ? '전체' : g}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학생 그리드 */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3 max-h-64 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <p className="text-center py-8 text-xs text-slate-400 font-medium">검색 조건에 맞는 학생이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredStudents.map(student => {
                      const isSelected = selectedStudentIds.has(student.id);
                      return (
                        <div
                          key={student.id}
                          onClick={() => handleToggleStudent(student.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-white border-indigo-600 text-indigo-900 shadow-xs ring-1 ring-indigo-500'
                              : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold">{student.name}</p>
                            <p className="text-[10px] text-slate-400">{student.grade}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check size={12} className="stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            {assignMode === 'clear' 
              ? `선택한 ${selectedExams.length}개 시험지의 모든 학생 배정이 해제됩니다.`
              : `${selectedExams.length}개 시험지에 학생 ${selectedStudentIds.size}명이 일괄 배정됩니다.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isApplying}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
              <span>{isApplying ? '배정 적용 중...' : '일괄 배정 적용'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
