'use client';

import React, { useState } from 'react';
import { ExamFilterChip, FilterPreset } from '@/app/api/test2/filter-chips/route';
import FilterChipBadge from './FilterChipBadge';
import { 
  Star, 
  Sparkles, 
  Check, 
  Trash2, 
  Edit2, 
  X, 
  Loader2, 
  Layers, 
  BookmarkCheck,
  AlertCircle
} from 'lucide-react';

interface FilterPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'save' | 'manage'; // 'save': 현재 조합 저장, 'manage': 즐겨찾기 목록 관리
  allChips: ExamFilterChip[];
  selectedChipIds: string[];
  matchMode: 'AND' | 'OR';
  presets: FilterPreset[];
  onPresetsUpdated: (newPresets: FilterPreset[]) => void;
  onApplyPreset?: (preset: FilterPreset) => void;
}

export default function FilterPresetModal({
  isOpen,
  onClose,
  mode,
  allChips,
  selectedChipIds,
  matchMode,
  presets,
  onPresetsUpdated,
  onApplyPreset,
}: FilterPresetModalProps) {
  // 저장 모드 상태
  const [presetName, setPresetName] = useState(() => {
    // 기본 이름 자동 생성 (선택된 칩 이름들의 조합)
    const names = selectedChipIds
      .map(id => allChips.find(c => c.id === id)?.name)
      .filter(Boolean);
    return names.length > 0 ? names.join(' + ') : '';
  });
  const [saving, setSaving] = useState(false);

  // 관리 모드 상태: 수정 중인 프리셋 ID 및 수정 이름
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  const selectedChips = selectedChipIds
    .map(id => allChips.find(c => c.id === id))
    .filter((c): c is ExamFilterChip => c !== undefined);

  // 1. 현재 조합 새 즐겨찾기로 저장
  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) {
      alert('즐겨찾기 이름을 입력해주세요.');
      return;
    }
    if (selectedChipIds.length === 0) {
      alert('즐겨찾기에 포함할 필터칩이 선택되지 않았습니다.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/test2/filter-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          type: 'preset',
          name: presetName.trim(),
          chip_ids: selectedChipIds,
          match_mode: matchMode,
        }),
      });
      const data = await res.json();
      if (data.success && data.presets) {
        onPresetsUpdated(data.presets);
        onClose();
      } else {
        alert(`즐겨찾기 저장 실패: ${data.error || '오류 발생'}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 2. 즐겨찾기 이름 수정
  const handleUpdatePresetName = async (preset: FilterPreset) => {
    if (!editingName.trim()) {
      alert('수정할 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/test2/filter-chips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          type: 'preset',
          preset: {
            id: preset.id,
            name: editingName.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.presets) {
        onPresetsUpdated(data.presets);
        setEditingPresetId(null);
      } else {
        alert(`수정 실패: ${data.error || '오류 발생'}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 3. 즐겨찾기 삭제
  const handleDeletePreset = async (preset: FilterPreset) => {
    if (!confirm(`'${preset.name}' 즐겨찾기를 삭제하시겠습니까?`)) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/test2/filter-chips?preset_id=${encodeURIComponent(preset.id)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.presets) {
        onPresetsUpdated(data.presets);
      } else {
        alert(`삭제 실패: ${data.error || '오류 발생'}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 border border-slate-100 max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <Star size={20} className="fill-amber-400 text-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                {mode === 'save' ? '⭐ 현재 필터 조합 즐겨찾기 저장' : '⭐ 필터 조합 즐겨찾기 관리'}
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {mode === 'save'
                  ? '자주 쓰는 필터 조합을 즐겨찾기로 등록하여 원클릭으로 빠르게 불러오세요.'
                  : '등록된 즐겨찾기 필터 조합을 관리하고 이름을 수정하거나 삭제할 수 있습니다.'}
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

        {/* 🌟 1) 저장 모드 UI */}
        {mode === 'save' ? (
          <form onSubmit={handleSavePreset} className="space-y-5 overflow-y-auto pr-1 flex-1">
            {/* 현재 조합 미리보기 */}
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                  <BookmarkCheck size={14} className="text-amber-600" />
                  <span>즐겨찾기에 저장될 필터 조합 ({selectedChips.length}개)</span>
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-amber-700 border border-amber-200 shadow-2xs">
                  {matchMode === 'AND' ? '🎯 모두 포함 (AND)' : '📚 하나라도 포함 (OR)'}
                </span>
              </div>

              {selectedChips.length === 0 ? (
                <div className="text-xs text-amber-700/80 font-medium py-2 text-center">
                  선택된 필터칩이 없습니다. 먼저 칩을 1개 이상 선택해주세요!
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedChips.map(chip => (
                    <FilterChipBadge key={chip.id} chip={chip} size="sm" isActive={true} />
                  ))}
                </div>
              )}
            </div>

            {/* 즐겨찾기 이름 입력창 */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 block">
                즐겨찾기 이름 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="예: 2학기 기말 오답모음, 킬러특강+단일 등"
                maxLength={25}
                required
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition-all placeholder:text-slate-300 shadow-2xs"
              />
              <p className="text-[11px] text-slate-400 font-medium pl-1">
                직관적이고 기억하기 쉬운 이름을 지어주세요 (최대 25자).
              </p>
            </div>

            {/* 하단 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving || selectedChips.length === 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <>
                    <Star size={13} className="fill-white" />
                    <span>즐겨찾기 등록 완료</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* 🌟 2) 관리 모드 UI (등록된 프리셋 목록 & 수정 & 삭제) */
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {presets.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Star size={36} className="mx-auto text-slate-200" />
                <p className="text-xs font-bold text-slate-500">등록된 즐겨찾기 필터 조합이 없습니다.</p>
                <p className="text-[11px] text-slate-400">
                  필터바에서 원하는 필터칩들을 누른 뒤 <b>[⭐ 즐겨찾기 저장]</b>을 눌러보세요!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {presets.map((preset) => {
                  const isEditing = editingPresetId === preset.id;
                  const presetChips = preset.chip_ids
                    .map(id => allChips.find(c => c.id === id))
                    .filter((c): c is ExamFilterChip => c !== undefined);

                  return (
                    <div
                      key={preset.id}
                      className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5 hover:border-slate-300 transition-colors"
                    >
                      {/* 프리셋 이름 & 액션 */}
                      <div className="flex items-center justify-between gap-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="text-xs font-bold text-slate-800 bg-white border border-amber-400 rounded-lg px-2.5 py-1 flex-1 focus:outline-hidden"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdatePresetName(preset)}
                              disabled={saving}
                              className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                              title="확인"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPresetId(null)}
                              className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                              title="취소"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-amber-500 shrink-0">⭐</span>
                            <span className="text-xs font-black text-slate-800 truncate">
                              {preset.name}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 shrink-0">
                              {preset.match_mode === 'AND' ? '모두 포함' : '하나라도 포함'}
                            </span>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            {onApplyPreset && (
                              <button
                                type="button"
                                onClick={() => {
                                  onApplyPreset(preset);
                                  onClose();
                                }}
                                className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                              >
                                적용
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPresetId(preset.id);
                                setEditingName(preset.name);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                              title="이름 수정"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePreset(preset)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 포함된 필터칩들 */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {presetChips.length === 0 ? (
                          <span className="text-[10px] text-slate-400 font-medium">
                            (포함된 칩이 삭제되었습니다)
                          </span>
                        ) : (
                          presetChips.map(chip => (
                            <FilterChipBadge key={chip.id} chip={chip} size="sm" isActive={true} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
