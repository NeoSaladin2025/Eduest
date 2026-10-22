'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  BarChart3, 
  TrendingUp, 
  Award, 
  Clock, 
  Calendar, 
  Search, 
  Copy, 
  Check, 
  RotateCcw, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  SlidersHorizontal,
  Loader2,
  Sparkles,
  Info,
  HelpCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FilterChipBadge, { FilterChip } from '@/app/teacher/exammgr/FilterChipBadge';

export interface PerformanceStudent {
  id: string;
  name: string;
  grade: string;
  school?: string;
  unlocked_folders?: string[];
}

interface ExamPaperLite {
  id: string;
  title: string;
  grade: string;
  duration_min: number;
  filter_chip_ids?: string[];
  created_at: string;
  questions?: any[];
}

interface StudentSubmissionLite {
  id: string;
  exam_id: string;
  student_id: string;
  score: number;
  total_points: number;
  correct_count: number;
  wrong_count: number;
  submitted_at: string;
  duration_seconds?: number;
  answers?: Record<string, any> | any[];
}

interface QuestionResultItem {
  id: string;
  number: number;
  userAnswer: string;
  isCorrect: boolean;
  isUnknown: boolean;
  correctAnswer: string;
  points?: number;
  timeSpentSec?: number;
  imageUrl?: string;
  name?: string;
}

// 🛡️ 제출 답안이 객체(Record)든 배열(Array)이든 안전하게 파싱하여 문항별 정오표 생성
function extractQuestionResults(item: EnrichedSubmission): QuestionResultItem[] {
  const sub = item.submission;
  const exam = item.exam;
  const rawAnswers = sub?.answers;

  // 1. exam.questions가 있을 경우 시험 문항 순서대로 매핑
  if (exam && Array.isArray(exam.questions) && exam.questions.length > 0) {
    return exam.questions.map((q: any, idx: number) => {
      let ansInfo: any = null;
      if (rawAnswers) {
        if (typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
          ansInfo = rawAnswers[q.id];
        } else if (Array.isArray(rawAnswers)) {
          ansInfo = rawAnswers.find((a: any) => a.question_id === q.id || a.id === q.id);
        }
      }

      const userAns = ansInfo?.user_answer ? String(ansInfo.user_answer).trim() : '(미입력)';
      const isCorrect = ansInfo?.is_correct ?? false;
      const isUnknown = userAns === '모름' || userAns === 'unknown';
      const correctAns = ansInfo?.correct_answer || q.answer || '';

      return {
        id: q.id || `q_${idx + 1}`,
        number: idx + 1,
        userAnswer: userAns,
        isCorrect,
        isUnknown,
        correctAnswer: correctAns,
        points: typeof q.points === 'number' ? q.points : ansInfo?.points,
        timeSpentSec: ansInfo?.time_spent_sec,
        imageUrl: q.image_url,
        name: q.name || q.display_name,
      };
    });
  }

  // 2. exam.questions는 없지만 rawAnswers가 객체(Record)인 경우
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    return Object.entries(rawAnswers).map(([qid, val]: [string, any], idx) => {
      const userAns = val?.user_answer ? String(val.user_answer).trim() : '(미입력)';
      const isCorrect = val?.is_correct ?? false;
      const isUnknown = userAns === '모름' || userAns === 'unknown';
      return {
        id: qid,
        number: idx + 1,
        userAnswer: userAns,
        isCorrect,
        isUnknown,
        correctAnswer: val?.correct_answer || '',
        points: val?.points,
        timeSpentSec: val?.time_spent_sec,
      };
    });
  }

  // 3. rawAnswers가 배열인 경우
  if (rawAnswers && Array.isArray(rawAnswers)) {
    return rawAnswers.map((a: any, idx: number) => {
      const userAns = a?.user_answer ? String(a.user_answer).trim() : '(미입력)';
      const isCorrect = a?.is_correct ?? false;
      const isUnknown = userAns === '모름' || userAns === 'unknown';
      return {
        id: a.question_id || a.id || `q_${idx + 1}`,
        number: idx + 1,
        userAnswer: userAns,
        isCorrect,
        isUnknown,
        correctAnswer: a?.correct_answer || '',
        points: a?.points,
        timeSpentSec: a?.time_spent_sec,
      };
    });
  }

  return [];
}

