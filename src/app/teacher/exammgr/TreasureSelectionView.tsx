'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  BookOpen,
  Maximize2,
  Plus,
  Edit3,
  Trash2,
  RotateCcw,
  Link2,
  AlertTriangle,
  Check,
  Filter,
  Layers,
} from 'lucide-react';
import { ExamQuestion } from '@/app/api/test2/exam/route';
import {
  TreasureQuestionCumulativeStat,
  TreasureSelectionRule,
  TreasureSelectionRuleMode,
  TreasureSelectionScope,
  TreasureSelectionTemplate,
  TreasureTemplate,
} from './treasureTypes';

interface TreasureSelectionViewProps {
  stats: TreasureQuestionCumulativeStat<ExamQuestion>[];
  scope: TreasureSelectionScope;
  onChangeScope: (next: TreasureSelectionScope) => void;
  targetExamTitle: string;
  hasMultipleChainExams: boolean;

  templates: TreasureSelectionTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (tpl: TreasureSelectionTemplate) => void;
  onSaveTemplate: (tpl: TreasureSelectionTemplate, isNew: boolean) => void;
  onDeleteTemplate: (id: string) => void;
  onResetTemplates: () => void;

  generationTemplates: TreasureTemplate[];
  selectedIds: Set<string>;
  onToggleQuestion: (questionId: string) => void;
  onSetSelectedIds: (next: Set<string>) => void;

  isExpandedLayout: boolean;
  isCreatingWrongExam: boolean;
  onCreateFromSelected: () => void;
  onOpenHelpModal: () => void;
  onOpenSolutionModal?: (solutionDriveId: string) => void;
  onPreviewQuestion?: (question: ExamQuestion) => void;
}

type SortOption = 'accuracy_asc' | 'number_asc' | 'wrong_desc';

const EMPTY_RULE: TreasureSelectionRule = {
  mode: 'accuracy_below',
  maxAccuracyPercent: 50,
  minWrongCount: 1,
  excludeConsecutiveCorrect: 0,
  includeSlowQuestions: false,
  excludeAlreadyAssigned: true,
  onlyAttempted: true,
};

function describeRule(rule: TreasureSelectionRule): string {
  const parts: string[] = [];
  if (rule.mode === 'accuracy_below') {
    parts.push(`정답률 ${rule.maxAccuracyPercent ?? 50}% 이하`);
  } else if (rule.mode === 'wrong_count_min') {
    parts.push(`오답 ${rule.minWrongCount ?? 2}회 이상`);
  } else if (rule.mode === 'any_wrong') {
    parts.push('1번이라도 오답');
  } else if (rule.mode === 'latest_wrong') {
    parts.push('직전 바퀴 오답');
  }
  if (rule.excludeConsecutiveCorrect && rule.excludeConsecutiveCorrect > 0) {
    parts.push(`최근 ${rule.excludeConsecutiveCorrect}연속 정답 제외`);
  }
  if (rule.includeSlowQuestions) {
    parts.push('시간 지체 포함');
  }
  if (rule.excludeAlreadyAssigned) {
    parts.push('기 배정 중복 제외');
  }
  return parts.join(' · ');
}

