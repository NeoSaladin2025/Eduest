'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Award,
  TrendingUp,
  BarChart2,
  ChevronRight,
  BookOpen,
  Camera,
  Layers,
  ArrowRight,
  Maximize2,
  Minimize2,
  Expand,
  AlertTriangle,
  Loader2,
  Zap,
  Target,
  CheckSquare
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import ChoiceTextRenderer from '@/components/ChoiceTextRenderer';
import { getCircledSymbol } from '@/lib/choiceGenerator';
import {
  calculateInstallmentRoundDuration,
  resolveTreasureBaseDuration,
  getInstallmentDeliveredQuestions,
  getInstallmentSubmissionSummary,
  parseExamRoundAndBaseTitle,
  resolveInstallmentSubmissionCoords,
  TreasureSelectionScope,
  TreasureSelectionTemplate,
  TreasureTemplate,
  DEFAULT_TREASURE_TEMPLATES,
  DEFAULT_SELECTION_TEMPLATES,
  getStoredSelectionTemplates,
  saveStoredSelectionTemplates,
  evaluateQuestionMatchesRule,
  computeTreasureCumulativeStats,
} from './treasureTypes';
import TreasureSelectionView from './TreasureSelectionView';
import TreasureTemplateLinkHelpModal from './TreasureTemplateLinkHelpModal';

interface Student {
  id: string;
  name: string;
  grade: string;
}

export interface ChainRoundItem {
  keyId: string; // 고유 키 (`${exam.id}_r${round}`)
  exam: ExamPaper;
  round: number; // 0: 원본, 1: 1회차, 2: 2회차 ...
  roundLabel: string;
  isOriginal: boolean;
  isTreasure: boolean;
  isTwin: boolean;
  durationMin: number;
  submission: any | null;
  totalSpentSec: number;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  submittedAt: string | null;
  setIndex?: number;
  setRound?: number;
  isInstallmentRound?: boolean;
  activeQuestions?: ExamQuestion[];
  recallQuestionIds?: Set<string>;
  recallOriginSetMap?: Record<string, number>;
}

interface TreasureDetailModalProps {
  student: Student;
  initialExam: ExamPaper;
  initialSubmission: any;
  allExams: ExamPaper[];
  allSubmissions: any[];
  onClose: () => void;
  onCreateWrongExam: (
    student: Student,
    sub: any,
    exam?: ExamPaper,
    options?: {
      selectedQuestions?: ExamQuestion[];
      linkedTreasureTemplateId?: string;
    }
  ) => void;
  isCreatingWrongExam?: boolean;
  onOverrideGrade?: (
    studentId: string,
    examId: string,
    questionId: string,
    nextIsCorrect: boolean,
    coords?: { setIndex?: number; setRound?: number; round?: number }
  ) => Promise<any>;
  onOpenSolutionModal?: (solutionDriveId: string) => void;
  onPreviewQuestion?: (question: ExamQuestion) => void;
  generationTemplates?: TreasureTemplate[];
}

// 초를 "X분 Y초" 또는 "Y초"로 포맷
function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0초';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0 && s > 0) return `${m}분 ${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

type ModalSizeMode = 'default' | 'wide' | 'fullscreen';
const STORAGE_KEY_MODAL_SIZE = 'eduest_treasure_modal_size_v1';

