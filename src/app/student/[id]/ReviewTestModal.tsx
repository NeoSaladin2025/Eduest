'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileCheck, 
  Clock, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Send, 
  BookOpen, 
  RotateCcw,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Check,
  Zap,
  CheckSquare
} from 'lucide-react';
import { ReviewItem, StudentReviewData, ReviewTestHistory, ReviewTestResultItem } from './types';
import ReviewSolutionModal from './ReviewSolutionModal';

interface ReviewTestModalProps {
  studentId: string;
  items: ReviewItem[];
  title?: string;
  folderId?: string | null;
  reviewData: StudentReviewData;
  onUpdateReviewData: (newData: StudentReviewData) => void;
  onClose: () => void;
}

export default function ReviewTestModal({
  studentId,
  items,
  title = '복습 테스트',
  folderId = null,
  reviewData,
  onUpdateReviewData,
  onClose,
}: ReviewTestModalProps) {
  // 모드: 시험 응시 중('taking') | 채점 결과('result')
  const [viewMode, setViewMode] = useState<'taking' | 'result'>('taking');
  const [currentIndex, setCurrentIndex] = useState(0);

  // 답안 및 소요시간 관리
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [questionSpentTimes, setQuestionSpentTimes] = useState<Record<string, number>>({});
  const questionEnteredAtRef = useRef<number>(Date.now());

  // 타임어택 제한시간 (문항당 3분 = 180초 기본 부여)
  const defaultTotalSec = Math.max(180, items.length * 180);
  const [timeLeft, setTimeLeft] = useState<number>(defaultTotalSec);
  const [totalSpentSec, setTotalSpentSec] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // 채점 결과 상태
  const [testResult, setTestResult] = useState<ReviewTestHistory | null>(null);

  // 결과 화면에서 해설 보기 모달 연동
  const [solutionModalTargetIndex, setSolutionModalTargetIndex] = useState<number | null>(null);

  // DB 저장 완료 메시지
  const [dbSavedMessage, setDbSavedMessage] = useState<string | null>(null);

  // ── 1. 타이머 & 문제별 소요시간 실시간 계측 ──────────────────────
  useEffect(() => {
    if (viewMode !== 'taking') return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // 타임오버 시 자동 제출
          clearInterval(interval);
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });

      setTotalSpentSec(prev => prev + 1);

      // 현재 문제의 누적 소요시간 갱신
      const currItem = items[currentIndex];
      if (currItem) {
        setQuestionSpentTimes(prev => ({
          ...prev,
          [currItem.id]: (prev[currItem.id] || 0) + 1,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [viewMode, currentIndex, items]);

  // 문제 이동 시 타임스탬프 갱신
  const handleNavigateQuestion = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= items.length) return;
    questionEnteredAtRef.current = Date.now();
    setCurrentIndex(newIdx);
  };

  // 시간 포맷팅 헬퍼 (HH:MM:SS or MM:SS)
  const formatTime = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // 답안 선택 핸들러
  const handleAnswerSelect = (itemId: string, answer: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [itemId]: answer,
    }));
  };

  // ── 정답 정규화 비교 함수 ─────────────────────────────────────
  const normalizeAnswer = (val?: string) => {
    if (!val) return '';
    const trimmed = String(val).trim();
    const symbolMap: Record<string, string> = {
      '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
      '1': '1', '2': '2', '3': '3', '4': '4', '5': '5'
    };
    return symbolMap[trimmed] || trimmed.toLowerCase().replace(/\s+/g, '');
  };

  // ── 2. 시험 답안 제출 및 자동 채점 & DB 영구 저장 ──────────────
  const handleSubmitTest = async () => {
    setShowSubmitConfirm(false);
    setIsSubmitting(true);

    let totalScore = 0;
    let correctCount = 0;
    const resultItems: ReviewTestResultItem[] = [];

    // 채점 루프
    items.forEach((item, idx) => {
      const userAns = userAnswers[item.id] || '';
      const correctAns = item.answer || item.raw_answer || '';
      const point = item.points || 4;

      const userNorm = normalizeAnswer(userAns);
      const corrNorm = normalizeAnswer(correctAns);

      // 정답이 지정되지 않은 경우(수동 채점 대비) 또는 매칭 여부
      const isCorrect = corrNorm !== '' && userNorm !== '' && userNorm === corrNorm;

      if (isCorrect) {
        correctCount += 1;
        totalScore += point;
      }

      resultItems.push({
        itemId: item.id,
        questionName: item.name,
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect,
        spentSec: questionSpentTimes[item.id] || 0,
        solutionUrl: item.solutionUrl,
        problemUrl: item.problemUrl,
      });
    });

    const newHistoryRecord: ReviewTestHistory = {
      id: `review_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      folderId,
      folderName: title,
      testedAt: new Date().toISOString(),
      totalQuestions: items.length,
      correctCount,
      score: totalScore,
      timeSpentSec: totalSpentSec,
      results: resultItems,
    };

    setTestResult(newHistoryRecord);

    // ── 3. DB 영구 동기화: reviewData 갱신 ────────────────────────
    // items 배열의 각 item에 최근 테스트 결과(lastTestedAt, lastIsCorrect, lastUserAnswer, lastSpentSec) 주입
    const resultMap = new Map(resultItems.map(r => [r.itemId, r]));

    const updatedItems = reviewData.items.map(item => {
      const res = resultMap.get(item.id);
      if (res) {
        return {
          ...item,
          lastTestedAt: newHistoryRecord.testedAt,
          lastIsCorrect: res.isCorrect,
          lastUserAnswer: res.userAnswer,
          lastSpentSec: res.spentSec,
        };
      }
      return item;
    });

    const updatedReviewData: StudentReviewData = {
      ...reviewData,
      items: updatedItems,
      testHistory: [newHistoryRecord, ...(reviewData.testHistory || [])],
    };

    // 로컬 상태 동기화
    onUpdateReviewData(updatedReviewData);

    // Supabase DB에 POST 전송하여 영구 보존!
    try {
      const res = await fetch('/api/student/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          reviewData: updatedReviewData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDbSavedMessage('💾 복습 테스트 결과가 DB에 안전하게 저장되었습니다!');
      }
    } catch (e) {
      console.error('Failed to save review test result to DB:', e);
    } finally {
      setIsSubmitting(false);
      setViewMode('result');
    }
  };

  // 재시험 (다시 풀기)
  const handleRestartTest = () => {
    setUserAnswers({});
    setQuestionSpentTimes({});
    setTimeLeft(defaultTotalSec);
    setTotalSpentSec(0);
    setCurrentIndex(0);
    setTestResult(null);
    setDbSavedMessage(null);
    setViewMode('taking');
  };

  const currentItem = items[currentIndex];
  const currentAnswer = currentItem ? (userAnswers[currentItem.id] || '') : '';
  const currentSpentSec = currentItem ? (questionSpentTimes[currentItem.id] || 0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
      <div className="bg-[#0b0f19] border border-white/10 rounded-[36px] md:rounded-[48px] max-w-6xl w-full h-[92vh] flex flex-col overflow-hidden shadow-3xl text-white">
        
        {/* ── [A] 시험 응시 화면 (taking) ────────────────────────── */}
        {viewMode === 'taking' && currentItem && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* 상단 헤더 바 */}
            <div className="p-4 md:p-6 border-b border-white/10 bg-slate-900/60 flex flex-wrap items-center justify-between gap-4">
              
              {/* 타이틀 & 문항 번호 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (confirm('테스트를 중단하고 나가시겠습니까? 작성 중인 답안은 사라집니다.')) {
                      onClose();
                    }
                  }}
                  className="w-11 h-11 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
                  title="나가기"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-black text-[10px] border border-violet-500/30 flex items-center gap-1">
                      <Zap size={11} className="text-amber-400" />
                      타임어택 복습 테스트
                    </span>
                    <h3 className="text-sm md:text-base font-black text-white truncate max-w-[200px] md:max-w-xs">
                      {title}
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold text-violet-400">
                    문항 {currentIndex + 1} / {items.length}
                  </span>
                </div>
              </div>

              {/* 실시간 타임어택 제한시간 카운트다운 타이머 */}
              <div className={`px-4 py-2 rounded-2xl flex items-center gap-2.5 border font-mono font-black text-xs md:text-sm shadow-lg transition-all ${
                timeLeft < 180 
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse' 
                  : 'bg-white/5 text-white border-white/10'
              }`}>
                <Clock size={16} className={timeLeft < 180 ? 'text-rose-400' : 'text-violet-400'} />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans">남은 제한시간</span>
                  <span className="tracking-widest">{formatTime(timeLeft)}</span>
                </div>
              </div>

              {/* 문항 번호 칩 네비게이션 */}
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full md:max-w-xs py-1 scrollbar-hide">
                {items.map((item, idx) => {
                  const isCurrent = currentIndex === idx;
                  const ans = userAnswers[item.id];
                  const isUnknown = ans === '모름';
                  const isAnswered = !!ans && !isUnknown;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigateQuestion(idx)}
                      className={`w-8 h-8 rounded-xl font-black text-xs shrink-0 transition-all flex items-center justify-center ${
                        isCurrent
                          ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-105 ring-2 ring-violet-400'
                          : isUnknown
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : isAnswered
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-500 hover:text-white border border-white/5'
                      }`}
                      title={`${idx + 1}번 문항으로 이동`}
                    >
                      {isUnknown ? '?' : idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* 답안 제출 버튼 */}
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs rounded-2xl transition-all shadow-lg shadow-violet-600/30 flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                <Send size={14} />
                <span>답안 제출</span>
              </button>

            </div>

            {/* 메인 문제 및 OMR 답안 마킹 패널 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                
                {/* 좌측: 문제 이미지 뷰어 */}
                <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-[32px] p-5 md:p-6 flex flex-col justify-between min-h-[460px] relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-widest pb-3">
                    <div className="flex items-center gap-2">
                      <span>QUESTION {currentIndex + 1}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-violet-500/20 text-violet-300 font-bold text-[11px] normal-case">
                        {currentItem.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                      <Clock size={13} className="text-violet-400" />
                      <span>소요시간: <strong className="text-white font-bold">{currentSpentSec}초</strong></span>
                    </div>
                  </div>

                  {/* 문제 이미지 표시 */}
                  <div className="w-full flex-1 flex justify-center items-center py-4">
                    {currentItem.problemUrl ? (
                      <img
                        src={currentItem.problemUrl}
                        alt={`문제 ${currentIndex + 1}번`}
                        className="max-w-full max-h-[62vh] object-contain rounded-2xl shadow-2xl bg-white p-2.5"
                      />
                    ) : (
                      <div className="text-center space-y-2 py-16 text-slate-500 my-auto">
                        <AlertCircle size={36} className="mx-auto text-amber-500 opacity-60" />
                        <p className="text-sm font-bold">문제 이미지가 등록되어 있지 않습니다.</p>
                        <p className="text-xs text-slate-600 font-medium">{currentItem.name}</p>
                      </div>
                    )}
                  </div>

                  {/* 이전 / 다음 문제 이동 버튼 */}
                  <div className="w-full flex items-center justify-between pt-3 mt-auto border-t border-white/10">
                    <button
                      onClick={() => handleNavigateQuestion(currentIndex - 1)}
                      disabled={currentIndex === 0}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={15} />
                      이전 문제
                    </button>

                    <button
                      onClick={() => handleNavigateQuestion(currentIndex + 1)}
                      disabled={currentIndex === items.length - 1}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      다음 문제
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>

                {/* 우측: OMR 답안 마킹 패널 */}
                <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-[32px] p-5 md:p-6 flex flex-col justify-between space-y-5">
                  <div>
                    <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                      <FileCheck size={18} className="text-violet-400" />
                      OMR 답안 마킹
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      정답 번호를 선택하거나 주관식 답을 입력하세요.
                    </p>

                    {/* 객관식 1~5번 선택 버튼 */}
                    <div className="mt-6 space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        객관식 정답 선택
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {['1', '2', '3', '4', '5'].map((num, i) => {
                          const symbols = ['①', '②', '③', '④', '⑤'];
                          const isSelected = currentAnswer === num || currentAnswer === symbols[i];
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleAnswerSelect(currentItem.id, num)}
                              className={`py-3.5 rounded-2xl font-black text-base transition-all ${
                                isSelected
                                  ? 'bg-violet-600 text-white shadow-xl shadow-violet-600/50 scale-105 ring-2 ring-violet-400'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                              }`}
                            >
                              {symbols[i]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 모름 마킹 버튼 */}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleAnswerSelect(currentItem.id, '모름')}
                        className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                          currentAnswer === '모름'
                            ? 'bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/40 ring-2 ring-amber-300 font-extrabold scale-[1.02]'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <HelpCircle size={15} />
                        <span>{currentAnswer === '모름' ? '✓ 모름으로 마킹됨' : '모름 (시간 기록 및 오답 복습)'}</span>
                      </button>
                    </div>

                    {/* 주관식 직접 입력란 */}
                    <div className="mt-6 space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        주관식 답안 직접 입력
                      </label>
                      <input
                        type="text"
                        value={currentAnswer === '모름' ? '' : currentAnswer}
                        onChange={e => handleAnswerSelect(currentItem.id, e.target.value)}
                        placeholder="정답 입력 (예: 42, -5 등)"
                        className="w-full bg-white/5 border border-white/10 focus:border-violet-500 rounded-2xl py-3 px-4 text-center text-base font-black text-white focus:outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  {/* 마킹 현황 요약 */}
                  <div className="p-3 bg-black/40 rounded-2xl border border-white/5 text-[11px] flex items-center justify-between text-slate-400">
                    <span>마킹 완료: <strong className="text-emerald-400">{Object.keys(userAnswers).filter(k => !!userAnswers[k]).length}</strong> / {items.length}</span>
                    <button
                      onClick={() => setShowSubmitConfirm(true)}
                      className="text-violet-400 font-bold hover:underline"
                    >
                      제출하기 &rarr;
                    </button>
                  </div>

                </div>

              </div>
            </div>

          </div>
        )}

        {/* ── [B] 제출 확인 모달 ─────────────────────────────────── */}
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-3xl text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
                <Send size={24} />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">답안을 제출하시겠습니까?</h4>
                <p className="text-xs text-slate-400 mt-1">
                  제출 즉시 자동 채점이 진행되며, 결과와 각 문항별 해설을 바로 확인할 수 있습니다.
                </p>
                {Object.keys(userAnswers).length < items.length && (
                  <p className="text-xs text-amber-400 font-bold mt-2">
                    ⚠️ 아직 마킹하지 않은 문항이 {items.length - Object.keys(userAnswers).length}개 있습니다.
                  </p>
                )}
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-black text-xs transition-colors"
                >
                  계속 풀기
                </button>
                <button
                  onClick={handleSubmitTest}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-md shadow-violet-600/30"
                >
                  {isSubmitting ? '채점 중...' : '확인 및 제출'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── [C] 채점 결과 및 상세 해설 링크 화면 (result) ─────── */}
        {viewMode === 'result' && testResult && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* 결과 상단 헤더 */}
            <div className="p-4 md:p-6 border-b border-white/10 bg-slate-900/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                >
                  <ArrowLeft size={15} />
                  복습 홈으로 복귀
                </button>
                <span className="text-xs font-black text-violet-300 bg-violet-500/20 px-3 py-1 rounded-full border border-violet-500/30">
                  {testResult.folderName} • 채점 완료
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestartTest}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-black text-xs rounded-xl transition-all flex items-center gap-1.5 border border-white/5"
                >
                  <RotateCcw size={14} />
                  다시 풀기
                </button>
              </div>
            </div>

            {/* 본문 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              
              {/* DB 저장 완료 안내 바 */}
              {dbSavedMessage && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-black flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={16} />
                  <span>{dbSavedMessage}</span>
                </div>
              )}

              {/* 결과 요약 카드 */}
              <div className="bg-gradient-to-br from-violet-900/40 via-slate-900/50 to-slate-950 border border-violet-500/30 rounded-[36px] p-6 md:p-10 shadow-2xl text-center space-y-6">
                <div>
                  <span className="px-3.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black rounded-full inline-block">
                    정답률 {Math.round((testResult.correctCount / testResult.totalQuestions) * 100)}%
                  </span>
                  <h2 className="text-2xl md:text-4xl font-black text-white mt-2">
                    {testResult.folderName} 테스트 결과
                  </h2>
                </div>

                <div className="flex justify-center items-center gap-8 md:gap-16 pt-2">
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">맞은 문항</p>
                    <p className="text-4xl md:text-6xl font-black text-emerald-400 mt-1">
                      {testResult.correctCount}
                      <span className="text-xl text-slate-500 font-medium"> / {testResult.totalQuestions}</span>
                    </p>
                  </div>
                  <div className="w-px h-14 bg-white/10" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">총 소요시간</p>
                    <p className="text-4xl md:text-6xl font-black text-violet-400 mt-1">
                      {formatTime(testResult.timeSpentSec)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 문항별 상세 채점 내역 & 해설 보기 링크 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base md:text-lg font-black text-white flex items-center gap-2">
                    <CheckSquare size={18} className="text-violet-400" />
                    문항별 채점 결과 및 해설
                  </h3>
                  <span className="text-xs text-slate-400">
                    각 문항 카드의 [해설 보기]를 누르면 상세 풀이를 확인할 수 있습니다.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {testResult.results.map((res, idx) => {
                    const isCorrect = res.isCorrect;
                    const userAnsDisplay = res.userAnswer || '(미입력)';
                    const corrAnsDisplay = res.correctAnswer || '(미지정)';

                    return (
                      <div
                        key={res.itemId}
                        className={`p-5 rounded-[24px] border transition-all flex flex-col justify-between space-y-4 ${
                          isCorrect
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-rose-500/5 border-rose-500/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center ${
                              isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <h4 className="text-sm font-black text-white truncate max-w-[180px]">
                                {res.questionName}
                              </h4>
                              <span className={`text-[11px] font-bold ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isCorrect ? '✓ 정답 (Correct)' : '✕ 오답 (Incorrect)'}
                              </span>
                            </div>
                          </div>

                          <span className="text-xs text-slate-400 font-mono bg-white/5 px-2 py-1 rounded-lg">
                            ⏱️ {res.spentSec}초
                          </span>
                        </div>

                        {/* 답안 비교 */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-3 rounded-xl border border-white/5">
                          <div>
                            <span className="text-slate-500 block text-[10px] font-bold">내가 낸 답</span>
                            <span className={`font-black text-sm ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {userAnsDisplay}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] font-bold">실제 정답</span>
                            <span className="text-emerald-300 font-black text-sm">
                              {corrAnsDisplay}
                            </span>
                          </div>
                        </div>

                        {/* 🔥 [해설 보기] 링크 버튼 */}
                        <button
                          onClick={() => setSolutionModalTargetIndex(idx)}
                          className="w-full py-2.5 rounded-xl bg-violet-600/30 hover:bg-violet-600 text-violet-200 hover:text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 border border-violet-500/30"
                        >
                          <BookOpen size={14} />
                          <span>클릭하여 상세 해설 보기</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* 결과 화면에서 해설 보기 클릭 시 뜨는 해설 모달 */}
      {solutionModalTargetIndex !== null && (
        <ReviewSolutionModal
          items={items}
          initialIndex={solutionModalTargetIndex}
          onClose={() => setSolutionModalTargetIndex(null)}
        />
      )}

    </div>
  );
}