interface EnrichedSubmission {
  submission: StudentSubmissionLite;
  exam: ExamPaperLite;
  scorePercent: number;
  formattedDate: string;
  durationMin: number;
}

interface StudentPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: PerformanceStudent | null;
  onOpenSubmissionDetail?: (exam: any, submission: any) => void;
}

export default function StudentPerformanceModal({
  isOpen,
  onClose,
  student,
  onOpenSubmissionDetail,
}: StudentPerformanceModalProps) {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamPaperLite[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmissionLite[]>([]);
  const [filterChips, setFilterChips] = useState<FilterChip[]>([]);

  // ── 필터 상태 ──
  const [selectedChipId, setSelectedChipId] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [dateRange, setDateRange] = useState<'ALL' | '1M' | '3M' | '6M'>('ALL');
  const [sortOrder, setSortOrder] = useState<'latest' | 'score_desc' | 'score_asc'>('latest');

  // 상세 모달 또는 상세 아코디언 상태
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // 문항 이미지 미리보기 모달 상태
  const [previewQuestion, setPreviewQuestion] = useState<{
    imageUrl?: string;
    number: number;
    title: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  } | null>(null);

  // 데이터 로드
  useEffect(() => {
    if (!isOpen || !student) return;

    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. 시험지 목록 로드
        const examPromise = supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', 'test2_exam_papers_data')
          .maybeSingle();

        // 2. 제출 기록 로드
        const subPromise = supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', 'test2_student_submissions_data')
          .maybeSingle();

        // 3. 필터칩 목록 로드
        const chipsPromise = fetch('/api/test2/filter-chips').then(r => r.json()).catch(() => ({ chips: [] }));

        const [examRes, subRes, chipsData] = await Promise.all([examPromise, subPromise, chipsPromise]);

        if (!isMounted) return;

        // 필터칩 세팅
        if (chipsData?.chips && Array.isArray(chipsData.chips)) {
          setFilterChips(chipsData.chips);
        }

        // 시험지 파싱
        let loadedExams: ExamPaperLite[] = [];
        if (examRes.data?.file_data) {
          try {
            const parsed = JSON.parse(examRes.data.file_data);
            loadedExams = Array.isArray(parsed.exams) ? parsed.exams : [];
          } catch (e) {
            console.error('Failed to parse exams in PerformanceModal:', e);
          }
        }
        setExams(loadedExams);

        // 제출 기록 파싱
        let loadedSubs: StudentSubmissionLite[] = [];
        if (subRes.data?.file_data) {
          try {
            const parsed = JSON.parse(subRes.data.file_data);
            const rawSubs: any[] = Array.isArray(parsed.submissions) ? parsed.submissions : [];
            // 현재 학생의 제출 기록만 필터링
            loadedSubs = rawSubs.filter((s: any) => s.student_id === student.id);
          } catch (e) {
            console.error('Failed to parse submissions in PerformanceModal:', e);
          }
        }
        setSubmissions(loadedSubs);

      } catch (err) {
        console.error('Failed to load performance data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, student]);

  // 필터 초기화
  const handleResetFilters = () => {
    setSelectedChipId('ALL');
    setSearchKeyword('');
    setDateRange('ALL');
    setSortOrder('latest');
  };

  // 학생의 전체 응시 기록과 시험지 매핑 (Enrichment)
  const enrichedSubmissions: EnrichedSubmission[] = useMemo(() => {
    if (!student || submissions.length === 0) return [];

    return submissions.map(sub => {
      const exam = exams.find(e => e.id === sub.exam_id) || {
        id: sub.exam_id,
        title: '삭제되었거나 미등록된 시험지',
        grade: student.grade,
        duration_min: 50,
        filter_chip_ids: [],
        created_at: sub.submitted_at || new Date().toISOString(),
      };

      const total = sub.total_points && sub.total_points > 0 ? sub.total_points : 100;
      const scorePercent = Math.round((sub.score / total) * 100);
      
      const dateObj = new Date(sub.submitted_at || exam.created_at);
      const formattedDate = isNaN(dateObj.getTime())
        ? '날짜 미상'
        : `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}`;

      const durationMin = sub.duration_seconds && sub.duration_seconds > 0 
        ? Math.round(sub.duration_seconds / 60) 
        : exam.duration_min;

      return {
        submission: sub,
        exam,
        scorePercent,
        formattedDate,
        durationMin,
      };
    });
  }, [submissions, exams, student]);

  // 학생이 응시한 시험에 부착되어 있는 필터칩 목록 및 건수 집계
  const availableChipsWithCount = useMemo(() => {
    const chipCountMap: Record<string, number> = {};
    let unclassifiedCount = 0;

    enrichedSubmissions.forEach(item => {
      const chipIds = item.exam.filter_chip_ids || [];
      if (chipIds.length === 0) {
        unclassifiedCount++;
      } else {
        chipIds.forEach(id => {
          chipCountMap[id] = (chipCountMap[id] || 0) + 1;
        });
      }
    });

    const list = filterChips
      .filter(chip => (chipCountMap[chip.id] || 0) > 0)
      .map(chip => ({
        ...chip,
        count: chipCountMap[chip.id] || 0,
      }));

    return {
      chips: list,
      unclassifiedCount,
    };
  }, [enrichedSubmissions, filterChips]);

  // 🌟 [핵심] 필터링 적용된 응시 기록 리스트
  const filteredSubmissions: EnrichedSubmission[] = useMemo(() => {
    let result = [...enrichedSubmissions];

    // 1. 필터칩 필터
    if (selectedChipId === '__UNCLASSIFIED__') {
      result = result.filter(item => !item.exam.filter_chip_ids || item.exam.filter_chip_ids.length === 0);
    } else if (selectedChipId !== 'ALL') {
      result = result.filter(item => item.exam.filter_chip_ids && item.exam.filter_chip_ids.includes(selectedChipId));
    }

    // 2. 검색어 필터 (시험지 제목)
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      result = result.filter(item => item.exam.title.toLowerCase().includes(q));
    }

    // 3. 기간 필터
    if (dateRange !== 'ALL') {
      const now = Date.now();
      const days = dateRange === '1M' ? 30 : dateRange === '3M' ? 90 : 180;
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      result = result.filter(item => {
        const t = new Date(item.submission.submitted_at || item.exam.created_at).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    // 4. 정렬
    result.sort((a, b) => {
      if (sortOrder === 'score_desc') return b.submission.score - a.submission.score;
      if (sortOrder === 'score_asc') return a.submission.score - b.submission.score;
      // latest (기본: 최신 응시일순)
      const dateA = new Date(a.submission.submitted_at || a.exam.created_at).getTime();
      const dateB = new Date(b.submission.submitted_at || b.exam.created_at).getTime();
      return dateB - dateA;
    });

    return result;
  }, [enrichedSubmissions, selectedChipId, searchKeyword, dateRange, sortOrder]);

  // 🌟 [핵심] 필터된 자료에 맞춘 실시간 동적 통계 지표 (Dynamic Reactive KPIs)
  const stats = useMemo(() => {
    const totalCount = filteredSubmissions.length;
    if (totalCount === 0) {
      return {
        count: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        avgDuration: 0,
        passRate: 0,
      };
    }

    const scores = filteredSubmissions.map(s => s.submission.score);
    const sumScore = scores.reduce((acc, cur) => acc + cur, 0);
    const avgScore = Math.round((sumScore / totalCount) * 10) / 10;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    const durations = filteredSubmissions.map(s => s.durationMin);
    const avgDuration = Math.round(durations.reduce((acc, cur) => acc + cur, 0) / totalCount);

    const passCount = scores.filter(sc => sc >= 80).length;
    const passRate = Math.round((passCount / totalCount) * 100);

    return {
      count: totalCount,
      avgScore,
      maxScore,
      minScore,
      avgDuration,
      passRate,
    };
  }, [filteredSubmissions]);

  // 성적 추이 그래프용 데이터 (시간 오름차순 정렬, 최대 10개)
  const trendData = useMemo(() => {
    const chronoSorted = [...filteredSubmissions].sort((a, b) => {
      const dateA = new Date(a.submission.submitted_at || a.exam.created_at).getTime();
      const dateB = new Date(b.submission.submitted_at || b.exam.created_at).getTime();
      return dateA - dateB;
    });
    // 최근 최대 10개
    return chronoSorted.slice(-10);
  }, [filteredSubmissions]);

  // 현재 필터 레이블 계산
  const currentFilterLabel = useMemo(() => {
    if (selectedChipId === 'ALL') return '전체 시험';
    if (selectedChipId === '__UNCLASSIFIED__') return '미분류 시험';
    const found = filterChips.find(c => c.id === selectedChipId);
    return found ? `${found.name} 분류` : '선택 분류';
  }, [selectedChipId, filterChips]);

  // 📋 학부모 상담용 요약 복사 생성기
  const handleCopyCounselingSummary = () => {
    if (!student || filteredSubmissions.length === 0) return;

    const recentExamsText = trendData
      .slice(-5)
      .reverse()
      .map((item, idx) => `  ${idx + 1}. [${item.exam.title}] : ${item.submission.score}점 (${item.formattedDate}, ${item.durationMin}분 소요)`)
      .join('\n');

    let feedback = '성실하게 모든 평가에 임하고 있으며 실전 감각이 안정적입니다.';
    if (stats.avgScore >= 90) {
      feedback = '최상위권 수준의 매우 탁월한 이해도와 문제해결력을 보이고 있습니다.';
    } else if (stats.avgScore >= 80) {
      feedback = '개념 완성이 우수하며, 고난도 킬러 문항 집중 훈련 시 추가 성적 상승이 기대됩니다.';
    } else {
      feedback = '단원별 핵심 유형 복습과 오답 클리닉을 병행하여 기초 체력을 다지는 중입니다.';
    }

    const text = `[Eduest 학생 성적 리포트 - ${currentFilterLabel}]
■ 학생명: ${student.name} (${student.grade}${student.school ? ` · ${student.school}` : ''})
■ 조회 기준: ${currentFilterLabel} (총 ${stats.count}회 응시)
■ 평균 점수: ${stats.avgScore}점 (최고 ${stats.maxScore}점 / 최저 ${stats.minScore}점)
■ 평균 소요시간: 약 ${stats.avgDuration}분 (80점 이상 달성률: ${stats.passRate}%)
■ 최근 응시 기록:
${recentExamsText}
■ 지도 총평: ${feedback}
(Eduest Smart Learning System)`;

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-5xl overflow-hidden flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 상단 헤더 */}
        <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>{student.name}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-lg bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-bold">
                    {student.grade}
                  </span>
                  {student.school && (
                    <span className="text-xs text-slate-300 font-medium">({student.school})</span>
                  )}
                </h2>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-400/30">
                  누적 성적 리포트
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                응시한 모든 시험 성적과 학습 성취도 추이를 다각도로 분석합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCounselingSummary}
              disabled={filteredSubmissions.length === 0}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                copiedSummary
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title="현재 조건에 맞춰 학부모 상담용 문자 텍스트를 복사합니다"
            >
              {copiedSummary ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedSummary ? '상담 요약 복사됨!' : '상담용 요약 복사'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              title="창 닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 2. 스마트 필터 컨트롤바 */}
        <div className="shrink-0 bg-slate-50/90 border-b border-slate-200/80 px-6 py-3.5 space-y-3">
          {/* 분류 필터칩 탭 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal size={13} />
              분류:
            </span>

            {/* 전체 칩 */}
            <button
              type="button"
              onClick={() => setSelectedChipId('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 ${
                selectedChipId === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>전체</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedChipId === 'ALL' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {enrichedSubmissions.length}
              </span>
            </button>

            {/* 등록된 필터칩들 */}
            {availableChipsWithCount.chips.map(chip => {
              const isSelected = selectedChipId === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedChipId(isSelected ? 'ALL' : chip.id)}
                  className={`shrink-0 transition-transform ${isSelected ? 'scale-105' : 'opacity-85 hover:opacity-100'}`}
                >
                  <FilterChipBadge
                    chip={chip}
                    size="sm"
                    isSelected={isSelected}
                    badgeCount={chip.count}
                  />
                </button>
              );
            })}

            {/* 미분류 칩 (미분류 시험이 존재할 경우) */}
            {availableChipsWithCount.unclassifiedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedChipId(selectedChipId === '__UNCLASSIFIED__' ? 'ALL' : '__UNCLASSIFIED__')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition-all ${
                  selectedChipId === '__UNCLASSIFIED__'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>🏷️ 미분류</span>
                <span className="ml-1 text-[10px] text-slate-400 font-bold">
                  ({availableChipsWithCount.unclassifiedCount})
                </span>
              </button>
            )}
          </div>

          {/* 검색어 & 기간 & 정렬 & 리셋 바 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="시험지 제목으로 검색..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium transition-all"
                />
                {searchKeyword && (
                  <button
                    onClick={() => setSearchKeyword('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* 기간 선택 */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
              >
                <option value="ALL">전체 기간</option>
                <option value="1M">최근 1개월</option>
                <option value="3M">최근 3개월</option>
                <option value="6M">최근 6개월</option>
              </select>

              {/* 정렬 선택 */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
              >
                <option value="latest">최신 응시순</option>
                <option value="score_desc">점수 높은순</option>
                <option value="score_asc">점수 낮은순</option>
              </select>
            </div>

            {/* 필터 활성화 상태 및 초기화 버튼 */}
            {(selectedChipId !== 'ALL' || searchKeyword || dateRange !== 'ALL' || sortOrder !== 'latest') && (
              <button
                onClick={handleResetFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                <RotateCcw size={12} />
                <span>필터 초기화</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. 모달 메인 콘텐츠 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Loader2 size={36} className="animate-spin text-indigo-500" />
              <p className="text-sm font-bold">학생 성적 데이터를 분석 중입니다...</p>
            </div>
          ) : enrichedSubmissions.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <FileText size={48} className="mx-auto text-slate-300" />
              <h3 className="text-base font-bold text-slate-700">응시 완료된 시험이 없습니다</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                학생에게 시험지를 배정하고 학생이 시험을 제출하면 이곳에 자동으로 성적 리포트가 누적됩니다.
              </p>
            </div>
          ) : (
            <>
              {/* 🌟 동적 지표 카드 4종 (필터 조건에 따라 실시간 갱신) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                  <span className="flex items-center gap-1.5 text-indigo-600">
                    <Sparkles size={14} />
                    <span><strong>{currentFilterLabel}</strong> 기준 성취도 지표 (총 {stats.count}건)</span>
                  </span>
                  {selectedChipId !== 'ALL' && (
                    <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-semibold border border-indigo-100">
                      필터 맞춤 실시간 계산 중
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {/* 카드 1: 응시 횟수 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">응시 횟수</p>
                      <p className="text-2xl font-black text-slate-800 tracking-tight">
                        {stats.count}<span className="text-xs font-bold text-slate-500 ml-1">회</span>
                      </p>
                    </div>
                  </div>

                  {/* 카드 2: 평균 점수 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">평균 점수</p>
                      <p className="text-2xl font-black text-emerald-600 tracking-tight">
                        {stats.avgScore}<span className="text-xs font-bold text-slate-500 ml-1">점</span>
                      </p>
                    </div>
                  </div>

                  {/* 카드 3: 최고 점수 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <Award size={20} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">최고 점수</p>
                      <p className="text-2xl font-black text-slate-800 tracking-tight">
                        {stats.maxScore}<span className="text-xs font-bold text-slate-500 ml-1">점</span>
                      </p>
                    </div>
                  </div>

                  {/* 카드 4: 평균 소요시간 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">평균 풀이 시간</p>
                      <p className="text-2xl font-black text-slate-800 tracking-tight">
                        {stats.avgDuration}<span className="text-xs font-bold text-slate-500 ml-1">분</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 🌟 성적 추이 그래프 (SVG 미니 라인 차트) */}
              {trendData.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-indigo-600" />
                      <h4 className="text-sm font-bold text-slate-800">
                        성적 추이 그래프 <span className="text-xs text-slate-400 font-normal">({currentFilterLabel} 기준 최근 {trendData.length}회)</span>
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                        점수
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-0.5 bg-emerald-500 border-t border-dashed"></span>
                        평균 ({stats.avgScore}점)
                      </span>
                    </div>
                  </div>

                  {/* SVG 꺾은선 렌더링 */}
                  <div className="w-full bg-slate-50/70 rounded-xl p-4 pt-6 border border-slate-100 overflow-x-auto">
                    <div className="min-w-[480px]">
                      {(() => {
                        const height = 140;
                        const width = 640;
                        const paddingX = 40;
                        const paddingY = 25;
                        const innerWidth = width - paddingX * 2;
                        const innerHeight = height - paddingY * 2;

                        const stepX = trendData.length > 1 ? innerWidth / (trendData.length - 1) : innerWidth / 2;

                        const points = trendData.map((d, i) => {
                          const x = paddingX + i * stepX;
                          // 0~100점 스케일
                          const clampedScore = Math.min(100, Math.max(0, d.submission.score));
                          const y = height - paddingY - (clampedScore / 100) * innerHeight;
                          return { x, y, score: d.submission.score, title: d.exam.title, date: d.formattedDate };
                        });

                        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                        // 평균 점수 수평 기준선
                        const avgY = height - paddingY - (Math.min(100, Math.max(0, stats.avgScore)) / 100) * innerHeight;

                        return (
                          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
                            {/* 배경 수평 가이드선 (80점, 50점) */}
                            <line
                              x1={paddingX}
                              y1={height - paddingY - 0.8 * innerHeight}
                              x2={width - paddingX}
                              y2={height - paddingY - 0.8 * innerHeight}
                              stroke="#e2e8f0"
                              strokeDasharray="3 3"
                            />
                            <text x={paddingX - 8} y={height - paddingY - 0.8 * innerHeight + 4} fontSize="9" textAnchor="end" fill="#94a3b8">80</text>

                            {/* 평균선 */}
                            <line
                              x1={paddingX}
                              y1={avgY}
                              x2={width - paddingX}
                              y2={avgY}
                              stroke="#10b981"
                              strokeWidth="1.5"
                              strokeDasharray="4 4"
                            />

                            {/* 성적 꺾은선 */}
                            <path
                              d={pathD}
                              fill="none"
                              stroke="#6366f1"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* 점수 포인트 원 및 텍스트 */}
                            {points.map((p, idx) => (
                              <g key={idx} className="group cursor-pointer">
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r="5"
                                  className="fill-indigo-600 stroke-white stroke-2 group-hover:scale-125 transition-transform"
                                />
                                <text
                                  x={p.x}
                                  y={p.y - 9}
                                  fontSize="10"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  className="fill-slate-800"
                                >
                                  {p.score}
                                </text>
                                <text
                                  x={p.x}
                                  y={height - 6}
                                  fontSize="9"
                                  textAnchor="middle"
                                  className="fill-slate-400"
                                >
                                  {p.date.slice(5)}
                                </text>
                              </g>
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* 🌟 상세 시험 이력 목록 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>전체 시험 응시 이력</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-black">
                      {filteredSubmissions.length}개
                    </span>
                  </h4>
                  {filteredSubmissions.length === 0 && (
                    <span className="text-xs text-rose-500 font-bold">조건에 맞는 시험이 없습니다</span>
                  )}
                </div>

                {filteredSubmissions.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <p className="text-sm font-bold text-slate-600">선택한 필터 조건에 해당하는 시험 응시 기록이 없습니다.</p>
                    <button
                      onClick={handleResetFilters}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      모든 필터 초기화하기
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/90 text-slate-500 font-bold border-b border-slate-200/80">
                            <th className="py-3 px-4">시험지명 및 분류</th>
                            <th className="py-3 px-3">응시 일자</th>
                            <th className="py-3 px-3">점수 / 배점</th>
                            <th className="py-3 px-3">정답률 (O/X)</th>
                            <th className="py-3 px-3">소요시간</th>
                            <th className="py-3 px-3 text-right">상세</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredSubmissions.map((item) => {
                            const isExpanded = expandedSubmissionId === item.submission.id;
                            const isPassing = item.submission.score >= 80;

                            return (
                              <React.Fragment key={item.submission.id}>
                                <tr className="hover:bg-slate-50/80 transition-colors">
                                  {/* 시험명 & 필터칩 */}
                                  <td className="py-3 px-4">
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                        <span>{item.exam.title}</span>
                                      </p>
                                      {/* 필터칩 배지들 */}
                                      {item.exam.filter_chip_ids && item.exam.filter_chip_ids.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {item.exam.filter_chip_ids.map(chipId => {
                                            const chip = filterChips.find(c => c.id === chipId);
                                            if (!chip) return null;
                                            return <FilterChipBadge key={chipId} chip={chip} size="sm" />;
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  {/* 응시 일자 */}
                                  <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                    {item.formattedDate}
                                  </td>

                                  {/* 점수 */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-black ${isPassing ? 'text-emerald-600' : 'text-slate-800'}`}>
                                        {item.submission.score}점
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-bold">
                                        / {item.submission.total_points || 100}점
                                      </span>
                                    </div>
                                  </td>

                                  {/* 정답률 */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-700">
                                        {item.scorePercent}%
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        (O: {item.submission.correct_count} / X: {item.submission.wrong_count})
                                      </span>
                                    </div>
                                  </td>

                                  {/* 소요시간 */}
                                  <td className="py-3 px-3 text-slate-600 whitespace-nowrap font-medium">
                                    {item.durationMin}분
                                  </td>

                                  {/* 액션 */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onOpenSubmissionDetail) {
                                          onOpenSubmissionDetail(item.exam, item.submission);
                                        } else {
                                          setExpandedSubmissionId(isExpanded ? null : item.submission.id);
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                                    >
                                      {isExpanded ? '접기' : '문항 상세'}
                                    </button>
                                  </td>
                                </tr>

                                {/* 문항별 상세 아코디언 */}
                                {isExpanded && (
                                  <tr className="bg-slate-50/90 animate-in fade-in duration-150">
                                    <td colSpan={6} className="p-4 border-t border-slate-200">
                                      {(() => {
                                        const questionResults = extractQuestionResults(item);
                                        if (questionResults.length === 0) {
                                          return (
                                            <div className="py-4 text-center text-xs text-slate-400 font-bold">
                                              문항별 답안 데이터가 없습니다.
                                            </div>
                                          );
                                        }

                                        const correctNum = questionResults.filter(q => q.isCorrect).length;
                                        const wrongNum = questionResults.filter(q => !q.isCorrect && !q.isUnknown).length;
                                        const unknownNum = questionResults.filter(q => q.isUnknown).length;

                                        return (
                                          <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80">
                                              <div className="flex items-center gap-2">
                                                <span>📋 문항별 정오표 ({questionResults.length}문항)</span>
                                                <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                                  정답 {correctNum}
                                                </span>
                                                <span className="text-[11px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                                  오답 {wrongNum}
                                                </span>
                                                {unknownNum > 0 && (
                                                  <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                                    모름 {unknownNum}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-[11px] text-slate-400 font-normal">
                                                문항 클릭 시 문제 이미지 확인 가능
                                              </span>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                              {questionResults.map((q) => (
                                                <div
                                                  key={q.id}
                                                  onClick={() => {
                                                    if (q.imageUrl) {
                                                      setPreviewQuestion({
                                                        imageUrl: q.imageUrl,
                                                        number: q.number,
                                                        title: item.exam.title,
                                                        userAnswer: q.userAnswer,
                                                        correctAnswer: q.correctAnswer,
                                                        isCorrect: q.isCorrect,
                                                      });
                                                    }
                                                  }}
                                                  className={`p-2.5 rounded-xl border transition-all text-left ${
                                                    q.imageUrl ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''
                                                  } ${
                                                    q.isCorrect
                                                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                                      : q.isUnknown
                                                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                                                      : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                                  }`}
                                                >
                                                  <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-black">
                                                      {q.number}번
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                      {typeof q.points === 'number' && (
                                                        <span className="text-[10px] text-slate-400 font-bold">
                                                          {q.points}점
                                                        </span>
                                                      )}
                                                      {q.isCorrect ? (
                                                        <CheckCircle2 size={13} className="text-emerald-600" />
                                                      ) : q.isUnknown ? (
                                                        <HelpCircle size={13} className="text-amber-500" />
                                                      ) : (
                                                        <XCircle size={13} className="text-rose-500" />
                                                      )}
                                                    </div>
                                                  </div>

                                                  <div className="text-[11px] space-y-0.5">
                                                    <p className="flex items-center justify-between">
                                                      <span className="text-slate-400 font-medium">제출:</span>
                                                      <strong className={`font-black ${q.isCorrect ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                        {q.userAnswer}
                                                      </strong>
                                                    </p>
                                                    {!q.isCorrect && q.correctAnswer && (
                                                      <p className="flex items-center justify-between text-indigo-600">
                                                        <span className="text-slate-400 font-medium">정답:</span>
                                                        <strong className="font-black">{q.correctAnswer}</strong>
                                                      </p>
                                                    )}
                                                    {typeof q.timeSpentSec === 'number' && q.timeSpentSec > 0 && (
                                                      <p className="text-[10px] text-slate-400 text-right mt-1">
                                                        ⏱️ {q.timeSpentSec}초
                                                      </p>
                                                    )}
                                                    {q.imageUrl && (
                                                      <p className="text-[9px] text-indigo-500 font-bold text-center mt-1 pt-1 border-t border-slate-200/50">
                                                        🔍 문제 보기
                                                      </p>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 4. 모달 하단 푸터 */}
        <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Info size={14} className="text-slate-400" />
            <span>필터를 변경하면 상단 평균, 최고 점수, 추이 그래프가 실시간으로 재계산됩니다.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 🖼️ 문항 이미지 및 정답 상세 팝업 */}
      {previewQuestion && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPreviewQuestion(null)}
        >
          <div 
            className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                  {previewQuestion.number}
                </span>
                <h4 className="font-black text-slate-800 text-sm">
                  {previewQuestion.title} - {previewQuestion.number}번 문항 상세
                </h4>
              </div>
              <button 
                onClick={() => setPreviewQuestion(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {previewQuestion.imageUrl && (
              <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-200 p-3 bg-slate-50/50 flex justify-center">
                <img 
                  src={previewQuestion.imageUrl} 
                  alt={`${previewQuestion.number}번 문항`} 
                  className="max-w-full rounded-xl object-contain shadow-xs" 
                />
              </div>
            )}

            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-bold">학생 제출:</span>
                  <strong className={`font-black text-sm ${previewQuestion.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {previewQuestion.userAnswer}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-bold">실제 정답:</span>
                  <strong className="font-black text-sm text-indigo-600">
                    {previewQuestion.correctAnswer || '(미지정)'}
                  </strong>
                </div>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