export default function TreasureDetailModal({
  student,
  initialExam,
  initialSubmission,
  allExams,
  allSubmissions,
  onClose,
  onCreateWrongExam,
  isCreatingWrongExam = false,
  onOverrideGrade,
  onOpenSolutionModal,
  onPreviewQuestion,
  generationTemplates = DEFAULT_TREASURE_TEMPLATES,
}: TreasureDetailModalProps) {
  // 로컬 상태 동기화용 submission 맵 (수정 시 roundChain, KPI, 차트, 카드 실시간 반영)
  const [localSubmissions, setLocalSubmissions] = useState<Record<string, any>>({});

  // 1. 체인 탐색: 동일 base_exam_title을 공유하거나 부모-자식으로 연결된 이 학생의 모든 회차 시험지 정렬
  const { roundChain, installmentInfo } = useMemo(() => {
    const currentBase = parseExamRoundAndBaseTitle(
      initialExam.base_exam_title || initialExam.title
    ).cleanBaseTitle.trim();

    // 이 학생에게 배정된 시험지 중 같은 베이스 제목이거나 ID가 연결된 시험지들 필터
    const matchedExams = allExams.filter((e) => {
      const isAssigned =
        (Array.isArray(e.assigned_student_ids) && e.assigned_student_ids.includes(student.id)) ||
        e.target_student_id === student.id;
      if (!isAssigned) return false;

      const base = parseExamRoundAndBaseTitle(e.base_exam_title || e.title).cleanBaseTitle.trim();
      if (base && currentBase && base === currentBase) return true;
      if (e.id === initialExam.id) return true;
      if (e.parent_exam_id === initialExam.id || initialExam.parent_exam_id === e.id) return true;
      return false;
    });

    // 각 시험지의 회차 번호 및 메타데이터 계산 (할부·누적 세트 및 다회차 round_history 완벽 지원)
    const items: ChainRoundItem[] = [];
    let detectedInstallment: {
      exam: ExamPaper;
      summary: NonNullable<ReturnType<typeof getInstallmentSubmissionSummary>>;
    } | null = null;

    matchedExams.forEach((ex) => {
      const parsed = parseExamRoundAndBaseTitle(ex.title);
      const isTreasure = Boolean(ex.is_treasure_hunt || parsed.isTreasure);
      const isWrong = Boolean(ex.is_wrong_review || parsed.isWrong);
      const isTwin = Boolean(
        ex.is_twin_variant ||
          parsed.isTwin ||
          (Array.isArray(ex.questions) && ex.questions.some((q: any) => q.is_twin))
      );

      const roundNum = ex.wrong_round ?? parsed.currentRound;
      const isOriginal = !isWrong && !isTreasure && roundNum === 0;

      const baseSub =
        allSubmissions.find((s) => s.student_id === student.id && s.exam_id === ex.id) ||
        (ex.id === initialExam.id ? initialSubmission : null);
      const sub = localSubmissions[ex.id] || baseSub;

      const instCfg = ex.treasure_config?.installment;
      const isInstallmentExam = Boolean(
        instCfg?.enabled && Array.isArray(instCfg.sets) && instCfg.sets.length > 0
      );

      if (isInstallmentExam && instCfg) {
        const summary = getInstallmentSubmissionSummary(ex, sub);
        if (summary) {
          detectedInstallment = { exam: ex, summary };
        }
      }

      const baseDur = resolveTreasureBaseDuration(ex.treasure_config, Number(ex.duration_min) || 0);

      // 🌟 round_history가 있거나 할부 시험인 경우 각 회차/바퀴를 정확히 펼쳐서 표시!
      if (
        Array.isArray(sub?.round_history) &&
        (sub.round_history.length > 1 ||
          isInstallmentExam ||
          (sub.round_history.length === 1 && typeof sub.round_history[0]?.set_index === 'number'))
      ) {
        sub.round_history.forEach((h: any) => {
          const rNumber = Number(h.round) || 1;
          const coords = isInstallmentExam && instCfg
            ? resolveInstallmentSubmissionCoords(instCfg, sub, h)
            : null;
          const hasSetCoords = Boolean(coords);
          const sIdx = coords ? coords.setIndex : undefined;
          const sRound = coords ? coords.setRound : undefined;

          const delivered =
            isInstallmentExam && instCfg && sIdx !== undefined && sRound !== undefined
              ? getInstallmentDeliveredQuestions(ex.questions || [], instCfg, sIdx, sRound, h.answers)
              : null;

          const roundDurationMin =
            isInstallmentExam && instCfg && sRound !== undefined && delivered
              ? calculateInstallmentRoundDuration(
                  baseDur,
                  ex.questions?.length || 0,
                  delivered.questions.length,
                  sRound,
                  ex.treasure_config!,
                  sIdx
                )
              : Number(ex.duration_min) || 0;

          const rLabel = isTreasure
            ? hasSetCoords && sIdx !== undefined && sRound !== undefined
              ? `보물회수 세트${sIdx + 1}·${sRound}바퀴${isTwin ? ' (쌍둥이)' : ''}`
              : `보물회수 ${rNumber}회차${isTwin ? ' (쌍둥이)' : ''}`
            : `오답 ${rNumber}회차${isTwin ? ' (쌍둥이)' : ''}`;

          const totalQ =
            h.total_questions ||
            delivered?.questions.length ||
            ex.questions?.length ||
            0;

          const virtualSub = {
            ...sub,
            score: h.score,
            correct_count: h.correct_count,
            total_questions: totalQ,
            submitted_at: h.submitted_at,
            answers: h.answers,
          };

          items.push({
            keyId:
              hasSetCoords && sIdx !== undefined && sRound !== undefined
                ? `${ex.id}_s${sIdx}_r${sRound}`
                : `${ex.id}_r${rNumber}`,
            exam: ex,
            round: rNumber,
            roundLabel: rLabel,
            isOriginal: false,
            isTreasure,
            isTwin,
            durationMin: roundDurationMin,
            submission: virtualSub,
            totalSpentSec: Number(h.total_spent_sec) || 0,
            score: h.score !== undefined ? Number(h.score) : null,
            correctCount: Number(h.correct_count) || 0,
            totalQuestions: totalQ,
            submittedAt: h.submitted_at || null,
            setIndex: sIdx,
            setRound: sRound,
            isInstallmentRound: Boolean(isInstallmentExam && hasSetCoords),
            activeQuestions: delivered?.questions,
            recallQuestionIds: delivered?.recallQuestionIds,
            recallOriginSetMap: delivered?.recallOriginSetMap,
          });
        });
      } else {
        const coords =
          isInstallmentExam && instCfg && sub
            ? resolveInstallmentSubmissionCoords(instCfg, sub)
            : null;
        const delivered =
          isInstallmentExam && instCfg && coords
            ? getInstallmentDeliveredQuestions(
                ex.questions || [],
                instCfg,
                coords.setIndex,
                coords.setRound,
                sub?.answers
              )
            : null;

        const roundDurationMin =
          isInstallmentExam && instCfg && coords && delivered
            ? calculateInstallmentRoundDuration(
                baseDur,
                ex.questions?.length || 0,
                delivered.questions.length,
                coords.setRound,
                ex.treasure_config!,
                coords.setIndex
              )
            : Number(ex.duration_min) || 0;

        let roundLabel = '';
        if (isOriginal) {
          roundLabel = '원본 시험';
        } else if (isTreasure && isInstallmentExam && coords) {
          roundLabel = `보물회수 세트${coords.setIndex + 1}·${coords.setRound}바퀴${isTwin ? ' (쌍둥이)' : ''}`;
        } else if (isTreasure) {
          roundLabel = `보물회수 ${roundNum > 0 ? `${roundNum}회차` : '1회차'}${isTwin ? ' (쌍둥이)' : ''}`;
        } else {
          roundLabel = `오답 ${roundNum > 0 ? `${roundNum}회차` : '클리닉'}${isTwin ? ' (쌍둥이)' : ''}`;
        }

        let spentSec = 0;
        if (sub?.answers) {
          Object.values(sub.answers).forEach((ans: any) => {
            spentSec += Number(ans?.time_spent_sec) || 0;
          });
        }

        items.push({
          keyId: ex.id,
          exam: ex,
          round: isOriginal ? 0 : roundNum > 0 ? roundNum : 1,
          roundLabel,
          isOriginal,
          isTreasure,
          isTwin,
          durationMin: roundDurationMin,
          submission: sub,
          totalSpentSec: spentSec,
          score: sub ? Number(sub.score) : null,
          correctCount: sub ? Number(sub.correct_count) || 0 : 0,
          totalQuestions:
            (delivered ? delivered.questions.length : sub?.total_questions) ||
            ex.questions?.length ||
            0,
          submittedAt: sub?.submitted_at || null,
          setIndex: coords?.setIndex,
          setRound: coords?.setRound,
          isInstallmentRound: Boolean(isInstallmentExam && coords),
          activeQuestions: delivered?.questions,
          recallQuestionIds: delivered?.recallQuestionIds,
          recallOriginSetMap: delivered?.recallOriginSetMap,
        });
      }
    });

    // 중복 제거 (동일 keyId 방지) 및 회차 오름차순 정렬
    const uniqueMap = new Map<string, ChainRoundItem>();
    items.forEach((it) => {
      if (!uniqueMap.has(it.keyId)) {
        uniqueMap.set(it.keyId, it);
      }
    });

    const list = Array.from(uniqueMap.values());
    list.sort((a, b) => a.round - b.round);

    // 만약 리스트에 initialExam이 누락되었을 경우 수동 추가 (안전장치)
    if (!list.some((it) => it.exam.id === initialExam.id)) {
      const parsed = parseExamRoundAndBaseTitle(initialExam.title);
      const effInitialSub = localSubmissions[initialExam.id] || initialSubmission;
      let spentSec = 0;
      if (effInitialSub?.answers) {
        Object.values(effInitialSub.answers).forEach((ans: any) => {
          spentSec += Number(ans?.time_spent_sec) || 0;
        });
      }
      const instCfg = initialExam.treasure_config?.installment;
      const isInst = Boolean(instCfg?.enabled && Array.isArray(instCfg.sets) && instCfg.sets.length > 0);
      if (isInst && instCfg && !detectedInstallment) {
        const s = getInstallmentSubmissionSummary(initialExam, effInitialSub);
        if (s) detectedInstallment = { exam: initialExam, summary: s };
      }
      const coords = isInst && instCfg && effInitialSub ? resolveInstallmentSubmissionCoords(instCfg, effInitialSub) : null;
      const delivered =
        isInst && instCfg && coords
          ? getInstallmentDeliveredQuestions(initialExam.questions || [], instCfg, coords.setIndex, coords.setRound, effInitialSub?.answers)
          : null;

      list.push({
        keyId: initialExam.id,
        exam: initialExam,
        round: initialExam.wrong_round ?? parsed.currentRound ?? 1,
        roundLabel:
          isInst && coords
            ? `보물회수 세트${coords.setIndex + 1}·${coords.setRound}바퀴`
            : parsed.isTreasure
            ? `보물회수 ${parsed.currentRound || 1}회차`
            : '보물회수 1회차',
        isOriginal: false,
        isTreasure: true,
        isTwin: Boolean(initialExam.is_twin_variant || parsed.isTwin),
        durationMin:
          isInst && instCfg && coords && delivered
            ? calculateInstallmentRoundDuration(
                resolveTreasureBaseDuration(initialExam.treasure_config, Number(initialExam.duration_min) || 0),
                initialExam.questions?.length || 0,
                delivered.questions.length,
                coords.setRound,
                initialExam.treasure_config!,
                coords.setIndex
              )
            : Number(initialExam.duration_min) || 0,
        submission: effInitialSub,
        totalSpentSec: spentSec,
        score: effInitialSub ? Number(effInitialSub.score) : null,
        correctCount: effInitialSub ? Number(effInitialSub.correct_count) || 0 : 0,
        totalQuestions: delivered?.questions.length || effInitialSub?.total_questions || initialExam.questions?.length || 0,
        submittedAt: effInitialSub?.submitted_at || null,
        setIndex: coords?.setIndex,
        setRound: coords?.setRound,
        isInstallmentRound: Boolean(isInst && coords),
        activeQuestions: delivered?.questions,
        recallQuestionIds: delivered?.recallQuestionIds,
        recallOriginSetMap: delivered?.recallOriginSetMap,
      });
      list.sort((a, b) => a.round - b.round);
    }

    return { roundChain: list, installmentInfo: detectedInstallment };
  }, [allExams, allSubmissions, initialExam, initialSubmission, student.id, localSubmissions]);

  // 현재 활성화된 탭 (특정 회차 keyId, 'matrix' 전체 비교 뷰, 또는 'selection' 문항별 성적 & 다음 보물회수 선별)
  const [activeTab, setActiveTab] = useState<string>(() => {
    return roundChain[roundChain.length - 1]?.keyId || initialExam.id;
  });

  // 창 크기 모드 ('default' | 'wide' 여백 확대 | 'fullscreen' 풀스크린)
  const [modalSizeMode, setModalSizeMode] = useState<ModalSizeMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_MODAL_SIZE);
        if (saved === 'wide' || saved === 'fullscreen' || saved === 'default') return saved;
      } catch {}
    }
    return 'default';
  });

  const handleSetModalSizeMode = useCallback((nextMode: ModalSizeMode) => {
    setModalSizeMode(nextMode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_MODAL_SIZE, nextMode);
      } catch {}
    }
  }, []);

  // 현재 선택된 회차 정보
  const selectedChainItem = useMemo(() => {
    return (
      roundChain.find((c) => c.keyId === activeTab || c.exam.id === activeTab) ||
      roundChain[roundChain.length - 1]
    );
  }, [roundChain, activeTab]);

  // 로컬 채점 수정 중인 문항 ID
  const [overridingQuestionId, setOverridingQuestionId] = useState<string | null>(null);

  const currentSubmission = useMemo(() => {
    return selectedChainItem?.submission || null;
  }, [selectedChainItem]);

  // 풀이 사진 모달 상태 & 연동 도움말 모달 상태
  const [viewProofModal, setViewProofModal] = useState<{ url: string; title: string } | null>(null);
  const [showLinkHelpModal, setShowLinkHelpModal] = useState(false);

  // ESC 키 처리 (열린 하위 모달부터 순차 닫기)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showLinkHelpModal) {
        setShowLinkHelpModal(false);
        return;
      }
      if (viewProofModal) {
        setViewProofModal(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLinkHelpModal, viewProofModal, onClose]);

  // 🎯 문항별 누적 성적 & 선별 템플릿 상태
  const [selectionScope, setSelectionScope] = useState<TreasureSelectionScope>('current_exam');
  const [selectionTemplates, setSelectionTemplates] = useState<TreasureSelectionTemplate[]>(() =>
    getStoredSelectionTemplates()
  );
  const [activeSelectionTemplateId, setActiveSelectionTemplateId] = useState<string>(() => {
    const stored = getStoredSelectionTemplates();
    return stored[0]?.id || DEFAULT_SELECTION_TEMPLATES[0].id;
  });

  const selectionTargetExam = useMemo(() => {
    if (selectedChainItem && !selectedChainItem.isOriginal) {
      return selectedChainItem.exam;
    }
    const latestTreasure = [...roundChain].reverse().find((c) => !c.isOriginal);
    return latestTreasure?.exam || initialExam;
  }, [selectedChainItem, roundChain, initialExam]);

  const hasMultipleChainExams = useMemo(() => {
    const uniqueExamIds = new Set(roundChain.map((r) => r.exam.id));
    return uniqueExamIds.size > 1;
  }, [roundChain]);

  const cumulativeStats = useMemo(() => {
    return computeTreasureCumulativeStats<ExamQuestion>(roundChain, selectionTargetExam, selectionScope);
  }, [roundChain, selectionTargetExam, selectionScope]);

  const activeSelectionTemplate = useMemo(
    () => selectionTemplates.find((t) => t.id === activeSelectionTemplateId) || selectionTemplates[0],
    [selectionTemplates, activeSelectionTemplateId]
  );

  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(() => new Set());

  // 대상 시험지나 집계 범위가 바뀔 때 현재 활성 템플릿 기준으로 자동 선택
  useEffect(() => {
    if (!activeSelectionTemplate) return;
    const matched = new Set<string>();
    cumulativeStats.forEach((st) => {
      if (evaluateQuestionMatchesRule(st, activeSelectionTemplate.rule)) {
        matched.add(st.question.id);
      }
    });
    setSelectedQuestionIds(matched);
  }, [cumulativeStats, activeSelectionTemplate]);

  const handleSelectSelectionTemplate = (tpl: TreasureSelectionTemplate) => {
    setActiveSelectionTemplateId(tpl.id);
    const matched = new Set<string>();
    cumulativeStats.forEach((st) => {
      if (evaluateQuestionMatchesRule(st, tpl.rule)) {
        matched.add(st.question.id);
      }
    });
    setSelectedQuestionIds(matched);
  };

  const handleSaveSelectionTemplate = (tpl: TreasureSelectionTemplate, isNew: boolean) => {
    const updated = isNew
      ? [...selectionTemplates, tpl]
      : selectionTemplates.map((t) => (t.id === tpl.id ? tpl : t));
    setSelectionTemplates(updated);
    saveStoredSelectionTemplates(updated);
    setActiveSelectionTemplateId(tpl.id);
    const matched = new Set<string>();
    cumulativeStats.forEach((st) => {
      if (evaluateQuestionMatchesRule(st, tpl.rule)) {
        matched.add(st.question.id);
      }
    });
    setSelectedQuestionIds(matched);
  };

  const handleDeleteSelectionTemplate = (id: string) => {
    if (selectionTemplates.length <= 1) return;
    if (!confirm('선택한 선별 기준 템플릿을 삭제하시겠습니까?')) return;
    const updated = selectionTemplates.filter((t) => t.id !== id);
    setSelectionTemplates(updated);
    saveStoredSelectionTemplates(updated);
    if (activeSelectionTemplateId === id && updated[0]) {
      handleSelectSelectionTemplate(updated[0]);
    }
  };

  const handleResetSelectionTemplates = () => {
    if (!confirm('선별 기준 템플릿을 기본 프리셋 4종으로 초기화하시겠습니까?')) return;
    setSelectionTemplates(DEFAULT_SELECTION_TEMPLATES);
    saveStoredSelectionTemplates(DEFAULT_SELECTION_TEMPLATES);
    handleSelectSelectionTemplate(DEFAULT_SELECTION_TEMPLATES[0]);
  };

  const handleToggleSelectedQuestion = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const handleCreateNextFromSelection = (forceRequireSelection = false) => {
    const subToUse = currentSubmission || initialSubmission;
    const examToUse = selectionTargetExam || selectedChainItem?.exam || initialExam;
    const chosenQuestions = cumulativeStats
      .filter((st) => selectedQuestionIds.has(st.question.id))
      .map((st) => st.question);

    const linkedTemplateId =
      activeSelectionTemplate?.linkGenerationTemplate &&
      activeSelectionTemplate?.linkedTreasureTemplateId
        ? activeSelectionTemplate.linkedTreasureTemplateId
        : undefined;

    if (chosenQuestions.length === 0) {
      if (forceRequireSelection) {
        alert('다음 보물회수로 생성할 문항을 1개 이상 선택해 주세요!');
        return;
      }
      // 다른 탭에서 눌렀을 때 선별된 문항이 0개면 선별 탭을 열어 주거나 기존 안내 흐름을 따름
      onCreateWrongExam(student, subToUse, examToUse, {
        linkedTreasureTemplateId: linkedTemplateId,
      });
      return;
    }

    onCreateWrongExam(student, subToUse, examToUse, {
      selectedQuestions: chosenQuestions,
      linkedTreasureTemplateId: linkedTemplateId,
    });
  };

  // KPI 요약 지표 계산 (할부 전체 코스 진도 / 원본 분리 / 부동소수점 보정 / 타임어택 스마트 폴백)
  const kpiStats = useMemo(() => {
    const originalItem = roundChain.find((c) => c.isOriginal) || roundChain[0];
    const latestItem = roundChain[roundChain.length - 1];
    const activeViewItem = selectedChainItem || latestItem;

    const firstScore = originalItem?.score ?? 0;
    const latestScore = latestItem?.score ?? 0;
    const scoreDiff = Math.round((latestScore - firstScore) * 10) / 10;

    const firstSpent = originalItem?.totalSpentSec ?? 0;
    const latestSpent = latestItem?.totalSpentSec ?? 0;
    const isOriginalTimeMeasured = firstSpent > 0;
    const isLatestTimeMeasured = latestSpent > 0;
    const timeDiff = firstSpent - latestSpent; // 원본 시간이 있을 때 양수면 단축됨

    const treasureRoundItems = roundChain.filter((c) => !c.isOriginal);

    let completedRounds: number;
    let totalRounds: number;
    let isAllCourseCompleted = false;

    if (installmentInfo) {
      completedRounds = installmentInfo.summary.progress.completedCourseRounds;
      totalRounds = installmentInfo.summary.progress.totalCourseRounds;
      isAllCourseCompleted = installmentInfo.summary.progress.isAllCompleted;
    } else if (treasureRoundItems.length > 0) {
      const plannedMax = treasureRoundItems.reduce(
        (maxVal, item) => Math.max(maxVal, Number(item.exam.treasure_config?.total_rounds) || 0),
        0
      );
      completedRounds = treasureRoundItems.filter((c) => c.submission !== null).length;
      totalRounds = Math.max(plannedMax, treasureRoundItems.length);
      isAllCourseCompleted = totalRounds > 0 && completedRounds >= totalRounds;
    } else {
      completedRounds = roundChain.filter((c) => c.submission !== null).length;
      totalRounds = roundChain.length;
      isAllCourseCompleted = totalRounds > 0 && completedRounds >= totalRounds;
    }

    // 회수율: 현재 보고 있는(또는 최신) 회차의 실제 출제 문항 기준 정답률
    const rateTargetItem = activeViewItem && activeViewItem.submission ? activeViewItem : latestItem;
    const recoveryRate =
      rateTargetItem && rateTargetItem.totalQuestions > 0
        ? Math.round((rateTargetItem.correctCount / rateTargetItem.totalQuestions) * 100)
        : 0;

    // 여유 시간 계산 (제한시간 대비)
    const latestLimitSec = (latestItem?.durationMin || 0) * 60;
    const spareSec = latestLimitSec > 0 ? Math.max(0, latestLimitSec - latestSpent) : 0;

    return {
      firstScore,
      latestScore,
      scoreDiff,
      firstSpent,
      latestSpent,
      latestLimitMin: latestItem?.durationMin || 0,
      isOriginalTimeMeasured,
      isLatestTimeMeasured,
      timeDiff,
      spareSec,
      completedRounds,
      totalRounds,
      isAllCourseCompleted,
      recoveryRate,
      rateTargetCorrect: rateTargetItem?.correctCount ?? 0,
      rateTargetTotal: rateTargetItem?.totalQuestions ?? 0,
      rateTargetLabel: rateTargetItem?.roundLabel || '',
      isPerfect: recoveryRate === 100,
    };
  }, [roundChain, installmentInfo, selectedChainItem]);

  // 현재 선택된 회차의 문항별 시간 통계 및 평균 (할부 모드 시 해당 바퀴 실제 출제 문항만!)
  const currentQuestionsWithStats = useMemo(() => {
    const questions =
      selectedChainItem?.activeQuestions && selectedChainItem.activeQuestions.length > 0
        ? selectedChainItem.activeQuestions
        : selectedChainItem?.exam?.questions || [];

    if (!questions || questions.length === 0) {
      return {
        items: [],
        totalSec: 0,
        avgSec: 0,
        maxSec: 1,
      };
    }

    const answers = currentSubmission?.answers || {};
    const recallSet = selectedChainItem?.recallQuestionIds;
    const recallOriginMap = selectedChainItem?.recallOriginSetMap;

    const items = questions.map((q, idx) => {
      const ansInfo = answers[q.id];
      const spentSec = Number(ansInfo?.time_spent_sec) || 0;
      const isCorrect = ansInfo?.is_correct ?? false;
      const userAns = ansInfo?.user_answer || '(미입력)';
      const isUnknown = userAns === '모름' || userAns === 'unknown';
      const isRecall = Boolean(recallSet?.has(q.id));
      const recallOriginSet = isRecall && recallOriginMap ? recallOriginMap[q.id] : undefined;
      return {
        q,
        idx,
        ansInfo,
        spentSec,
        isCorrect,
        isUnknown,
        userAns,
        isRecall,
        recallOriginSet,
      };
    });

    const totalSec = items.reduce((acc, it) => acc + it.spentSec, 0);
    const avgSec = items.length > 0 ? Math.round(totalSec / items.length) : 0;
    const maxSec = Math.max(...items.map((it) => it.spentSec), 1);

    return {
      items,
      totalSec,
      avgSec,
      maxSec,
    };
  }, [selectedChainItem, currentSubmission]);

  // 채점 수동 수정 핸들러 (할부 세트·바퀴 좌표 함께 전달)
  const handleToggleGrade = async (questionId: string, currentIsCorrect: boolean) => {
    if (!onOverrideGrade || !selectedChainItem) return;
    try {
      setOverridingQuestionId(questionId);
      const updatedSub = await onOverrideGrade(
        student.id,
        selectedChainItem.exam.id,
        questionId,
        !currentIsCorrect,
        {
          setIndex: selectedChainItem.setIndex,
          setRound: selectedChainItem.setRound,
          round: selectedChainItem.round,
        }
      );
      if (updatedSub) {
        setLocalSubmissions((prev) => ({
          ...prev,
          [selectedChainItem.exam.id]: updatedSub,
        }));
      }
    } catch (e) {
      console.error('Failed to override grade in modal:', e);
    } finally {
      setOverridingQuestionId(null);
    }
  };

  const cleanBaseTitle = parseExamRoundAndBaseTitle(
    initialExam.base_exam_title || initialExam.title
  ).cleanBaseTitle;

  const isExpandedLayout = modalSizeMode !== 'default';

  const outerContainerClass =
    modalSizeMode === 'fullscreen'
      ? 'fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 animate-in fade-in duration-200'
      : modalSizeMode === 'wide'
      ? 'fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-1 sm:p-2 animate-in fade-in duration-200'
      : 'fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200';

  const modalCardClass =
    modalSizeMode === 'fullscreen'
      ? 'bg-white rounded-none w-screen h-screen max-w-none max-h-none flex flex-col shadow-2xl overflow-hidden border-0'
      : modalSizeMode === 'wide'
      ? 'bg-white rounded-2xl w-[98vw] h-[96vh] max-w-none max-h-[96vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200'
      : 'bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200';

  return (
    <div className={outerContainerClass}>
      <div className={modalCardClass}>
        {/* ======================= 1. 상단 모달 헤더 ======================= */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shadow-md shadow-amber-500/20 text-white shrink-0">
              <Sparkles size={20} className="fill-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-violet-500/30 text-violet-200 border border-violet-400/30 font-black rounded-md text-[11px]">
                  {student.grade}
                </span>
                <span className="font-black text-slate-100 text-lg">
                  {student.name} 학생
                </span>
                <span className="text-amber-400 font-black text-xs flex items-center gap-1 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  <Award size={13} />
                  보물회수 정복 리포트
                </span>
              </div>
              <h2 className="text-sm font-semibold text-slate-300 mt-0.5 line-clamp-1" title={cleanBaseTitle}>
                {cleanBaseTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 다음 보물회수 생성 버튼 */}
            <button
              type="button"
              onClick={() => handleCreateNextFromSelection(activeTab === 'selection')}
              disabled={isCreatingWrongExam}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="선별된 문항(또는 현재 기준 오답 문항)으로 다음 회차 보물회수 시험지를 즉시 생성합니다"
            >
              <RotateCcw size={14} className={isCreatingWrongExam ? 'animate-spin' : ''} />
              <span>
                {isCreatingWrongExam
                  ? '생성 중...'
                  : selectedQuestionIds.size > 0
                  ? `💎 다음 보물회수 생성 (${selectedQuestionIds.size})`
                  : '💎 다음 보물회수 생성'}
              </span>
            </button>

            {/* 살짝 여백 확대 버튼 (98vw x 96vh) */}
            <button
              type="button"
              onClick={() => handleSetModalSizeMode(modalSizeMode === 'wide' ? 'default' : 'wide')}
              className={`h-9 px-2.5 rounded-xl border flex items-center gap-1 font-bold transition-colors cursor-pointer text-[11px] ${
                modalSizeMode === 'wide'
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
              }`}
              title={modalSizeMode === 'wide' ? '원래 크기로 복원' : '넓은 창으로 확대 (여백 유지)'}
            >
              {modalSizeMode === 'wide' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden md:inline">
                {modalSizeMode === 'wide' ? '기본 크기' : '여백 확대'}
              </span>
            </button>

            {/* 풀스크린 버튼 (100vw x 100vh) */}
            <button
              type="button"
              onClick={() =>
                handleSetModalSizeMode(modalSizeMode === 'fullscreen' ? 'default' : 'fullscreen')
              }
              className={`h-9 px-2.5 rounded-xl border flex items-center gap-1 font-bold transition-colors cursor-pointer text-[11px] ${
                modalSizeMode === 'fullscreen'
                  ? 'bg-violet-500 text-white border-violet-300 shadow-sm'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
              }`}
              title={modalSizeMode === 'fullscreen' ? '원래 크기로 복원' : '화면 꽉 채우기 (풀스크린)'}
            >
              {modalSizeMode === 'fullscreen' ? <Minimize2 size={14} /> : <Expand size={14} />}
              <span className="hidden md:inline">
                {modalSizeMode === 'fullscreen' ? '창 복원' : '풀스크린'}
              </span>
            </button>

            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center font-bold transition-colors cursor-pointer text-sm"
              title="닫기 (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ======================= 2. 종합 KPI 요약 배너 ======================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          {/* 회차 / 할부 진행 현황 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Layers size={12} className="text-indigo-500" />
              {installmentInfo ? '할부 진행 현황' : '진행 회차'}
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-slate-800">
                {kpiStats.completedRounds}
              </span>
              <span className="text-xs font-bold text-slate-400">
                / {kpiStats.totalRounds}{installmentInfo ? '바퀴' : '회차'}{' '}
                {kpiStats.isAllCourseCompleted ? '완주 🎉' : '진행'}
              </span>
            </div>
            <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5 line-clamp-1">
              {installmentInfo
                ? kpiStats.isAllCourseCompleted
                  ? `전체 ${installmentInfo.summary.totalSets}세트 모든 바퀴 정복 완료!`
                  : `총 ${installmentInfo.summary.totalSets}세트 · 다음: 세트${installmentInfo.summary.progress.activeSetIndex + 1}·${installmentInfo.summary.progress.activeSetRound}바퀴 대기`
                : roundChain.length > 1
                ? kpiStats.isAllCourseCompleted
                  ? '전 회차 복습 코스 완주!'
                  : '연속 복습 코스 진행 중'
                : '단일 회차 응시 완료'}
            </span>
          </div>

          {/* 점수 상승폭 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-500" />
              점수 성장 추이
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-violet-600">
                {kpiStats.latestScore}점
              </span>
              {roundChain.length > 1 && (
                <span
                  className={`text-xs font-black px-1.5 py-0.2 rounded ${
                    kpiStats.scoreDiff >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {kpiStats.scoreDiff >= 0 ? `+${kpiStats.scoreDiff}점` : `${kpiStats.scoreDiff}점`}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {roundChain.length > 1 ? `최초 ${kpiStats.firstScore}점 ➔ 현재 ${kpiStats.latestScore}점` : '최종 채점 완료'}
            </span>
          </div>

          {/* 소요 시간 단축량 (선생님 채점 / 시간 미기록 스마트 폴백) */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Clock size={12} className="text-amber-500" />
              {kpiStats.isOriginalTimeMeasured ? '타임어택 단축량' : '타임어택 여유 완주'}
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-slate-800">
                {kpiStats.isOriginalTimeMeasured
                  ? formatDuration(kpiStats.latestSpent)
                  : kpiStats.spareSec > 0
                  ? `${formatDuration(kpiStats.spareSec)} 여유`
                  : kpiStats.isLatestTimeMeasured
                  ? formatDuration(kpiStats.latestSpent)
                  : '지필 채점'}
              </span>
              {kpiStats.isOriginalTimeMeasured && roundChain.length > 1 ? (
                <span
                  className={`text-xs font-black px-1.5 py-0.2 rounded ${
                    kpiStats.timeDiff > 0
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {kpiStats.timeDiff > 0 ? `-${formatDuration(kpiStats.timeDiff)} 단축` : '+시간 증가'}
                </span>
              ) : !kpiStats.isOriginalTimeMeasured && kpiStats.spareSec > 0 ? (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                  <Zap size={10} className="fill-emerald-600 text-emerald-600" />
                  쾌속 완주
                </span>
              ) : null}
            </div>
            <span className="text-[10px] text-amber-700 font-semibold block mt-0.5 line-clamp-1">
              {installmentInfo && kpiStats.latestLimitMin > 0
                ? `최근 바퀴 제한 ${kpiStats.latestLimitMin}분${kpiStats.spareSec > 0 ? ` (${formatDuration(kpiStats.spareSec)} 여유)` : ''}`
                : kpiStats.isOriginalTimeMeasured
                ? (kpiStats.timeDiff > 0 ? '최초 대비 속도 향상!' : '신중하게 오답 복습')
                : (kpiStats.isLatestTimeMeasured ? `설정 제한시간 대비 여유 완주` : '선생님 수동 채점 (시간 미측정)')}
            </span>
          </div>

          {/* 오답 보물회수율 / 선택 바퀴 정답률 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Sparkles size={12} className="text-rose-500 fill-rose-500" />
              {installmentInfo ? '선택 바퀴 정답률' : '오답 회수 성공률'}
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-emerald-600">
                {kpiStats.recoveryRate}%
              </span>
              {installmentInfo && (
                <span className="text-xs font-bold text-slate-500">
                  ({kpiStats.rateTargetCorrect}/{kpiStats.rateTargetTotal})
                </span>
              )}
              {kpiStats.isPerfect && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded-full">
                  ALL CLEAR 💎
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5 line-clamp-1">
              {installmentInfo
                ? `전체 ${installmentInfo.summary.totalPoolCount}문항 중 ${installmentInfo.summary.attemptedUniqueCount}문항 학습 (${installmentInfo.summary.recoveredUniqueCount}문항 정답)`
                : kpiStats.recoveryRate === 100
                ? '모든 오답 정복 완료!'
                : '미회수 오답 추가 보물회수 권장'}
            </span>
          </div>
        </div>

        {/* ======================= 2-1. 할부·누적 세트별 진행 미니 로드맵 ======================= */}
        {installmentInfo && (
          <div className="px-6 py-2.5 bg-indigo-50/50 border-b border-indigo-100 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-black text-indigo-900 flex items-center gap-1.5">
                <span>🧩 할부·누적 세트 로드맵</span>
                <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
                  {installmentInfo.summary.totalPoolCount}문항 · {installmentInfo.summary.installment.chunk_size}문항 분할 · {installmentInfo.summary.percent}% ({installmentInfo.summary.progress.completedCourseRounds}/{installmentInfo.summary.progress.totalCourseRounds}바퀴)
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {installmentInfo.summary.progress.sets.map((sp) => {
                const isNextActive =
                  !installmentInfo.summary.progress.isAllCompleted &&
                  installmentInfo.summary.progress.activeSetIndex === sp.setIndex;
                const latestRoundOfSet = sp.completedRoundsList[sp.completedRoundsList.length - 1];
                const matchingTabKey = latestRoundOfSet
                  ? `${installmentInfo.exam.id}_s${sp.setIndex}_r${latestRoundOfSet}`
                  : null;
                const isViewingThisSet =
                  selectedChainItem?.setIndex === sp.setIndex &&
                  activeTab !== 'matrix' &&
                  activeTab !== 'selection';

                return (
                  <button
                    key={sp.setIndex}
                    type="button"
                    disabled={!matchingTabKey}
                    onClick={() => {
                      if (matchingTabKey) setActiveTab(matchingTabKey);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 border transition-all flex items-center gap-1 ${
                      isViewingThisSet
                        ? 'bg-violet-600 text-white border-violet-600 shadow-xs cursor-pointer'
                        : sp.isCompleted
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                        : isNextActive
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-white/70 text-slate-400 border-slate-200 cursor-default'
                    }`}
                  >
                    <span>
                      {sp.isCompleted ? '✓' : isNextActive ? '🔥' : sp.isUnlocked ? '○' : '🔒'} 세트{sp.setIndex + 1}
                    </span>
                    <span className="opacity-80">
                      {sp.completedCount}/{sp.totalRounds}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================= 3. 회차 선택 네비게이션 탭 (버그 1 & 2 해결: flex-wrap 칩 그리드 + 상단 요약 분리) ======================= */}
        <div className="bg-white border-b border-slate-200 shrink-0">
          {/* 선택 회차 실시간 상태 서브 스트립 (독립 분리로 텍스트 겹침 원천 차단) */}
          <div className="px-6 py-2 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Target size={13} className="text-violet-600" />
                선택 보기:
              </span>
              <span className="font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {activeTab === 'matrix'
                  ? '📈 회차별 통합 비교 뷰 (Matrix)'
                  : activeTab === 'selection'
                  ? '🎯 문항별 누적 성적 & 다음 보물회수 선별'
                  : selectedChainItem?.roundLabel}
              </span>
            </div>

            {selectedChainItem && activeTab !== 'matrix' && activeTab !== 'selection' && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1 font-bold text-slate-600">
                  <Clock size={12} className="text-violet-600" />
                  제한: {selectedChainItem.durationMin > 0 ? `${selectedChainItem.durationMin}분` : '자율'}
                </span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1 font-bold text-slate-600">
                  <Zap size={12} className="text-amber-500" />
                  사용:{' '}
                  {selectedChainItem.totalSpentSec > 0 ? (
                    formatDuration(selectedChainItem.totalSpentSec)
                  ) : (
                    <span className="text-[10px] text-slate-400 bg-slate-200/70 px-1.5 py-0.2 rounded font-medium">
                      지필 채점 (미측정)
                    </span>
                  )}
                </span>
                {selectedChainItem.submittedAt && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-[11px] text-slate-400">
                      제출: {new Date(selectedChainItem.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 회차 선택 칩 그리드 (flex-wrap으로 가로 스크롤바 드래그 없이 한눈에 파악) */}
          <div className="px-6 py-3 flex flex-wrap items-center gap-2">
            {roundChain.map((item) => {
              const isActive = activeTab === item.keyId;
              const hasSub = item.submission !== null;
              const isZeroTime = item.totalSpentSec <= 0;
              return (
                <button
                  key={item.keyId}
                  type="button"
                  onClick={() => setActiveTab(item.keyId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25 scale-[1.02]'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
                  }`}
                >
                  {item.isTreasure ? (
                    <Sparkles size={12} className={isActive ? 'fill-amber-300 text-amber-300' : 'text-amber-500'} />
                  ) : item.isOriginal ? (
                    <span>📄</span>
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  <span>{item.roundLabel}</span>

                  {item.isOriginal && isZeroTime && hasSub && (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-medium ${
                        isActive ? 'bg-violet-700/80 text-violet-100' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      지필
                    </span>
                  )}

                  {hasSub ? (
                    <span
                      className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                        isActive
                          ? 'bg-violet-700 text-violet-100'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {item.score}점
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] text-amber-600 font-bold bg-amber-100 px-1 rounded">
                      미응시
                    </span>
                  )}
                </button>
              );
            })}

            {/* 전체 회차 비교 매트릭스 탭 (2개 이상 회차가 존재할 때 제공) */}
            {roundChain.length > 1 && (
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'matrix'
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25 scale-[1.02]'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
                }`}
              >
                <BarChart2 size={13} className="text-amber-400" />
                <span>📈 회차별 통합 비교 뷰</span>
              </button>
            )}

            {/* 🎯 문항별 누적 성적 & 다음 보물회수 선별 탭 */}
            <button
              type="button"
              onClick={() => setActiveTab('selection')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'selection'
                  ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-md shadow-rose-500/25 scale-[1.02]'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300'
              }`}
            >
              <CheckSquare size={13} className={activeTab === 'selection' ? 'text-white' : 'text-amber-600'} />
              <span>🎯 문항별 성적 & 다음 보물회수 선별</span>
              <span
                className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'selection'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-200/80 text-amber-950'
                }`}
              >
                {selectedQuestionIds.size}
              </span>
            </button>
          </div>
        </div>

        {/* ======================= 4. 본문 스크롤 영역 ======================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50">
          {/* ===================== [0] 문항별 누적 성적 & 다음 보물회수 선별 뷰 ===================== */}
          {activeTab === 'selection' ? (
            <TreasureSelectionView
              stats={cumulativeStats}
              scope={selectionScope}
              onChangeScope={setSelectionScope}
              targetExamTitle={selectionTargetExam.title}
              hasMultipleChainExams={hasMultipleChainExams}
              templates={selectionTemplates}
              activeTemplateId={activeSelectionTemplateId}
              onSelectTemplate={handleSelectSelectionTemplate}
              onSaveTemplate={handleSaveSelectionTemplate}
              onDeleteTemplate={handleDeleteSelectionTemplate}
              onResetTemplates={handleResetSelectionTemplates}
              generationTemplates={generationTemplates}
              selectedIds={selectedQuestionIds}
              onToggleQuestion={handleToggleSelectedQuestion}
              onSetSelectedIds={setSelectedQuestionIds}
              isExpandedLayout={isExpandedLayout}
              isCreatingWrongExam={isCreatingWrongExam}
              onCreateFromSelected={() => handleCreateNextFromSelection(true)}
              onOpenHelpModal={() => setShowLinkHelpModal(true)}
              onOpenSolutionModal={onOpenSolutionModal}
              onPreviewQuestion={onPreviewQuestion}
            />
          ) : activeTab === 'matrix' ? (
            <div className="space-y-6">
              {/* 회차별 시간 & 점수 비교 바 차트 */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-slate-800 flex items-center gap-1.5">
                      ⏱️ 회차별 타임어택 제한시간 vs 실제 사용시간 비교
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    단위: 분 (소요시간 단축 추이)
                  </span>
                </div>

                <div className="space-y-4">
                  {roundChain.map((it) => {
                    const limitMin = it.durationMin;
                    const spentMin = Math.round((it.totalSpentSec / 60) * 10) / 10;
                    const maxScale = Math.max(limitMin, spentMin, 20);
                    const limitWidth = limitMin > 0 ? Math.min(100, (limitMin / maxScale) * 100) : 0;
                    const spentWidth = Math.min(100, (spentMin / maxScale) * 100);

                    return (
                      <div key={it.keyId} className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/60">
                        <div className="flex items-center justify-between text-xs font-black text-slate-700 mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-violet-600 inline-block"></span>
                            {it.roundLabel}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 font-medium">
                              제한시간: <strong className="text-slate-800">{limitMin > 0 ? `${limitMin}분` : '자율'}</strong>
                            </span>
                            <span className="text-violet-700 font-bold">
                              실사용: <strong>{formatDuration(it.totalSpentSec)}</strong>
                            </span>
                            <span className="text-emerald-700 font-black bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              점수: {it.score !== null ? `${it.score}점` : '미응시'}
                            </span>
                          </div>
                        </div>

                        {/* 이중 비교 프로그레스 바 */}
                        <div className="space-y-1.5">
                          {limitMin > 0 && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className="w-12 shrink-0">제한시간</span>
                              <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-slate-400/80 rounded-full transition-all duration-500"
                                  style={{ width: `${limitWidth}%` }}
                                ></div>
                              </div>
                              <span className="w-12 text-right font-mono font-bold text-slate-500">{limitMin}분</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-[10px] text-violet-700 font-bold">
                            <span className="w-12 shrink-0">실제풀이</span>
                            <div className="flex-1 h-3.5 bg-violet-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-500 shadow-xs"
                                style={{ width: `${spentWidth}%` }}
                              ></div>
                            </div>
                            <span className="w-12 text-right font-mono font-black text-violet-800">
                              {spentMin}분
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 회차별 문항 정복 매트릭스 테이블 */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                    💎 문항별 회차 오답 극복 트래커 (Matrix)
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">
                    원본 오답이 보물회수에서 정답으로 전환되었는지 한눈에 비교합니다
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100/80 text-slate-600 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-16 text-center">문항</th>
                        {roundChain.map((r) => (
                          <th key={r.keyId} className="p-3 text-center border-l border-slate-200">
                            <div className="flex flex-col items-center">
                              <span>{r.roundLabel}</span>
                              <span className="text-[10px] font-bold text-slate-400">
                                ({r.score !== null ? `${r.score}점` : '대기'})
                              </span>
                            </div>
                          </th>
                        ))}
                        <th className="p-3 text-center border-l border-slate-200 w-36">보물회수 상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* 원본 시험지 문항을 기준으로 스마트 1:1 매칭 비교 매트릭스 생성 (할부 출제 문항만 정확히 매칭) */}
                      {(() => {
                        const baseItem =
                          roundChain.find((r) => r.isOriginal) ||
                          [...roundChain].sort((a, b) => (b.exam.questions?.length || 0) - (a.exam.questions?.length || 0))[0];
                        const baseQuestions = baseItem?.exam?.questions || [];

                        return baseQuestions.map((baseQ, qIndex) => {
                          // 각 회차별 baseQ와 1:1 연결되는 문항(parent_question_id 또는 id) 탐색
                          const roundStatuses = roundChain.map((r) => {
                            let matchedQ: ExamQuestion | undefined;
                            const candidatePool =
                              r.isInstallmentRound && r.activeQuestions && r.activeQuestions.length > 0
                                ? r.activeQuestions
                                : r.exam.questions || [];

                            if (r.keyId === baseItem.keyId) {
                              matchedQ = candidatePool[qIndex] || baseQ;
                            } else {
                              // 보물회수 또는 오답 회차: baseQ의 id를 parent_question_id로 가지거나 일치하는 문항 매칭
                              matchedQ = candidatePool.find((tq: any) => {
                                if (
                                  tq.parent_question_id &&
                                  (tq.parent_question_id === baseQ.id ||
                                    tq.parent_question_id === (baseQ as any).parent_question_id)
                                ) {
                                  return true;
                                }
                                if (tq.id === baseQ.id) return true;
                                const baseNum = baseQ.question_number ?? (qIndex + 1);
                                if (tq.is_twin && tq.question_number !== undefined && tq.question_number === baseNum) {
                                  if (!tq.folder_name || tq.folder_name === (baseQ as any).folder_name) return true;
                                }
                                if (tq.name && baseQ.name && tq.name.includes(baseQ.name)) return true;
                                return false;
                              });
                            }

                            if (!matchedQ) return null; // 이 회차에는 해당 문항이 출제되지 않음 (미출제)

                            const ans =
                              r.submission?.answers?.[matchedQ.id] ||
                              r.submission?.answers?.[baseQ.id];

                            if (!ans) return { exists: true, solved: false, isCorrect: false, sec: 0 };
                            return {
                              exists: true,
                              solved: true,
                              isCorrect: Boolean(ans.is_correct),
                              isUnknown: ans.user_answer === '모름' || ans.user_answer === 'unknown',
                              sec: Number(ans.time_spent_sec) || 0,
                            };
                          });

                          const firstStatus = roundStatuses[0];
                          const nonOriginalStatuses = roundStatuses.slice(1).filter((st) => st && st.solved);
                          const anyRecovered = nonOriginalStatuses.some((st) => st?.isCorrect);
                          const latestTreasureStatus = nonOriginalStatuses[nonOriginalStatuses.length - 1];

                          // 보물회수 상태 판별
                          const isOriginallyCorrect = firstStatus?.solved && firstStatus?.isCorrect;
                          const isRecovered = !isOriginallyCorrect && anyRecovered;
                          const isPendingSet =
                            Boolean(installmentInfo) &&
                            baseItem.isOriginal &&
                            !isOriginallyCorrect &&
                            nonOriginalStatuses.length === 0;
                          const isStillWrong =
                            !isOriginallyCorrect &&
                            !isPendingSet &&
                            (!latestTreasureStatus || !latestTreasureStatus.isCorrect);

                          return (
                            <tr key={baseQ.id || qIndex} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 text-center font-black text-slate-700 bg-slate-50/50">
                                {baseQ.question_number ?? qIndex + 1}번
                              </td>

                              {roundStatuses.map((st, sIdx) => {
                                if (!st || !st.exists) {
                                  return (
                                    <td key={sIdx} className="p-3 text-center text-slate-300 border-l border-slate-100 font-bold">
                                      -
                                    </td>
                                  );
                                }
                                if (!st.solved) {
                                  return (
                                    <td key={sIdx} className="p-3 text-center text-slate-400 border-l border-slate-100">
                                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded">미응시</span>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={sIdx} className="p-3 text-center border-l border-slate-100">
                                    <div className="flex flex-col items-center gap-0.5">
                                      {st.isCorrect ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-black bg-emerald-100 px-2 py-0.5 rounded-full text-[11px]">
                                          <CheckCircle2 size={12} />
                                          정답
                                        </span>
                                      ) : st.isUnknown ? (
                                        <span className="inline-flex items-center gap-1 text-amber-700 font-black bg-amber-100 px-2 py-0.5 rounded-full text-[11px]">
                                          <HelpCircle size={12} />
                                          모름
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-rose-700 font-black bg-rose-100 px-2 py-0.5 rounded-full text-[11px]">
                                          <XCircle size={12} />
                                          오답
                                        </span>
                                      )}
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {st.sec > 0 ? (
                                          `${st.sec}초 소요`
                                        ) : (
                                          <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded font-sans">
                                            지필 채점
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                );
                              })}

                              <td className="p-3 text-center border-l border-slate-100">
                                {isRecovered ? (
                                  <span className="inline-flex items-center gap-1 text-amber-900 bg-amber-100 border border-amber-300 font-black px-2.5 py-1 rounded-xl text-[11px] shadow-2xs animate-pulse">
                                    <Sparkles size={11} className="fill-amber-500 text-amber-500" />
                                    💎 회수 완료!
                                  </span>
                                ) : isPendingSet ? (
                                  <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 font-bold px-2 py-0.5 rounded-lg text-[10px]">
                                    ⏳ 세트 대기 중
                                  </span>
                                ) : isStillWrong ? (
                                  <span className="inline-flex items-center gap-1 text-rose-800 bg-rose-100/80 font-black px-2 py-0.5 rounded-lg text-[10px]">
                                    🔄 추가 회수 필요
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded">
                                    ✓ 최초 정답
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ===================== [B] 단일 선택 회차 상세 뷰 ===================== */
            <div className="space-y-6">
              {/* 회차 타임어택 & 문항별 소요시간 비주얼 차트 카드 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 차트 1: 타임어택 제한 시간 vs 실사용 시간 게이지 */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={13} className="text-violet-600" />
                        타임어택 현황
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-violet-100 text-violet-800">
                        {selectedChainItem.roundLabel}
                      </span>
                    </div>

                    <div className="space-y-3 mt-4">
                      {/* 제한 시간 */}
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-bold">설정 제한 시간</span>
                        <span className="text-sm font-black text-slate-800">
                          {selectedChainItem.durationMin > 0 ? `${selectedChainItem.durationMin}분` : '자율 (무제한)'}
                        </span>
                      </div>

                      {/* 실제 사용 시간 */}
                      <div className="p-3 bg-violet-50/60 rounded-2xl border border-violet-100 flex items-center justify-between">
                        <span className="text-xs text-violet-900 font-bold">실제 총 소요 시간</span>
                        <span className="text-base font-black text-violet-700 font-mono">
                          {selectedChainItem.totalSpentSec > 0 ? (
                            formatDuration(selectedChainItem.totalSpentSec)
                          ) : (
                            <span className="text-xs text-slate-400 font-sans font-bold">
                              📝 지필 채점 (시간 미측정)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* 남은 시간 or 시간 효율 */}
                      {selectedChainItem.durationMin > 0 && (
                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                          <span className="text-xs text-emerald-900 font-bold">남은 시간 (여유 완주)</span>
                          <span className="text-sm font-black text-emerald-700 font-mono">
                            {selectedChainItem.totalSpentSec > 0 ? (
                              formatDuration(
                                Math.max(0, selectedChainItem.durationMin * 60 - selectedChainItem.totalSpentSec)
                              )
                            ) : (
                              <span className="text-xs text-slate-400 font-sans font-medium">
                                - (지필 수동 채점)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-medium text-center">
                    {currentQuestionsWithStats.totalSec > 0 ? (
                      <>
                        문항당 평균 소요: <strong className="text-slate-700 font-black">{currentQuestionsWithStats.avgSec}초</strong>
                      </>
                    ) : (
                      <span className="text-slate-400 font-bold">지필 시험지로 문항별 시간 기록이 없습니다</span>
                    )}
                  </div>
                </div>

                {/* 차트 2: 문항별 풀이 소요 시간 (초) 바 히스토그램 (선생님 채점 스마트 폴백) */}
                <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <BarChart2 size={15} className="text-violet-600" />
                        <span className="text-sm font-black text-slate-800">문항별 풀이 소요 시간 (초)</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {currentQuestionsWithStats.totalSec > 0
                          ? `점선: 평균 ${currentQuestionsWithStats.avgSec}초`
                          : '지필 평가 안내'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">
                      {currentQuestionsWithStats.totalSec > 0 ? (
                        <>
                          평균 대비 1.5배 이상 걸린 문항은 <span className="text-amber-600 font-bold">시간 지체(취약)</span>로 표시됩니다
                        </>
                      ) : (
                        '선생님 수동 채점 회차는 지필 평가로 진행되어 실시간 소요 시간이 측정되지 않습니다'
                      )}
                    </p>

                    {/* 막대 차트 영역 (시간 미측정 시 우아한 대체 카드) */}
                    {currentQuestionsWithStats.totalSec > 0 ? (
                      <div className="relative pt-4 pb-2">
                        {/* 평균 기준선 (가로 점선) */}
                        <div className="h-32 flex items-end gap-2 sm:gap-3 px-2 border-b border-slate-200 relative">
                          {/* 평균 점선 라인 */}
                          {currentQuestionsWithStats.maxSec > 0 && (
                            <div
                              className="absolute left-0 right-0 border-b-2 border-dashed border-violet-300 pointer-events-none z-10"
                              style={{
                                bottom: `${Math.min(
                                  95,
                                  (currentQuestionsWithStats.avgSec / currentQuestionsWithStats.maxSec) * 100
                                )}%`,
                              }}
                            >
                              <span className="absolute right-1 -top-4 text-[9px] font-bold text-violet-600 bg-violet-50 px-1 rounded">
                                평균 {currentQuestionsWithStats.avgSec}s
                              </span>
                            </div>
                          )}

                          {currentQuestionsWithStats.items.map((it) => {
                            const barHeight =
                              currentQuestionsWithStats.maxSec > 0
                                ? Math.max(10, Math.min(100, (it.spentSec / currentQuestionsWithStats.maxSec) * 100))
                                : 10;
                            const isSlow = it.spentSec > currentQuestionsWithStats.avgSec * 1.5;

                            return (
                              <div key={it.q.id} className="flex-1 flex flex-col items-center h-full justify-end group">
                                <span className="text-[10px] font-mono font-bold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {it.spentSec}s
                                </span>
                                <div
                                  className={`w-full max-w-[36px] rounded-t-lg transition-all duration-500 relative ${
                                    !it.isCorrect
                                      ? 'bg-rose-400 group-hover:bg-rose-500'
                                      : isSlow
                                      ? 'bg-amber-400 group-hover:bg-amber-500'
                                      : 'bg-emerald-400 group-hover:bg-emerald-500'
                                  }`}
                                  style={{ height: `${barHeight}%` }}
                                  title={`${it.idx + 1}번 문항: ${it.spentSec}초 소요 (${it.isCorrect ? '정답' : '오답'})`}
                                >
                                  {isSlow && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-black text-amber-600">
                                      ⚠️
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[11px] font-black mt-1.5 ${
                                    it.isCorrect ? 'text-slate-700' : 'text-rose-600'
                                  }`}
                                >
                                  {it.idx + 1}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 flex flex-col items-center justify-center text-center p-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1.5">
                          <Clock size={16} />
                        </div>
                        <p className="text-xs font-black text-slate-700">지필 평가 응시 회차 (시간 미측정)</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">
                          선생님께서 직접 채점하신 지필 평가 시험지는 문항별 실시간 소요 시간이 기록되지 않습니다.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-4 pt-3 text-[11px] text-slate-500 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                      정답 (안정)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                      시간 지체 (주의)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
                      오답 (재복습 대상)
                    </span>
                  </div>
                </div>
              </div>

              {/* 문항별 상세 풀이 카드 리스트 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-800">
                      📝 {selectedChainItem.roundLabel} 문항별 풀이 결과
                    </h3>
                    <span className="text-xs text-slate-400 font-bold">
                      ({selectedChainItem.isInstallmentRound ? '실제 출제 ' : '총 '}
                      {currentQuestionsWithStats.items.length}문항 중 {selectedChainItem.correctCount}문항 정답)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    문항을 클릭하여 큰 이미지로 확인하거나, 채점 결과를 직접 수정할 수 있습니다
                  </span>
                </div>

                <div
                  className={`grid grid-cols-1 md:grid-cols-2 ${
                    isExpandedLayout ? 'xl:grid-cols-3' : ''
                  } gap-4`}
                >
                  {currentQuestionsWithStats.items.map(({ q, idx, ansInfo, spentSec, isCorrect, isUnknown, userAns, isRecall, recallOriginSet }) => {
                    const correctAns = ansInfo?.correct_answer || q.answer || '';
                    const isSlow = spentSec > currentQuestionsWithStats.avgSec * 1.5;
                    const isFast = spentSec > 0 && spentSec < currentQuestionsWithStats.avgSec * 0.7;

                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-3xl border transition-all ${
                          isCorrect
                            ? 'bg-white border-emerald-200/90 hover:border-emerald-300 shadow-2xs'
                            : isUnknown
                            ? 'bg-amber-50/30 border-amber-200 hover:border-amber-300 shadow-2xs'
                            : 'bg-rose-50/30 border-rose-200 hover:border-rose-300 shadow-2xs'
                        }`}
                      >
                        {/* 문항 상단 뱃지 라인 */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center text-white shadow-2xs ${
                                isCorrect
                                  ? 'bg-emerald-500'
                                  : isUnknown
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span
                              className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                                isCorrect
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isUnknown
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isCorrect ? '맞음 ⭕' : isUnknown ? '모름 ❓' : '틀림 ❌'}
                            </span>

                            {selectedChainItem.isInstallmentRound && (
                              isRecall ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                  🔄 기억소환{typeof recallOriginSet === 'number' ? ` (세트${recallOriginSet + 1})` : ''}
                                </span>
                              ) : typeof selectedChainItem.setIndex === 'number' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  핵심 (세트{selectedChainItem.setIndex + 1})
                                </span>
                              ) : null
                            )}

                            {/* 문항별 소요시간 & 속도 평가 뱃지 (시간 미측정 스마트 폴백) */}
                            {spentSec > 0 ? (
                              <span
                                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                  isSlow
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : isFast
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                <Clock size={11} />
                                {spentSec}초
                                {isSlow && <span className="text-[10px] text-amber-600 font-black">[지체]</span>}
                                {isFast && <span className="text-[10px] text-emerald-600 font-black">[빠름⚡]</span>}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-1">
                                📝 지필 채점
                              </span>
                            )}
                          </div>

                          {/* 해설 보기 및 채점 토글 버튼 */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {q.solution_drive_id && onOpenSolutionModal && (
                              <button
                                type="button"
                                onClick={() => onOpenSolutionModal(q.solution_drive_id!)}
                                className="px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 font-black text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                title="이 문항의 정답 및 상세 해설 보기"
                              >
                                <BookOpen size={12} />
                                <span>해설</span>
                              </button>
                            )}

                            {onOverrideGrade && (
                              <button
                                type="button"
                                onClick={() => handleToggleGrade(q.id, isCorrect)}
                                disabled={overridingQuestionId === q.id}
                                className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                                  isCorrect
                                    ? 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200 hover:border-rose-300'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                                }`}
                                title={isCorrect ? '이 문항을 [오답]으로 변경합니다' : '이 문항을 [정답]으로 인정합니다'}
                              >
                                {overridingQuestionId === q.id ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin" />
                                    <span>반영 중</span>
                                  </>
                                ) : isCorrect ? (
                                  <>
                                    <span>❌</span>
                                    <span>오답 변경</span>
                                  </>
                                ) : (
                                  <>
                                    <span>⭕</span>
                                    <span>정답 인정</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 문제 이미지 미리보기 */}
                        {q.image_url && (
                          <div
                            className="bg-white p-2 rounded-2xl border border-slate-100 mb-3 max-h-36 overflow-hidden flex justify-center cursor-pointer hover:border-violet-300 transition-colors relative group"
                            onClick={() => onPreviewQuestion && onPreviewQuestion(q)}
                            title="클릭하여 문제 크게 보기"
                          >
                            <img
                              src={q.image_url}
                              alt={`문제 ${idx + 1}번`}
                              className="max-h-32 object-contain"
                            />
                            <div className="absolute top-2 right-2 bg-black/60 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Maximize2 size={12} />
                            </div>
                          </div>
                        )}

                        {/* 풀이과정 사진 인증이 있는 경우 */}
                        {ansInfo?.proof_image_url && (
                          <div className="mb-3 p-2 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between">
                            <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                              <Camera size={12} className="text-indigo-600" />
                              풀이과정 사진 인증 제출됨
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setViewProofModal({
                                  url: ansInfo.proof_image_url!,
                                  title: `${idx + 1}번 문항 풀이과정 사진`,
                                })
                              }
                              className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                            >
                              사진 보기
                            </button>
                          </div>
                        )}

                        {/* 학생 답안 vs 실제 정답 비교 박스 */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                            <span className="text-slate-400 block text-[10px] font-bold">학생 답안</span>
                            <span
                              className={`font-black text-sm block mt-0.5 ${
                                isCorrect ? 'text-emerald-600' : isUnknown ? 'text-amber-600' : 'text-rose-600'
                              }`}
                            >
                              {Array.isArray(q.choices) && q.choices.length === 5 && /^[1-5]$/.test(String(userAns || '').trim()) ? (
                                <span className="inline-flex items-start gap-1 whitespace-normal break-words text-xs">
                                  <span>{getCircledSymbol(userAns)}</span>
                                  <ChoiceTextRenderer text={q.choices[Number(String(userAns).trim()) - 1]} />
                                </span>
                              ) : (
                                userAns
                              )}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                            <span className="text-slate-400 block text-[10px] font-bold">실제 정답</span>
                            <span className="font-black text-sm text-slate-800 block mt-0.5">
                              {Array.isArray(q.choices) && q.choices.length === 5 && /^[1-5]$/.test(String(correctAns || '').trim()) ? (
                                <span className="inline-flex items-start gap-1 whitespace-normal break-words text-xs">
                                  <span>{getCircledSymbol(correctAns)}</span>
                                  <ChoiceTextRenderer text={q.choices[Number(String(correctAns).trim()) - 1]} />
                                </span>
                              ) : (
                                correctAns || '(미등록)'
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======================= 5. 모달 하단 닫기 바 ======================= */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="text-xs text-slate-400 font-medium">
            💡 보물회수는 오답을 완벽히 정복할 때까지 타임어택으로 집중 훈련하는 시스템입니다.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-xs font-black text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer border border-slate-200"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 풀이 사진 확대 모달 */}
      {viewProofModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setViewProofModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-black text-slate-800 text-sm">{viewProofModal.title}</h4>
              <button
                type="button"
                onClick={() => setViewProofModal(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto py-3 flex items-center justify-center">
              <img
                src={viewProofModal.url}
                alt={viewProofModal.title}
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
      {/* 템플릿 연동 도움말 모달 (목업 이미지 포함) */}
      {showLinkHelpModal && (
        <TreasureTemplateLinkHelpModal onClose={() => setShowLinkHelpModal(false)} />
      )}
    </div>
  );
}
