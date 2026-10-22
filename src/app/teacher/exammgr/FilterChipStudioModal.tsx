'use client';

import React, { useState } from 'react';
import { 
  ExamFilterChip, 
  FilterChipColor, 
  FilterChipEffect 
} from '@/app/api/test2/filter-chips/route';
import FilterChipBadge, { 
  CHIP_COLOR_MAP, 
  CHIP_EFFECT_OPTIONS 
} from './FilterChipBadge';
import { 
  Sparkles, 
  Check, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Edit3, 
  Plus, 
  Loader2, 
  Palette, 
  AlertCircle 
} from 'lucide-react';

interface FilterChipStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  chips: ExamFilterChip[];
  onChipsUpdated: (newChips: ExamFilterChip[]) => void;
  onExamListRefresh?: () => void;
}

const PRESET_ICONS = ['📝', '🎯', '⚡', '🔥', '💡', '🏆', '⭐', '📌', '📚', '🧪', '🔔', '✨'];

export default function FilterChipStudioModal({
  isOpen,
  onClose,
  chips,
  onChipsUpdated,
  onExamListRefresh,
}: FilterChipStudioModalProps) {
  const [editingChipId, setEditingChipId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [selectedColor, setSelectedColor] = useState<FilterChipColor>('violet');
  const [selectedEffect, setSelectedEffect] = useState<FilterChipEffect>('glow');
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  if (!isOpen) return null;

  // 폼 초기화 (새로 만들기 모드로)
  const resetForm = () => {
    setEditingChipId(null);
    setName('');
    setSelectedIcon('🎯');
    setSelectedColor('violet');
    setSelectedEffect('glow');
  };

  // 특정 칩 수정 모드로 진입
  const handleStartEdit = (chip: ExamFilterChip) => {
    setEditingChipId(chip.id);
    setName(chip.name);
    setSelectedIcon(chip.icon || '🎯');
    setSelectedColor(chip.color || 'violet');
    setSelectedEffect(chip.effect || 'clean');
  };

  // 임시 프리뷰용 칩 객체
  const previewChip: ExamFilterChip = {
    id: editingChipId || 'preview_id',
    name: name.trim() || '미리보기 텍스트',
    icon: selectedIcon,
    color: selectedColor,
    effect: selectedEffect,
    order: 999,
    created_at: new Date().toISOString(),
  };

  // 저장 (생성 또는 수정)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('필터칩 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      if (editingChipId) {
        // 수정
        const res = await fetch('/api/test2/filter-chips', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chip: {
              id: editingChipId,
              name: name.trim(),
              icon: selectedIcon,
              color: selectedColor,
              effect: selectedEffect,
            },
          }),
        });
        const data = await res.json();
        if (data.success && data.chips) {
          onChipsUpdated(data.chips);
          resetForm();
        } else {
          alert(`수정 실패: ${data.error || '오류 발생'}`);
        }
      } else {
        // 생성
        const res = await fetch('/api/test2/filter-chips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            icon: selectedIcon,
            color: selectedColor,
            effect: selectedEffect,
          }),
        });
        const data = await res.json();
        if (data.success && data.chips) {
          onChipsUpdated(data.chips);
          resetForm();
        } else {
          alert(`생성 실패: ${data.error || '오류 발생'}`);
        }
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 삭제 (⚠️ 시험지는 절대 삭제되지 않음! 확인 알림 명확히 제공)
  const handleDelete = async (chip: ExamFilterChip) => {
    const confirmMsg = `'${chip.name}' 필터칩을 삭제하시겠습니까?\n\n🛡️ [안전 안내]\n시험지는 절대 삭제되지 않으며, 시험지에 부여된 해당 필터 태그만 안전하게 해제됩니다.`;
    if (!confirm(confirmMsg)) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/test2/filter-chips?id=${chip.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success && data.chips) {
        onChipsUpdated(data.chips);
        if (editingChipId === chip.id) resetForm();
        if (onExamListRefresh) onExamListRefresh();
      } else {
        alert(`삭제 실패: ${data.error || '오류 발생'}`);
      }
    } catch (err: any) {
      alert(`오류: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 순서 이동 (위로/아래로)
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chips.length) return;

    const newChips = [...chips];
    const temp = newChips[index];
    newChips[index] = newChips[targetIndex];
    newChips[targetIndex] = temp;

    // order 재배정
    const reorderedChips = newChips.map((c, idx) => ({ ...c, order: idx + 1 }));
    onChipsUpdated(reorderedChips);

    try {
      setReordering(true);
      await fetch('/api/test2/filter-chips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chips: reorderedChips }),
      });
    } catch (err) {
      console.error('Failed to save reordered chips:', err);
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 border border-slate-100 max-h-[92vh] flex flex-col">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shadow-2xs">
              <Palette size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                필터칩 커스텀 스튜디오
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                시험지 분류에 사용할 나만의 맞춤 필터칩을 추가하고 색상과 효과를 설정하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 모달 본문 스크롤 영역 */}
        <div className="space-y-6 overflow-y-auto pr-1 flex-1">
          {/* 1. 필터칩 생성/수정 폼 */}
          <form onSubmit={handleSubmit} className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Sparkles size={13} className="text-indigo-600" />
                <span>{editingChipId ? '필터칩 수정하기' : '새 필터칩 추가'}</span>
              </span>
              {editingChipId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-700 underline cursor-pointer"
                >
                  수정 취소하고 새로 만들기
                </button>
              )}
            </div>

            {/* 이름 및 아이콘 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-black text-slate-600 block">필터칩 이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 2학기 지필대비, 주간테스트, 킬러특강 등"
                  maxLength={20}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-600 text-xs font-bold text-slate-900 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-600 block">아이콘 (선택)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={selectedIcon}
                    onChange={(e) => setSelectedIcon(e.target.value)}
                    placeholder="이모지"
                    maxLength={2}
                    className="w-14 text-center py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-600 text-sm font-bold"
                  />
                  <div className="flex-1 flex gap-1 overflow-x-auto py-1 scrollbar-none">
                    {PRESET_ICONS.slice(0, 5).map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setSelectedIcon(icon)}
                        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all ${
                          selectedIcon === icon ? 'bg-indigo-600 text-white scale-110 shadow-2xs' : 'bg-white hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 12종 컬러 팔레트 선택 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-600 block">테마 컬러 (12종)</label>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {(Object.keys(CHIP_COLOR_MAP) as FilterChipColor[]).map((c) => {
                  const item = CHIP_COLOR_MAP[c];
                  const isSelected = selectedColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${item.dotBg} ${
                        isSelected ? 'ring-3 ring-indigo-500 ring-offset-2 scale-110 shadow-sm' : 'opacity-80 hover:opacity-100 hover:scale-105'
                      }`}
                      title={item.label}
                    >
                      {isSelected && <Check size={14} className="text-white drop-shadow-xs" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6종 시각 효과 선택 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-600 block">시각 효과 (Visual Effect)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CHIP_EFFECT_OPTIONS.map((eff) => {
                  const isSelected = selectedEffect === eff.id;
                  return (
                    <button
                      key={eff.id}
                      type="button"
                      onClick={() => setSelectedEffect(eff.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-500 ring-1 ring-indigo-500 shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{eff.icon}</span>
                        <span className={`text-xs font-black ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {eff.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">
                        {eff.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 실시간 라이브 미리보기 & 제출 버튼 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-slate-400 shrink-0">실시간 미리보기:</span>
                <FilterChipBadge chip={previewChip} size="md" count={3} />
              </div>

              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <>
                    {editingChipId ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
                    <span>{editingChipId ? '필터칩 수정 완료' : '새 필터칩 등록'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* 2. 등록된 필터칩 관리 목록 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <span>등록된 필터칩 목록 ({chips.length}개)</span>
                {reordering && <span className="text-[10px] text-indigo-500 font-bold animate-pulse">순서 저장 중...</span>}
              </h4>
              <span className="text-[11px] text-slate-400 font-medium">
                ▲/▼ 버튼으로 순서를 변경할 수 있습니다
              </span>
            </div>

            {chips.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl bg-slate-50">
                등록된 필터칩이 없습니다. 위 폼에서 첫 필터칩을 만들어보세요!
              </div>
            ) : (
              <div className="space-y-2">
                {chips.map((chip, idx) => (
                  <div
                    key={chip.id}
                    className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-black text-slate-400 w-4 text-center shrink-0">{idx + 1}</span>
                      <FilterChipBadge chip={chip} size="sm" />
                      {chip.isSystem && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold shrink-0">
                          기본 칩
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* 순서 올리기/내리기 */}
                      <button
                        type="button"
                        disabled={idx === 0 || reordering}
                        onClick={() => handleMove(idx, 'up')}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="위로 이동"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === chips.length - 1 || reordering}
                        onClick={() => handleMove(idx, 'down')}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="아래로 이동"
                      >
                        <ArrowDown size={13} />
                      </button>

                      {/* 수정 */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(chip)}
                        className="px-2 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1"
                        title="수정"
                      >
                        <Edit3 size={11} />
                        <span>수정</span>
                      </button>

                      {/* 삭제 */}
                      <button
                        type="button"
                        onClick={() => handleDelete(chip)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                        title="삭제 (시험지는 안전 보존)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 안전 안내 배너 */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>🛡️ [안전 안내]:</strong> 필터칩을 삭제하더라도 <strong>시험지와 시험 문제, 배정 기록은 절대 삭제되지 않습니다</strong>. 오직 시험지에 달린 해당 필터칩 태그만 깔끔하게 제거되므로 안심하고 관리하셔도 좋습니다.
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