export default function TreasureSelectionView({
  stats,
  scope,
  onChangeScope,
  targetExamTitle,
  hasMultipleChainExams,
  templates,
  activeTemplateId,
  onSelectTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onResetTemplates,
  generationTemplates,
  selectedIds,
  onToggleQuestion,
  onSetSelectedIds,
  isExpandedLayout,
  isCreatingWrongExam,
  onCreateFromSelected,
  onOpenHelpModal,
  onOpenSolutionModal,
  onPreviewQuestion,
}: TreasureSelectionViewProps) {
  const [showUnattempted, setShowUnattempted] = useState(false);
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('accuracy_asc');

  // 템플릿 편집/추가 폼 상태
  const [editorMode, setEditorMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [draftId, setDraftId] = useState<string>('');
  const [draftName, setDraftName] = useState<string>('');
  const [draftBadge, setDraftBadge] = useState<string>('🎯');
  const [draftDesc, setDraftDesc] = useState<string>('');
  const [draftRule, setDraftRule] = useState<TreasureSelectionRule>(EMPTY_RULE);
  const [draftLinkGen, setDraftLinkGen] = useState<boolean>(false);
  const [draftLinkedGenId, setDraftLinkedGenId] = useState<string>(
    generationTemplates[0]?.id || 'tpl_standard'
  );

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId]
  );

  const openCreateEditor = () => {
    setEditorMode('create');
    setDraftId(`sel_tpl_custom_${Date.now()}`);
    setDraftName('');
    setDraftBadge('✨');
    setDraftDesc('');
    setDraftRule(activeTemplate ? { ...activeTemplate.rule } : { ...EMPTY_RULE });
    setDraftLinkGen(false);
    setDraftLinkedGenId(generationTemplates[0]?.id || 'tpl_standard');
  };

  const openEditEditor = () => {
    if (!activeTemplate) return;
    setEditorMode('edit');
    setDraftId(activeTemplate.id);
    setDraftName(activeTemplate.name);
    setDraftBadge(activeTemplate.badge || '🎯');
    setDraftDesc(activeTemplate.description || '');
    setDraftRule({ ...activeTemplate.rule });
    setDraftLinkGen(Boolean(activeTemplate.linkGenerationTemplate));
    setDraftLinkedGenId(
      activeTemplate.linkedTreasureTemplateId || generationTemplates[0]?.id || 'tpl_standard'
    );
  };

  const handleSaveEditor = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      alert('템플릿 이름을 입력해 주세요!');
      return;
    }
    const nextTpl: TreasureSelectionTemplate = {
      id: draftId,
      name: trimmed,
      badge: draftBadge.trim() || '🎯',
      description: draftDesc.trim() || describeRule(draftRule),
      rule: { ...draftRule },
      linkGenerationTemplate: draftLinkGen,
      linkedTreasureTemplateId: draftLinkGen ? draftLinkedGenId : undefined,
      is_default: editorMode === 'edit' ? activeTemplate?.is_default : false,
    };
    onSaveTemplate(nextTpl, editorMode === 'create');
    setEditorMode('closed');
  };

  const handleToggleQuickLink = (checked: boolean) => {
    if (!activeTemplate) return;
    const updated: TreasureSelectionTemplate = {
      ...activeTemplate,
      linkGenerationTemplate: checked,
      linkedTreasureTemplateId: checked
        ? activeTemplate.linkedTreasureTemplateId || generationTemplates[0]?.id || 'tpl_standard'
        : undefined,
    };
    onSaveTemplate(updated, false);
  };

  const handleChangeQuickLinkedGen = (genId: string) => {
    if (!activeTemplate) return;
    const updated: TreasureSelectionTemplate = {
      ...activeTemplate,
      linkGenerationTemplate: true,
      linkedTreasureTemplateId: genId,
    };
    onSaveTemplate(updated, false);
  };

  const summaryCounts = useMemo(() => {
    const attempted = stats.filter((s) => s.attemptCount > 0).length;
    const unattempted = stats.length - attempted;
    const alreadyAssigned = stats.filter((s) => s.isAlreadyAssignedInNext).length;
    return { total: stats.length, attempted, unattempted, alreadyAssigned };
  }, [stats]);

  const displayedStats = useMemo(() => {
    let list = [...stats];
    if (!showUnattempted) {
      list = list.filter((s) => s.attemptCount > 0);
    }
    if (onlySelectedFilter) {
      list = list.filter((s) => selectedIds.has(s.question.id));
    }

    list.sort((a, b) => {
      if (sortOption === 'number_asc') {
        return a.displayNumber - b.displayNumber;
      }
      if (sortOption === 'wrong_desc') {
        if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
        return a.displayNumber - b.displayNumber;
      }
      // accuracy_asc: 응시한 문항 중 정답률 낮은 순 -> 미응시는 맨 뒤
      const accA = a.accuracyPercent === null ? 999 : a.accuracyPercent;
      const accB = b.accuracyPercent === null ? 999 : b.accuracyPercent;
      if (accA !== accB) return accA - accB;
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return a.displayNumber - b.displayNumber;
    });

    return list;
  }, [stats, showUnattempted, onlySelectedFilter, selectedIds, sortOption]);

  const linkedGenTemplate = useMemo(() => {
    if (!activeTemplate?.linkGenerationTemplate || !activeTemplate?.linkedTreasureTemplateId) {
      return null;
    }
    return generationTemplates.find((g) => g.id === activeTemplate.linkedTreasureTemplateId) || null;
  }, [activeTemplate, generationTemplates]);

  return (
    <div className="space-y-4">
      {/* 1. 상단 안내 & 집계 범위 / 필터 바 */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <span>🎯 문항별 누적 정복 성적 & 다음 보물회수 선별</span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                중복 없는 문항 단위 집계
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              대상 시험지: <strong className="text-slate-700">{targetExamTitle}</strong> · 총{' '}
              <strong>{summaryCounts.total}문항</strong> (응시 {summaryCounts.attempted} / 미응시 {summaryCounts.unattempted})
            </p>
          </div>

          {/* 집계 범위 토글 (현재 보물회수만 vs 전체 체인 합산) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => onChangeScope('current_exam')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                  scope === 'current_exam'
                    ? 'bg-white text-violet-700 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                현재 보물회수 바퀴만
              </button>
              <button
                type="button"
                onClick={() => onChangeScope('full_chain')}
                disabled={!hasMultipleChainExams}
                title={
                  hasMultipleChainExams
                    ? '원본 시험부터 모든 이전·이후 회차 풀이까지 합산합니다'
                    : '연결된 다른 회차 시험지가 1개뿐입니다'
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  scope === 'full_chain'
                    ? 'bg-violet-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                원본·전체 체인 합산
              </button>
            </div>
          </div>
        </div>

        {/* 2. 원클릭 선별 기준 템플릿 바 */}
        <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-950 flex items-center gap-1">
                <span>⚡</span> 선별 기준 템플릿 (원클릭 자동 체크)
              </span>
              <span className="text-[10px] text-amber-800 bg-white/80 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                버튼 한 번 띡! 누르면 아래 체크박스가 자동 설정됩니다
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={openCreateEditor}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-black flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
              >
                <Plus size={12} />
                <span>추가</span>
              </button>
              {activeTemplate && (
                <button
                  type="button"
                  onClick={openEditEditor}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Edit3 size={12} />
                  <span>수정</span>
                </button>
              )}
              {activeTemplate && templates.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(activeTemplate.id)}
                  className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 size={12} />
                  <span>삭제</span>
                </button>
              )}
              <button
                type="button"
                onClick={onResetTemplates}
                className="px-2 py-1 bg-white/80 hover:bg-white text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="기본 선별 템플릿 4종으로 되돌립니다"
              >
                <RotateCcw size={11} />
                <span>초기화</span>
              </button>
            </div>
          </div>

          {/* 템플릿 칩 버튼 목록 */}
          <div className="flex flex-wrap items-center gap-2">
            {templates.map((tpl) => {
              const isSelected = tpl.id === activeTemplate?.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  title={`${tpl.description || describeRule(tpl.rule)}${
                    tpl.linkGenerationTemplate ? ' (생성 설정 자동 연동 ON)' : ''
                  }`}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm scale-[1.01]'
                      : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400 hover:bg-amber-50'
                  }`}
                >
                  <span>{tpl.badge || '🎯'}</span>
                  <span>{tpl.name}</span>
                  {tpl.linkGenerationTemplate && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-black flex items-center gap-0.5 ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <Link2 size={9} />
                      연동
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 활성 템플릿 규칙 요약 & 독립/연동 빠른 토글 + ? 도움말 버튼 */}
          {activeTemplate && (
            <div className="bg-white/90 rounded-xl border border-amber-200/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-black text-amber-900">적용 조건:</span>
                <span className="font-semibold">{describeRule(activeTemplate.rule)}</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer select-none font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-amber-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={Boolean(activeTemplate.linkGenerationTemplate)}
                    onChange={(e) => handleToggleQuickLink(e.target.checked)}
                    className="rounded text-amber-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <Link2
                    size={12}
                    className={
                      activeTemplate.linkGenerationTemplate ? 'text-amber-600' : 'text-slate-400'
                    }
                  />
                  <span>생성 설정(회차·타임어택) 연동</span>
                </label>

                {activeTemplate.linkGenerationTemplate && (
                  <select
                    value={
                      activeTemplate.linkedTreasureTemplateId ||
                      generationTemplates[0]?.id ||
                      ''
                    }
                    onChange={(e) => handleChangeQuickLinkedGen(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-amber-300 bg-amber-50/70 text-[11px] font-bold text-amber-950 focus:outline-none max-w-[230px]"
                  >
                    {generationTemplates.map((gt) => (
                      <option key={gt.id} value={gt.id}>
                        {gt.name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={onOpenHelpModal}
                  className="w-6 h-6 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-200 flex items-center justify-center font-black text-xs cursor-pointer transition-colors"
                  title="독립 관리 vs 생성 설정 연동 안내 보기 (목업 이미지 포함)"
                >
                  ?
                </button>
              </div>
            </div>
          )}

          {/* 인라인 템플릿 추가/수정 에디터 */}
          {editorMode !== 'closed' && (
            <div className="bg-white rounded-2xl border-2 border-indigo-300 p-4 space-y-3 shadow-sm animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <span>{editorMode === 'create' ? '✨ 새 선별 기준 템플릿 추가' : '✏️ 선택한 템플릿 수정'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setEditorMode('closed')}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  닫기 ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
                <div className="sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">아이콘</label>
                  <input
                    type="text"
                    value={draftBadge}
                    onChange={(e) => setDraftBadge(e.target.value)}
                    maxLength={4}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-center text-xs font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">템플릿 이름</label>
                  <input
                    type="text"
                    placeholder="예: 고난도 40% 이하 집중"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">설명 (선택)</label>
                  <input
                    type="text"
                    placeholder="비워두면 조건 요약이 자동으로 들어갑니다"
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 조건 설정 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 block">기본 추출 기준</label>
                  <select
                    value={draftRule.mode}
                    onChange={(e) =>
                      setDraftRule((prev) => ({
                        ...prev,
                        mode: e.target.value as TreasureSelectionRuleMode,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                  >
                    <option value="accuracy_below">정답률 X% 이하 문항</option>
                    <option value="wrong_count_min">누적 오답 N회 이상 문항</option>
                    <option value="any_wrong">1번이라도 틀린 문항 전부</option>
                    <option value="latest_wrong">가장 마지막 바퀴 오답만</option>
                  </select>

                  {draftRule.mode === 'accuracy_below' && (
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span className="font-bold text-slate-600">기준 정답률:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draftRule.maxAccuracyPercent ?? 50}
                        onChange={(e) =>
                          setDraftRule((prev) => ({
                            ...prev,
                            maxAccuracyPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-16 px-2 py-1 rounded border border-slate-300 text-center font-black bg-white"
                      />
                      <span className="font-bold text-slate-600">% 이하</span>
                    </div>
                  )}

                  {draftRule.mode === 'wrong_count_min' && (
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span className="font-bold text-slate-600">최소 오답 횟수:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={draftRule.minWrongCount ?? 2}
                        onChange={(e) =>
                          setDraftRule((prev) => ({
                            ...prev,
                            minWrongCount: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                        className="w-16 px-2 py-1 rounded border border-slate-300 text-center font-black bg-white"
                      />
                      <span className="font-bold text-slate-600">회 이상</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-[11px] font-bold text-slate-700">
                  <label className="text-[11px] font-black text-slate-700 block">추가 필터 / 중복 방지</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftRule.excludeAlreadyAssigned)}
                      onChange={(e) =>
                        setDraftRule((prev) => ({ ...prev, excludeAlreadyAssigned: e.target.checked }))
                      }
                      className="rounded text-indigo-600 w-3.5 h-3.5"
                    />
                    <span>이미 후속 보물회수에 배정된 문항 제외 (2배 중복 방지)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draftRule.includeSlowQuestions)}
                      onChange={(e) =>
                        setDraftRule((prev) => ({ ...prev, includeSlowQuestions: e.target.checked }))
                      }
                      className="rounded text-indigo-600 w-3.5 h-3.5"
                    />
                    <span>시간 지체(평균 1.5배 초과) 문항도 함께 포함</span>
                  </label>

                  <div className="flex items-center gap-2 pt-0.5">
                    <span>최근 연속 정답 제외:</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={draftRule.excludeConsecutiveCorrect ?? 0}
                      onChange={(e) =>
                        setDraftRule((prev) => ({
                          ...prev,
                          excludeConsecutiveCorrect: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-12 px-1.5 py-0.5 rounded border border-slate-300 text-center font-black bg-white"
                    />
                    <span className="text-slate-500 font-medium">(0=사용안함)</span>
                  </div>
                </div>
              </div>

              {/* 생성 설정 연동 옵션 + ? 도움말 */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-black text-amber-950">
                    <input
                      type="checkbox"
                      checked={draftLinkGen}
                      onChange={(e) => setDraftLinkGen(e.target.checked)}
                      className="rounded text-amber-600 w-4 h-4 cursor-pointer"
                    />
                    <Link2 size={14} className="text-amber-600" />
                    <span>다음 보물회수 생성 설정(회차·타임어택)과 연동하기</span>
                  </label>

                  <button
                    type="button"
                    onClick={onOpenHelpModal}
                    className="px-2 py-0.5 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle size={11} />
                    <span>연동이란? (목업 보기)</span>
                  </button>
                </div>

                {draftLinkGen && (
                  <select
                    value={draftLinkedGenId}
                    onChange={(e) => setDraftLinkedGenId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold text-slate-800"
                  >
                    {generationTemplates.map((gt) => (
                      <option key={gt.id} value={gt.id}>
                        {gt.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditorMode('closed')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditor}
                  className="px-4 py-1.5 rounded-lg text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Check size={13} />
                  <span>{editorMode === 'create' ? '새 템플릿 저장 & 적용' : '수정 내용 저장 & 적용'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. 문항 리스트 툴바 (일괄 체크, 정렬, 필터) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const targetIds = displayedStats.map((s) => s.question.id);
                onSetSelectedIds(new Set(targetIds));
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black cursor-pointer"
            >
              현재 목록 전체 선택
            </button>
            <button
              type="button"
              onClick={() => onSetSelectedIds(new Set())}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
            >
              전체 해제
            </button>
            {activeTemplate && (
              <button
                type="button"
                onClick={() => onSelectTemplate(activeTemplate)}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black cursor-pointer"
              >
                ⚡ 템플릿 조건 재적용
              </button>
            )}

            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={onlySelectedFilter}
                onChange={(e) => setOnlySelectedFilter(e.target.checked)}
                className="rounded text-violet-600 w-3.5 h-3.5"
              />
              <span>선택한 문항만 ({selectedIds.size})</span>
            </label>

            {summaryCounts.unattempted > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnattempted}
                  onChange={(e) => setShowUnattempted(e.target.checked)}
                  className="rounded text-slate-600 w-3.5 h-3.5"
                />
                <span>미응시 {summaryCounts.unattempted}문항 표시</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <Filter size={12} className="text-slate-400" />
            <span className="font-bold text-slate-500">정렬:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
            >
              <option value="accuracy_asc">정답률 낮은 순 (취약순)</option>
              <option value="wrong_desc">오답 횟수 많은 순</option>
              <option value="number_asc">문항 번호 순</option>
            </select>
          </div>
        </div>

        {/* 중복 배정 경고 배너 (해당 문항이 있을 때만) */}
        {summaryCounts.alreadyAssigned > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] text-amber-900">
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            <span>
              이미 후속 보물회수 시험지에 배정된 문항이 <strong>{summaryCounts.alreadyAssigned}개</strong> 감지되었습니다.
              중복 출제를 막기 위해 <strong>‘기 배정 중복 제외’</strong>가 켜진 템플릿에서는 자동으로 체크 해제됩니다.
            </span>
          </div>
        )}

        {/* 문항 카드 그리드 */}
        {displayedStats.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-bold">
            조건에 해당하는 문항이 없습니다.
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 ${
              isExpandedLayout ? 'lg:grid-cols-2 2xl:grid-cols-3' : 'lg:grid-cols-2'
            } gap-3`}
          >
            {displayedStats.map((st) => {
              const isChecked = selectedIds.has(st.question.id);
              const acc = st.accuracyPercent;
              const accTone =
                acc === null
                  ? 'slate'
                  : acc <= 40
                  ? 'rose'
                  : acc <= 70
                  ? 'amber'
                  : 'emerald';

              return (
                <div
                  key={st.canonicalId}
                  onClick={() => onToggleQuestion(st.question.id)}
                  className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 select-none ${
                    isChecked
                      ? 'border-violet-600 bg-violet-50/35 shadow-xs ring-1 ring-violet-400/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* 상단: 체크박스 + 문항번호 + 핵심 N/M 성적 + 배지 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleQuestion(st.question.id);
                        }}
                        className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                          isChecked
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-800 text-white'
                        }`}
                      >
                        {st.displayNumber}번
                      </span>

                      {typeof st.setIndex === 'number' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold flex items-center gap-0.5">
                          <Layers size={10} />
                          세트{st.setIndex + 1}
                        </span>
                      )}

                      {st.isSlow && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black flex items-center gap-0.5">
                          <Clock size={10} />
                          지체 ({st.avgSpentSec}초)
                        </span>
                      )}

                      {st.isAlreadyAssignedInNext && (
                        <span
                          className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-300 text-[10px] font-black"
                          title={`이미 다음 회차에 포함됨: ${st.assignedNextExamTitles.join(', ')}`}
                        >
                          📌 이미 후속 배정됨
                        </span>
                      )}
                    </div>

                    {/* 핵심 N번 중 M번 정답 배지 */}
                    <div className="text-right shrink-0">
                      {acc !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black border ${
                            accTone === 'rose'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : accTone === 'amber'
                              ? 'bg-amber-100 text-amber-900 border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <span>
                            {st.attemptCount}번 중 {st.correctCount}번 정답
                          </span>
                          <span className="opacity-80">({acc}%)</span>
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          미응시
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 중단: 문제 미리보기 + 정답률 게이지 + 회차별 O/X 흐름 */}
                  <div className="flex items-center gap-3">
                    {st.question.image_url && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewQuestion?.(st.question);
                        }}
                        className="w-20 h-16 rounded-xl border border-slate-200 bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden relative group hover:border-violet-400"
                        title="클릭하여 문제 크게 보기"
                      >
                        <img
                          src={st.question.image_url}
                          alt={`${st.displayNumber}번`}
                          className="max-h-full max-w-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Maximize2 size={12} />
                        </div>
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className="font-bold text-slate-700 truncate"
                          title={st.question.name}
                        >
                          {st.question.name || `${st.displayNumber}번 문항`}
                        </span>
                        {st.avgSpentSec > 0 && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                            평균 {st.avgSpentSec}초
                          </span>
                        )}
                      </div>

                      {/* 정답률 진행 바 */}
                      {acc !== null && (
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              accTone === 'rose'
                                ? 'bg-rose-500'
                                : accTone === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(4, acc)}%` }}
                          />
                        </div>
                      )}

                      {/* 회차별 O/X 이력 도트 */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {st.attempts.length === 0 ? (
                          <span className="text-[10px] text-slate-400">풀이 기록 없음</span>
                        ) : (
                          st.attempts.map((att, aIdx) => (
                            <span
                              key={`${att.roundKey}_${aIdx}`}
                              title={`${att.roundLabel}: ${
                                att.isCorrect ? '정답' : att.isUnknown ? '모름' : '오답'
                              }${att.spentSec > 0 ? ` (${att.spentSec}초)` : ''}${
                                att.isRecall ? ' [기억소환]' : ''
                              }`}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-black border ${
                                att.isCorrect
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : att.isUnknown
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {att.isCorrect ? (
                                <CheckCircle2 size={10} />
                              ) : att.isUnknown ? (
                                <HelpCircle size={10} />
                              ) : (
                                <XCircle size={10} />
                              )}
                              <span>{aIdx + 1}회</span>
                              {att.isRecall && <span className="text-purple-600">↻</span>}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {st.question.solution_drive_id && onOpenSolutionModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSolutionModal(st.question.solution_drive_id!);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-[10px] font-black shrink-0 flex items-center gap-1 cursor-pointer"
                        title="해설 보기"
                      >
                        <BookOpen size={11} />
                        <span>해설</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. 하단 Sticky 생성 액션 바 */}
      <div className="sticky bottom-0 z-10 bg-slate-900 text-white rounded-2xl p-3.5 sm:px-5 shadow-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
            <span className="text-amber-400">✅ 선택된 문항: {selectedIds.size}개</span>
            {linkedGenTemplate && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold flex items-center gap-1">
                <Link2 size={10} />
                연동됨: {linkedGenTemplate.name}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300">
            원하는 문항만 콕콕 찝거나 템플릿으로 선택한 뒤 버튼을 누르면 중복 없이 다음 보물회수가 생성됩니다.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateFromSelected}
          disabled={isCreatingWrongExam || selectedIds.size === 0}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} />
          <span>
            {isCreatingWrongExam
              ? '생성 중...'
              : `💎 선택한 ${selectedIds.size}문항으로 다음 보물회수 생성`}
          </span>
        </button>
      </div>
    </div>
  );
}
