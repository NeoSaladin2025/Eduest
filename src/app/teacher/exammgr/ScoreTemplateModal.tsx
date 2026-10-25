'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderKanban, 
  BookmarkPlus, 
  Sparkles, 
  Check, 
  X, 
  Edit2, 
  Trash2, 
  RotateCcw, 
  Layers, 
  AlertCircle,
  FileText,
  ChevronRight
} from 'lucide-react';
import { 
  ScoreTemplate, 
  DEFAULT_SCORE_PRESETS, 
  getStoredScoreTemplates, 
  saveStoredScoreTemplates 
} from './scoreTemplateTypes';

interface ScoreTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuestionCount: number;
  currentPoints: number[];
  onApplyTemplate: (points: number[], templateName: string) => void;
}

export default function ScoreTemplateModal({
  isOpen,
  onClose,
  currentQuestionCount,
  currentPoints,
  onApplyTemplate,
}: ScoreTemplateModalProps) {
  const [templates, setTemplates] = useState<ScoreTemplate[]>([]);

  // 신규 등록 모달 상태
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');

  // 수정 모달 상태
  const [editingTemplate, setEditingTemplate] = useState<ScoreTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState('');
  const [editTemplateDesc, setEditTemplateDesc] = useState('');
  const [shouldOverwriteWithCurrent, setShouldOverwriteWithCurrent] = useState(false);

  // 현재 배점 총점 계산
  const currentTotalPoints = useMemo(() => {
    const sum10 = currentPoints.reduce((acc, p) => acc + Math.round((Number(p) || 0) * 10), 0);
    return Math.round(sum10) / 10;
  }, [currentPoints]);

  // 템플릿 로드
  useEffect(() => {
    if (isOpen) {
      setTemplates(getStoredScoreTemplates());
      setIsCreateModalOpen(false);
      setEditingTemplate(null);
    }
  }, [isOpen]);

  // 템플릿 저장 헬퍼
  const updateAndSaveTemplates = (newTemplates: ScoreTemplate[]) => {
    setTemplates(newTemplates);
    saveStoredScoreTemplates(newTemplates);
  };

  // 문항수 일치 템플릿과 기타 템플릿 분리
  const { matchingTemplates, otherTemplates } = useMemo(() => {
    const matching: ScoreTemplate[] = [];
    const others: ScoreTemplate[] = [];

    templates.forEach((t) => {
      if (t.total_questions === currentQuestionCount) {
        matching.push(t);
      } else {
        others.push(t);
      }
    });

    return { matchingTemplates: matching, otherTemplates: others };
  }, [templates, currentQuestionCount]);

  // 템플릿 적용 실행
  const handleSelectTemplate = (template: ScoreTemplate) => {
    const tCount = template.total_questions;
    const qCount = currentQuestionCount;

    if (tCount === qCount) {
      onApplyTemplate(template.points, template.name);
      onClose();
      return;
    }

    if (tCount > qCount) {
      const ok = confirm(
        `선택하신 '${template.name}' 템플릿은 ${tCount}문항용이며, 현재 시험지는 ${qCount}문항입니다.\n앞쪽 1~${qCount}번까지만 템플릿 배점을 적용하시겠습니까?`
      );
      if (ok) {
        onApplyTemplate(template.points.slice(0, qCount), template.name);
        onClose();
      }
      return;
    }

    if (tCount < qCount) {
      const ok = confirm(
        `선택하신 '${template.name}' 템플릿은 ${tCount}문항용이며, 현재 시험지는 ${qCount}문항입니다.\n1~${tCount}번까지는 템플릿 배점을 적용하고, 나머지 ${tCount + 1}~${qCount}번은 기존 배점을 유지하시겠습니까?`
      );
      if (ok) {
        const merged = [...template.points, ...currentPoints.slice(tCount)];
        onApplyTemplate(merged, template.name);
        onClose();
      }
      return;
    }
  };

  // 신규 템플릿 저장
  const handleSaveNewTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      alert('템플릿 명칭을 입력해 주세요.');
      return;
    }

    const newTemplate: ScoreTemplate = {
      id: `custom-${Date.now()}`,
      name: newTemplateName.trim(),
      total_questions: currentQuestionCount,
      total_points: currentTotalPoints,
      points: [...currentPoints],
      description: newTemplateDesc.trim() || undefined,
      is_preset: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    updateAndSaveTemplates([newTemplate, ...templates]);
    setIsCreateModalOpen(false);
    setNewTemplateName('');
    setNewTemplateDesc('');
    alert(`✓ '${newTemplate.name}' 템플릿이 저장되었습니다!`);
  };

  // 템플릿 수정 열기
  const handleOpenEdit = (t: ScoreTemplate) => {
    setEditingTemplate(t);
    setEditTemplateName(t.name);
    setEditTemplateDesc(t.description || '');
    setShouldOverwriteWithCurrent(false);
  };

  // 템플릿 수정 저장
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editTemplateName.trim()) {
      alert('템플릿 명칭을 입력해 주세요.');
      return;
    }

    const updated = templates.map((t) => {
      if (t.id !== editingTemplate.id) return t;

      const shouldOverwrite = shouldOverwriteWithCurrent && currentQuestionCount === t.total_questions;
      return {
        ...t,
        name: editTemplateName.trim(),
        description: editTemplateDesc.trim() || undefined,
        points: shouldOverwrite ? [...currentPoints] : t.points,
        total_points: shouldOverwrite ? currentTotalPoints : t.total_points,
        updated_at: new Date().toISOString(),
      };
    });

    updateAndSaveTemplates(updated);
    setEditingTemplate(null);
    alert('✓ 템플릿 정보가 수정되었습니다.');
  };

  // 템플릿 삭제
  const handleDeleteTemplate = (id: string, name: string) => {
    if (!confirm(`'${name}' 템플릿을 삭제하시겠습니까?`)) return;
    const filtered = templates.filter((t) => t.id !== id);
    updateAndSaveTemplates(filtered);
  };

  // 기본 프리셋 복원
  const handleResetPresets = () => {
    if (!confirm('기본 표준 프리셋(수능, 내신 20/22문항 등)을 복원하시겠습니까?\n(선생님이 추가하신 커스텀 템플릿은 유지됩니다)')) {
      return;
    }
    const currentCustom = templates.filter((t) => !t.is_preset);
    const combined = [...DEFAULT_SCORE_PRESETS, ...currentCustom];
    updateAndSaveTemplates(combined);
    alert('✓ 기본 표준 프리셋이 복원되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* 모달 헤더 */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 shadow-2xs">
              <FolderKanban size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>배점 템플릿 보관함</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 font-bold border border-violet-200">
                  총 {templates.length}개
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>현재 시험지: <strong className="text-violet-700 font-black">{currentQuestionCount}문항</strong></span>
                <span>•</span>
                <span>현재 배점 합계: <strong className="text-slate-800 font-mono font-black">{currentTotalPoints.toFixed(1)}점</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* 상단 액션 바 */}
        <div className="p-4 bg-gradient-to-r from-violet-50/50 via-white to-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setNewTemplateName(`새 배점 템플릿 (${currentQuestionCount}문항)`);
              setNewTemplateDesc('');
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-violet-200 cursor-pointer"
          >
            <BookmarkPlus size={15} />
            <span>➕ 현재 시험지 배점으로 새 템플릿 등록</span>
          </button>

          <button
            type="button"
            onClick={handleResetPresets}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="삭제된 기본 프리셋을 다시 가져옵니다"
          >
            <RotateCcw size={12} />
            <span>기본 프리셋 복원</span>
          </button>
        </div>

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. 현재 시험지 문항 수 일치 템플릿 섹션 */}
          {matchingTemplates.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50/80 px-3 py-1.5 rounded-xl border border-emerald-200 w-fit">
                <Sparkles size={14} className="text-emerald-600" />
                <span>✨ 현재 시험지({currentQuestionCount}문항)와 딱 맞는 추천 템플릿</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {matchingTemplates.map((t) => renderTemplateCard(t, true))}
              </div>
            </div>
          )}

          {/* 2. 기타 템플릿 섹션 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
              <span>🗂️ 전체 템플릿 목록 ({otherTemplates.length + (matchingTemplates.length === 0 ? 0 : 0)}개)</span>
              {matchingTemplates.length === 0 && (
                <span className="text-[11px] text-amber-600">
                  ※ 현재 시험지({currentQuestionCount}문항)와 문항수가 일치하는 템플릿이 없습니다.
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(matchingTemplates.length === 0 ? templates : otherTemplates).map((t) =>
                renderTemplateCard(t, false)
              )}
            </div>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 font-medium">
            💡 템플릿의 <strong>[⚡ 딸깍 적용]</strong>을 누르면 전체 문항에 정해진 배점이 1초 만에 배정됩니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 text-white text-xs font-black hover:bg-slate-900 transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          서브모달 1: 현재 시험지 배점으로 새 템플릿 등록
      ───────────────────────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveNewTemplate}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BookmarkPlus size={18} className="text-violet-600" />
                <span>새 배점 템플릿 저장</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            {/* 기본 정보 요약 박스 */}
            <div className="p-3 rounded-2xl bg-violet-50/70 border border-violet-100 flex items-center justify-around text-center text-xs">
              <div>
                <div className="text-slate-500 font-bold mb-0.5">문항 수</div>
                <div className="text-base font-black text-violet-900 font-mono">{currentQuestionCount}문항</div>
              </div>
              <div className="w-px h-8 bg-violet-200" />
              <div>
                <div className="text-slate-500 font-bold mb-0.5">배점 합계</div>
                <div className="text-base font-black text-violet-900 font-mono">{currentTotalPoints.toFixed(1)}점</div>
              </div>
            </div>

            {/* 입력 폼 */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  템플릿 명칭 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="예: 2026 고1 1학기 중간고사 표준 배점"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  설명 / 메모 (선택)
                </label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="예: 객관식 16문항 4점 + 서술형 4문항 9점"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* 배점 미리보기 */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">문항별 배점 미리보기</div>
                <div className="max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-1.5 text-[10px] font-mono">
                  {currentPoints.map((pt, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-white border border-slate-200 font-bold text-slate-700">
                      {i + 1}번: {pt.toFixed(1)}점
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md shadow-violet-200 cursor-pointer"
              >
                저장하기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          서브모달 2: 템플릿 수정
      ───────────────────────────────────────────────────────────── */}
      {editingTemplate && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 size={18} className="text-violet-600" />
                <span>템플릿 정보 수정</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  템플릿 명칭 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  설명 / 메모
                </label>
                <input
                  type="text"
                  value={editTemplateDesc}
                  onChange={(e) => setEditTemplateDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* 현재 시험지의 배점으로 덮어쓰기 옵션 */}
              {currentQuestionCount === editingTemplate.total_questions && (
                <div className="p-3 rounded-2xl bg-violet-50 border border-violet-200 flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="overwriteScores"
                    checked={shouldOverwriteWithCurrent}
                    onChange={(e) => setShouldOverwriteWithCurrent(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <label htmlFor="overwriteScores" className="text-xs font-bold text-violet-900 cursor-pointer">
                    현재 시험지의 배점({currentTotalPoints.toFixed(1)}점)으로 이 템플릿 점수를 덮어쓰기
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md shadow-violet-200 cursor-pointer"
              >
                수정 완료
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );

  // 템플릿 카드 렌더링 함수
  function renderTemplateCard(t: ScoreTemplate, isHighlightedMatch: boolean) {
    const isExactMatch = t.total_questions === currentQuestionCount;
    // 배점 요약 텍스트 생성 (예: "4.0점(16개), 9.0점(4개)")
    const pointFreq: Record<string, number> = {};
    t.points.forEach((p) => {
      const key = `${p.toFixed(1)}점`;
      pointFreq[key] = (pointFreq[key] || 0) + 1;
    });
    const pointSummary = Object.entries(pointFreq)
      .map(([k, count]) => `${k}(${count}문항)`)
      .join(', ');

    return (
      <div
        key={t.id}
        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isHighlightedMatch
            ? 'bg-gradient-to-r from-emerald-50/40 via-white to-violet-50/30 border-emerald-300 ring-2 ring-emerald-200/60 shadow-xs'
            : isExactMatch
            ? 'bg-white border-violet-200 hover:border-violet-300 shadow-2xs'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              isExactMatch
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {t.total_questions}문항
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
              총점 {t.total_points.toFixed(1)}점
            </span>
            {t.is_preset && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                기본 프리셋
              </span>
            )}
            {isHighlightedMatch && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                <Sparkles size={10} />
                추천 일치
              </span>
            )}
          </div>

          <h4 className="text-sm font-black text-slate-900 truncate">
            {t.name}
          </h4>

          <p className="text-xs text-slate-500 font-medium truncate">
            {t.description || pointSummary}
          </p>
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => handleSelectTemplate(t)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              isExactMatch
                ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200 scale-102'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="이 템플릿의 배점을 시험지 전체 문항에 적용합니다"
          >
            <span>⚡ 딸깍 적용</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenEdit(t)}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            title="템플릿 수정"
          >
            <Edit2 size={13} />
          </button>

          <button
            type="button"
            onClick={() => handleDeleteTemplate(t.id, t.name)}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
            title="템플릿 삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }
}
