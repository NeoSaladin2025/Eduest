'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  SlidersHorizontal, 
  Check, 
  Loader2, 
  Sparkles,
  Info,
  Tag
} from 'lucide-react';
import { ExamPaper } from '@/app/api/test2/exam/route';
import FilterChipBadge, { FilterChip } from './FilterChipBadge';

interface BatchFilterChipModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExamIds: string[];
  exams: ExamPaper[];
  filterChips: FilterChip[];
  onApply: (mode: 'add' | 'remove' | 'replace', chipIds: string[]) => Promise<void>;
}

export default function BatchFilterChipModal({
  isOpen,
  onClose,
  selectedExamIds,
  exams,
  filterChips,
  onApply,
}: BatchFilterChipModalProps) {
  const [chipMode, setChipMode] = useState<'add' | 'remove' | 'replace'>('add');
  const [selectedChipIds, setSelectedChipIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  // 대상 시험지들
  const selectedExams = useMemo(() => {
    return exams.filter(e => selectedExamIds.includes(e.id));
  }, [exams, selectedExamIds]);

  const handleToggleChip = (chipId: string) => {
    setSelectedChipIds(prev => {
      const next = new Set(prev);
      if (next.has(chipId)) {
        next.delete(chipId);
      } else {
        next.add(chipId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedChipIds.size === 0 && chipMode !== 'replace') {
      alert('적용할 필터칩을 1개 이상 선택해 주세요.');
      return;
    }

    try {
      setIsApplying(true);
      await onApply(chipMode, Array.from(selectedChipIds));
      onClose();
    } catch (err: any) {
      alert(`필터칩 일괄 변경 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>시험지 {selectedExams.length}개 필터칩 일괄 관리</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                선택한 여러 시험지에 동일한 분류 필터칩을 일괄 부착하거나 제거합니다.
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
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">적용 대상 시험지 ({selectedExams.length}개)</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {selectedExams.map(ex => (
              <span key={ex.id} className="text-xs bg-white text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                {ex.title}
              </span>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 변경 방식 선택 */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">필터칩 변경 방식</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChipMode('add')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  chipMode === 'add'
                    ? 'border-violet-600 bg-violet-50/70 text-violet-900 ring-2 ring-violet-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">➕ 칩 추가</span>
                  {chipMode === 'add' && <Check size={14} className="text-violet-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">기존 필터칩 유지 + 선택한 칩 추가</p>
              </button>

              <button
                type="button"
                onClick={() => setChipMode('remove')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  chipMode === 'remove'
                    ? 'border-amber-600 bg-amber-50/70 text-amber-900 ring-2 ring-amber-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">➖ 칩 제거</span>
                  {chipMode === 'remove' && <Check size={14} className="text-amber-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">선택한 칩만 골라서 제거</p>
              </button>

              <button
                type="button"
                onClick={() => setChipMode('replace')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  chipMode === 'replace'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">🔄 칩 교체</span>
                  {chipMode === 'replace' && <Check size={14} className="text-indigo-600 font-bold" />}
                </div>
                <p className="text-[11px] text-slate-500">기존 칩을 모두 지우고 선택한 칩으로만 세팅</p>
              </button>
            </div>
          </div>

          {/* 등록된 필터칩 팔레트 */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-700 block">
              적용할 필터칩 선택 <span className="text-violet-600 font-bold">({selectedChipIds.size}개 선택됨)</span>
            </label>

            {filterChips.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-400">
                등록된 필터칩이 없습니다. '필터칩 관리'에서 먼저 필터칩을 생성해 주세요.
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2">
                {filterChips.map(chip => {
                  const isSelected = selectedChipIds.has(chip.id);
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => handleToggleChip(chip.id)}
                      className={`transition-all rounded-xl cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-violet-500 scale-105 shadow-xs'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <FilterChipBadge chip={chip} size="md" isSelected={isSelected} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            선택한 {selectedExams.length}개 시험지에 필터칩 작업이 일괄 반영됩니다.
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
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-black shadow-md shadow-violet-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
              <span>{isApplying ? '필터칩 적용 중...' : '일괄 적용'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
