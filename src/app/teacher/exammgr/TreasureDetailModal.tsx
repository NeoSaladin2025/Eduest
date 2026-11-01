'use client';

import React, { useState, useMemo } from 'react';
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
  AlertTriangle,
  Loader2,
  Zap,
  Target
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { parseExamRoundAndBaseTitle } from './treasureTypes';

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
}

interface TreasureDetailModalProps {
  student: Student;
  initialExam: ExamPaper;
  initialSubmission: any;
  allExams: ExamPaper[];
  allSubmissions: any[];
  onClose: () => void;
  onCreateWrongExam: (student: Student, sub: any, exam?: ExamPaper) => void;
  isCreatingWrongExam?: boolean;
  onOverrideGrade?: (studentId: string, examId: string, questionId: string, nextIsCorrect: boolean) => Promise<any>;
  onOpenSolutionModal?: (solutionDriveId: string) => void;
  onPreviewQuestion?: (question: ExamQuestion) => void;
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
}: TreasureDetailModalProps) {
  // 1. 체인 탐색: 동일 base_exam_title을 공유하거나 부모-자식으로 연결된 이 학생의 모든 회차 시험지 정렬
  const roundChain: ChainRoundItem[] = useMemo(() => {
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

    // 각 시험지의 회차 번호 및 메타데이터 계산 (다회차 round_history 완벽 지원)
    const items: ChainRoundItem[] = [];

    matchedExams.forEach((ex) => {
      const parsed = parseExamRoundAndBaseTitle(ex.title);
      const isTreasure = Boolean(ex.is_treasure_hunt || parsed.isTreasure);
      const isWrong = Boolean(ex.is_wrong_review || parsed.isWrong);
      const isTwin = Boolean(
        ex.is_twin_variant ||
          parsed.isTwin ||
          (Array.isArray(ex.questions) && ex.questions.some((q: any) => q.is_twin))
      );

      let roundNum = ex.wrong_round ?? parsed.currentRound;
      const isOriginal = !isWrong && !isTreasure && roundNum === 0;

      const sub = allSubmissions.find(
        (s) => s.student_id === student.id && s.exam_id === ex.id
      ) || (ex.id === initialExam.id ? initialSubmission : null);

      // 🌟 만약 submission에 round_history가 2개 이상 들어있다면, 각 회차를 별도 탭 아이템으로 펼쳐서 비교 제공!
      if (Array.isArray(sub?.round_history) && sub.round_history.length > 1) {
        sub.round_history.forEach((h: any) => {
          const rNumber = Number(h.round) || 1;
          const rLabel = isTreasure
            ? `보물회수 ${rNumber}회차${isTwin ? ' (쌍둥이)' : ''}`
            : `오답 ${rNumber}회차${isTwin ? ' (쌍둥이)' : ''}`;

          const virtualSub = {
            ...sub,
            score: h.score,
            correct_count: h.correct_count,
            total_questions: h.total_questions || ex.questions?.length || 0,
            submitted_at: h.submitted_at,
            answers: h.answers,
          };

          items.push({
            keyId: `${ex.id}_r${rNumber}`,
            exam: ex,
            round: rNumber,
            roundLabel: rLabel,
            isOriginal: false,
            isTreasure: isTreasure,
            isTwin: isTwin,
            durationMin: Number(ex.duration_min) || 0,
            submission: virtualSub,
            totalSpentSec: Number(h.total_spent_sec) || 0,
            score: h.score !== undefined ? Number(h.score) : null,
            correctCount: Number(h.correct_count) || 0,
            totalQuestions: ex.questions?.length || 0,
            submittedAt: h.submitted_at || null,
          });
        });
      } else {
        let roundLabel = '';
        if (isOriginal) {
          roundLabel = '원본 시험';
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
          durationMin: Number(ex.duration_min) || 0,
          submission: sub,
          totalSpentSec: spentSec,
          score: sub ? Number(sub.score) : null,
          correctCount: sub ? Number(sub.correct_count) || 0 : 0,
          totalQuestions: ex.questions?.length || 0,
          submittedAt: sub?.submitted_at || null,
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
      let spentSec = 0;
      if (initialSubmission?.answers) {
        Object.values(initialSubmission.answers).forEach((ans: any) => {
          spentSec += Number(ans?.time_spent_sec) || 0;
        });
      }
      list.push({
        keyId: initialExam.id,
        exam: initialExam,
        round: initialExam.wrong_round ?? parsed.currentRound ?? 1,
        roundLabel: parsed.isTreasure
          ? `보물회수 ${parsed.currentRound || 1}회차`
          : '보물회수 1회차',
        isOriginal: false,
        isTreasure: true,
        isTwin: Boolean(initialExam.is_twin_variant || parsed.isTwin),
        durationMin: Number(initialExam.duration_min) || 0,
        submission: initialSubmission,
        totalSpentSec: spentSec,
        score: initialSubmission ? Number(initialSubmission.score) : null,
        correctCount: initialSubmission ? Number(initialSubmission.correct_count) || 0 : 0,
        totalQuestions: initialExam.questions?.length || 0,
        submittedAt: initialSubmission?.submitted_at || null,
      });
      list.sort((a, b) => a.round - b.round);
    }

    return list;
  }, [allExams, allSubmissions, initialExam, initialSubmission, student.id]);

  // 현재 활성화된 탭 (특정 회차 keyId 또는 'matrix' 전체 비교 뷰)
  const [activeTab, setActiveTab] = useState<string>(() => {
    return roundChain[roundChain.length - 1]?.keyId || initialExam.id;
  });

  // 현재 선택된 회차 정보
  const selectedChainItem = useMemo(() => {
    return (
      roundChain.find((c) => c.keyId === activeTab || c.exam.id === activeTab) ||
      roundChain[roundChain.length - 1]
    );
  }, [roundChain, activeTab]);

  // 로컬 채점 수정 중인 문항 ID
  const [overridingQuestionId, setOverridingQuestionId] = useState<string | null>(null);

  // 로컬 상태 동기화용 submission 맵 (수정 시 실시간 UI 반영)
  const [localSubmissions, setLocalSubmissions] = useState<Record<string, any>>({});

  const currentSubmission = useMemo(() => {
    if (selectedChainItem?.exam.id && localSubmissions[selectedChainItem.exam.id]) {
      return localSubmissions[selectedChainItem.exam.id];
    }
    return selectedChainItem?.submission || null;
  }, [selectedChainItem, localSubmissions]);

  // 풀이 사진 모달 상태
  const [viewProofModal, setViewProofModal] = useState<{ url: string; title: string } | null>(null);

  // KPI 요약 지표 계산
  const kpiStats = useMemo(() => {
    const originalItem = roundChain.find((c) => c.isOriginal) || roundChain[0];
    const latestItem = roundChain[roundChain.length - 1];

    const firstScore = originalItem?.score ?? 0;
    const latestScore = latestItem?.score ?? 0;
    const scoreDiff = latestScore - firstScore;

    const firstSpent = originalItem?.totalSpentSec ?? 0;
    const latestSpent = latestItem?.totalSpentSec ?? 0;
    const timeDiff = firstSpent - latestSpent; // 양수면 단축됨

    const completedRounds = roundChain.filter((c) => c.submission !== null).length;

    // 최종 회수율: 최신 회차의 정답률
    const recoveryRate =
      latestItem?.totalQuestions > 0
        ? Math.round((latestItem.correctCount / latestItem.totalQuestions) * 100)
        : 0;

    return {
      firstScore,
      latestScore,
      scoreDiff,
      firstSpent,
      latestSpent,
      timeDiff,
      completedRounds,
      totalRounds: roundChain.length,
      recoveryRate,
      isPerfect: recoveryRate === 100,
    };
  }, [roundChain]);

  // 현재 선택된 회차의 문항별 시간 통계 및 평균
  const currentQuestionsWithStats = useMemo(() => {
    if (!selectedChainItem?.exam?.questions) {
      return {
        items: [],
        totalSec: 0,
        avgSec: 0,
        maxSec: 1,
      };
    }
    const questions = selectedChainItem.exam.questions;
    const answers = currentSubmission?.answers || {};

    const items = questions.map((q, idx) => {
      const ansInfo = answers[q.id];
      const spentSec = Number(ansInfo?.time_spent_sec) || 0;
      const isCorrect = ansInfo?.is_correct ?? false;
      const userAns = ansInfo?.user_answer || '(미입력)';
      const isUnknown = userAns === '모름' || userAns === 'unknown';
      return {
        q,
        idx,
        ansInfo,
        spentSec,
        isCorrect,
        isUnknown,
        userAns,
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

  // 채점 수동 수정 핸들러
  const handleToggleGrade = async (questionId: string, currentIsCorrect: boolean) => {
    if (!onOverrideGrade || !selectedChainItem) return;
    try {
      setOverridingQuestionId(questionId);
      const updatedSub = await onOverrideGrade(
        student.id,
        selectedChainItem.exam.id,
        questionId,
        !currentIsCorrect
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

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* ======================= 1. 상단 모달 헤더 ======================= */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shadow-md shadow-amber-500/20 text-white">
              <Sparkles size={20} className="fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-2">
            {/* 다음 보물회수 생성 버튼 */}
            <button
              type="button"
              onClick={() => {
                const subToUse = currentSubmission || initialSubmission;
                const examToUse = selectedChainItem?.exam || initialExam;
                onCreateWrongExam(student, subToUse, examToUse);
              }}
              disabled={isCreatingWrongExam}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="이 회차의 오답 문항으로 다음 회차 보물회수 시험지를 즉시 생성합니다"
            >
              <RotateCcw size={14} className={isCreatingWrongExam ? 'animate-spin' : ''} />
              <span>{isCreatingWrongExam ? '생성 중...' : '💎 다음 보물회수 생성'}</span>
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
          {/* 회차 완주 현황 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Layers size={12} className="text-indigo-500" />
              진행 회차
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-slate-800">
                {kpiStats.completedRounds}
              </span>
              <span className="text-xs font-bold text-slate-400">
                / {kpiStats.totalRounds}회차 완주
              </span>
            </div>
            <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5">
              {roundChain.length > 1 ? '연속 복습 코스 진행 중' : '단일 회차 응시 완료'}
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

          {/* 소요 시간 단축량 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Clock size={12} className="text-amber-500" />
              타임어택 단축량
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-slate-800">
                {formatDuration(kpiStats.latestSpent)}
              </span>
              {roundChain.length > 1 && kpiStats.firstSpent > 0 && (
                <span
                  className={`text-xs font-black px-1.5 py-0.2 rounded ${
                    kpiStats.timeDiff > 0
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {kpiStats.timeDiff > 0 ? `-${formatDuration(kpiStats.timeDiff)} 단축` : '+시간 증가'}
                </span>
              )}
            </div>
            <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
              제한시간 대비 여유 완주
            </span>
          </div>

          {/* 오답 보물회수율 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
              <Sparkles size={12} className="text-rose-500 fill-rose-500" />
              오답 회수 성공률
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-emerald-600">
                {kpiStats.recoveryRate}%
              </span>
              {kpiStats.isPerfect && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded-full">
                  ALL CLEAR 💎
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {kpiStats.recoveryRate === 100 ? '모든 오답 정복 완료!' : '미회수 오답 추가 보물회수 권장'}
            </span>
          </div>
        </div>

        {/* ======================= 3. 회차 선택 네비게이션 탭 ======================= */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <Target size={13} className="text-violet-600" />
              회차 선택:
            </span>
            {roundChain.map((item) => {
              const isActive = activeTab === item.keyId;
              const hasSub = item.submission !== null;
              return (
                <button
                  key={item.keyId}
                  type="button"
                  onClick={() => setActiveTab(item.keyId)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
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
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeTab === 'matrix'
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25 scale-[1.02]'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
                }`}
              >
                <BarChart2 size={13} className="text-amber-400" />
                <span>📈 회차별 통합 비교 뷰</span>
              </button>
            )}
          </div>

          {/* 우측 간단한 회차 정보 표시 */}
          {selectedChainItem && activeTab !== 'matrix' && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1 font-bold text-slate-600">
                <Clock size={13} className="text-violet-600" />
                제한: {selectedChainItem.durationMin > 0 ? `${selectedChainItem.durationMin}분` : '자율'}
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1 font-bold text-slate-600">
                <Zap size={13} className="text-amber-500" />
                사용: {formatDuration(selectedChainItem.totalSpentSec)}
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

        {/* ======================= 4. 본문 스크롤 영역 ======================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50">
          {/* ===================== [A] 회차별 통합 비교 뷰 (Matrix 모드) ===================== */}
          {activeTab === 'matrix' ? (
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
                      <div key={it.exam.id} className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/60">
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
                          <th key={r.exam.id} className="p-3 text-center border-l border-slate-200">
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
                      {/* 원본 시험지(또는 첫 회차)의 문항 수를 기준으로 비교 매트릭스 생성 */}
                      {Array.from({
                        length: Math.max(...roundChain.map((r) => r.exam.questions?.length || 0), 1),
                      }).map((_, qIndex) => {
                        // 각 회차별 해당 번호의 정답 여부 및 소요시간 수집
                        const roundStatuses = roundChain.map((r) => {
                          const q = r.exam.questions?.[qIndex];
                          if (!q) return null;
                          const ans = r.submission?.answers?.[q.id];
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
                        const latestStatus = roundStatuses[roundStatuses.length - 1];
                        const isRecovered =
                          firstStatus && !firstStatus.isCorrect && latestStatus && latestStatus.isCorrect;
                        const isStillWrong = latestStatus && !latestStatus.isCorrect;

                        return (
                          <tr key={qIndex} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-center font-black text-slate-700 bg-slate-50/50">
                              {qIndex + 1}번
                            </td>

                            {roundStatuses.map((st, sIdx) => {
                              if (!st || !st.exists) {
                                return (
                                  <td key={sIdx} className="p-3 text-center text-slate-300 border-l border-slate-100">
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
                                      {st.sec}초 소요
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
                      })}
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
                          {formatDuration(selectedChainItem.totalSpentSec)}
                        </span>
                      </div>

                      {/* 남은 시간 or 시간 효율 */}
                      {selectedChainItem.durationMin > 0 && (
                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                          <span className="text-xs text-emerald-900 font-bold">남은 시간 (여유 완주)</span>
                          <span className="text-sm font-black text-emerald-700 font-mono">
                            {formatDuration(
                              Math.max(0, selectedChainItem.durationMin * 60 - selectedChainItem.totalSpentSec)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-medium text-center">
                    문항당 평균 소요: <strong className="text-slate-700 font-black">{currentQuestionsWithStats.avgSec}초</strong>
                  </div>
                </div>

                {/* 차트 2: 문항별 풀이 소요 시간 (초) 바 히스토그램 */}
                <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <BarChart2 size={15} className="text-violet-600" />
                        <span className="text-sm font-black text-slate-800">문항별 풀이 소요 시간 (초)</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        점선: 평균 {currentQuestionsWithStats.avgSec}초
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">
                      평균 대비 1.5배 이상 걸린 문항은 <span className="text-amber-600 font-bold">시간 지체(취약)</span>로 표시됩니다
                    </p>

                    {/* 막대 차트 영역 */}
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
                      (총 {selectedChainItem.totalQuestions}문항 중 {selectedChainItem.correctCount}문항 정답)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    문항을 클릭하여 큰 이미지로 확인하거나, 채점 결과를 직접 수정할 수 있습니다
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentQuestionsWithStats.items.map(({ q, idx, ansInfo, spentSec, isCorrect, isUnknown, userAns }) => {
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

                            {/* 문항별 소요시간 & 속도 평가 뱃지 */}
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
                              {userAns}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                            <span className="text-slate-400 block text-[10px] font-bold">실제 정답</span>
                            <span className="font-black text-sm text-slate-800 block mt-0.5">
                              {correctAns || '(미등록)'}
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
    </div>
  );
}
