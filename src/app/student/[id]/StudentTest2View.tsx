'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileCheck, 
  Clock, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Send, 
  Check, 
  Loader2, 
  AlertCircle, 
  BookOpen, 
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';

interface StudentTest2ViewProps {
  studentId: string;
  studentName?: string;
  studentGrade?: string;
}

export default function StudentTest2View({
  studentId,
  studentName,
  studentGrade,
}: StudentTest2ViewProps) {
  // 모드: 목록('list') | 응시 중('taking') | 결과/채점 보기('result')
  const [viewMode, setViewMode] = useState<'list' | 'taking' | 'result'>('list');
  const [loading, setLoading] = useState(true);

  // 배정된 시험지 목록
  const [examList, setExamList] = useState<any[]>([]);

  // 현재 응시 중인 시험지 상세 정보
  const [currentExam, setCurrentExam] = useState<ExamPaper | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // 제출 결과 정보
  const [submissionResult, setSubmissionResult] = useState<StudentSubmission | null>(null);

  // 원본 해설 보기 모달 (HTML iframe)
  const [solutionModalFileId, setSolutionModalFileId] = useState<string | null>(null);
  const [solutionHtml, setSolutionHtml] = useState<string | null>(null);
  const [solutionLoading, setSolutionLoading] = useState(false);

  // 1. 배정된 시험지 목록 불러오기
  const loadAssignedExams = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/test2/student-exams?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) {
        setExamList(data.exams || []);
      }
    } catch (e) {
      console.error('Failed to load assigned exams:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentId) {
      loadAssignedExams();
    }
  }, [studentId]);

  // 2. 시험 시작하기
  const handleStartExam = async (examId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/test2/student-exams?studentId=${studentId}&examId=${examId}`);
      const data = await res.json();

      if (data.success && data.exam) {
        setCurrentExam(data.exam);
        setCurrentQuestionIndex(0);

        // 이미 제출된 시험지라면 바로 결과 보기 화면으로
        if (data.is_submitted && data.submission) {
          setSubmissionResult(data.submission);
          setViewMode('result');
        } else {
          // 로컬에 임시 저장된 답안이 있다면 복원
          const savedAnswers = localStorage.getItem(`test2_answers_${studentId}_${examId}`);
          if (savedAnswers) {
            try {
              setUserAnswers(JSON.parse(savedAnswers));
            } catch {
              setUserAnswers({});
            }
          } else {
            setUserAnswers({});
          }
          setViewMode('taking');
        }
      } else {
        alert(data.error || '시험지 로드에 실패했습니다.');
      }
    } catch (e) {
      console.error('Error starting exam:', e);
      alert('시험을 시작하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 답안 변경 처리
  const handleAnswerSelect = (questionId: string, answerValue: string) => {
    setUserAnswers(prev => {
      const next = { ...prev, [questionId]: answerValue };
      if (currentExam) {
        localStorage.setItem(`test2_answers_${studentId}_${currentExam.id}`, JSON.stringify(next));
      }
      return next;
    });
  };

  // 3. 최종 답안 제출
  const handleSubmitExam = async () => {
    if (!currentExam) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/test2/student-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          examId: currentExam.id,
          answers: userAnswers,
        }),
      });

      const data = await res.json();
      if (data.success && data.submission) {
        setSubmissionResult(data.submission);
        setShowSubmitConfirm(false);
        // 로컬 임시 답안 삭제
        localStorage.removeItem(`test2_answers_${studentId}_${currentExam.id}`);
        // 목록 갱신
        loadAssignedExams();
        setViewMode('result');
      } else {
        alert(data.error || '답안 제출에 실패했습니다.');
      }
    } catch (e) {
      console.error('Error submitting exam:', e);
      alert('답안 제출 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. 원본 라이브러리 해설 보기 모달 열기
  const handleOpenSolution = async (driveId: string) => {
    if (!driveId) return;
    setSolutionModalFileId(driveId);
    setSolutionLoading(true);
    setSolutionHtml(null);

    try {
      const res = await fetch(`/api/drive/library/file?fileId=${encodeURIComponent(driveId)}&type=html`);
      const data = await res.json();
      if (data.success && data.data) {
        setSolutionHtml(data.data);
      } else {
        alert('해설을 불러오지 못했습니다.');
      }
    } catch (e) {
      console.error('Error loading solution:', e);
      alert('해설 로딩 중 오류가 발생했습니다.');
    } finally {
      setSolutionLoading(false);
    }
  };

  // 로딩 상태
  if (loading && viewMode === 'list') {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-violet-500" size={44} />
        <p className="text-white text-base font-black tracking-wider uppercase">
          시험 목록을 동기화하는 중...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ─────────────────────────────────────────────────────────────
          1. 배정된 시험지 목록 화면 (VIEW: 'list')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-8 pb-16">
          <div className="text-center space-y-2">
            <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white">
              ASSIGNED <span className="text-violet-500">EXAMS</span>
            </h2>
            <p className="text-xs md:text-sm font-bold text-slate-400">
              선생님이 배정한 시험지 목록입니다. 원하는 시험을 선택하여 응시하세요.
            </p>
          </div>

          {examList.length === 0 ? (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
              <div className="w-16 h-16 bg-violet-500/20 text-violet-400 rounded-3xl flex items-center justify-center mx-auto">
                <FileCheck size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white">배정된 시험지가 없습니다</h3>
                <p className="text-xs text-slate-500 font-bold">
                  선생님이 새로운 시험지를 배정하면 이곳에 표시됩니다!
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {examList.map(exam => {
                const isSubmitted = exam.is_submitted;
                return (
                  <div
                    key={exam.id}
                    className="bg-white/5 border border-white/10 hover:border-violet-500/50 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      {/* 상태 배지 */}
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px] font-black rounded-full">
                          {exam.grade}
                        </span>
                        {isSubmitted ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 size={13} />
                            제출 완료 ({exam.submission?.score}점)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                            <Clock size={13} />
                            미응시
                          </span>
                        )}
                      </div>

                      {/* 시험지 타이틀 */}
                      <div>
                        <h3 className="text-2xl font-black text-white group-hover:text-violet-400 transition-colors line-clamp-2 leading-tight">
                          {exam.title}
                        </h3>
                        <p className="text-xs text-slate-500 font-bold mt-2">
                          총 {exam.question_count}문항 • 제한시간 {exam.duration_min}분
                        </p>
                      </div>

                      {/* 제출 완료인 경우 점수 요약 카드 */}
                      {isSubmitted && exam.submission && (
                        <div className="bg-white/5 rounded-2xl p-3 flex items-center justify-between border border-white/5 text-xs">
                          <span className="text-slate-400 font-bold">채점 결과</span>
                          <span className="text-emerald-400 font-black text-sm">
                            {exam.submission.correct_count} / {exam.submission.total_questions} 정답 ({exam.submission.score}점)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="pt-6 mt-4 border-t border-white/10">
                      <button
                        onClick={() => handleStartExam(exam.id)}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                          isSubmitted
                            ? 'bg-white/10 hover:bg-white/20 text-white'
                            : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30'
                        }`}
                      >
                        {isSubmitted ? (
                          <>
                            <Eye size={16} />
                            <span>채점 결과 & 해설 보기</span>
                          </>
                        ) : (
                          <>
                            <FileCheck size={16} />
                            <span>시험 시작하기</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. 시험 응시 화면 (VIEW: 'taking')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'taking' && currentExam && (
        <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500 pb-16">
          
          {/* 상단 헤더 바 */}
          <div className="bg-white/5 p-4 md:p-6 rounded-[32px] border border-white/10 backdrop-blur-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => {
                  if (confirm('시험 응시를 중단하고 목록으로 나가시겠습니까? 작성 중인 답안은 보존됩니다.')) {
                    setViewMode('list');
                  }
                }}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
                title="목록으로"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h3 className="text-lg md:text-xl font-black text-white line-clamp-1">
                  {currentExam.title}
                </h3>
                <span className="text-[11px] font-bold text-violet-400">
                  문항 {currentQuestionIndex + 1} / {currentExam.questions.length}
                </span>
              </div>
            </div>

            {/* 문항 번호 네비게이션 칩 */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full md:max-w-md py-1 scrollbar-hide">
              {currentExam.questions.map((q, idx) => {
                const isCurrent = currentQuestionIndex === idx;
                const isAnswered = !!userAnswers[q.id];
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`w-9 h-9 rounded-xl font-black text-xs shrink-0 transition-all ${
                      isCurrent
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-105'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-slate-500 hover:text-white border border-white/5'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* 답안 제출 버튼 */}
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs rounded-2xl transition-all shadow-lg shadow-violet-600/30 flex items-center gap-2 shrink-0"
            >
              <Send size={15} />
              <span>답안 제출</span>
            </button>
          </div>

          {/* 메인 문제 영역 */}
          {(() => {
            const question = currentExam.questions[currentQuestionIndex];
            if (!question) return null;
            const currentAnswer = userAnswers[question.id] || '';

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* 좌측/중앙: 문제 이미지 뷰어 (크고 선명하게) */}
                <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-[40px] p-6 md:p-8 backdrop-blur-3xl shadow-3xl min-h-[500px] flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="absolute top-5 left-6 text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <span>QUESTION {currentQuestionIndex + 1}</span>
                    {question.folder_name && (
                      <span className="px-2 py-0.5 rounded-lg bg-violet-500/20 text-violet-300 font-bold text-[11px] normal-case">
                        [{question.folder_name}] {question.question_number ? `${question.question_number}번` : ''}
                      </span>
                    )}
                  </div>

                  {question.image_url ? (
                    <div className="w-full flex justify-center items-center py-6">
                      <img
                        src={question.image_url}
                        alt={`문제 ${currentQuestionIndex + 1}번`}
                        className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl bg-white p-2"
                      />
                    </div>
                  ) : (
                    <div className="text-center space-y-2 py-20 text-slate-500">
                      <AlertCircle size={40} className="mx-auto text-amber-500 opacity-60" />
                      <p className="text-sm font-bold">문제 이미지를 준비 중입니다.</p>
                      <p className="text-xs text-slate-600 font-medium">{question.name}</p>
                    </div>
                  )}

                  {/* 이전 / 다음 문제 이동 버튼 */}
                  <div className="w-full flex items-center justify-between pt-4 mt-auto border-t border-white/10">
                    <button
                      onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={16} />
                      이전 문제
                    </button>

                    <button
                      onClick={() => setCurrentQuestionIndex(prev => Math.min(currentExam.questions.length - 1, prev + 1))}
                      disabled={currentQuestionIndex === currentExam.questions.length - 1}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      다음 문제
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>

                {/* 우측: 답안 입력 패널 (객관식 1~5번 및 주관식) */}
                <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-[40px] p-6 md:p-8 backdrop-blur-3xl shadow-3xl flex flex-col justify-between space-y-6">
                  <div>
                    <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                      <FileCheck size={18} className="text-violet-400" />
                      답안 마킹
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      문제 풀이 후 정답을 선택하거나 입력하세요.
                    </p>

                    {/* 객관식 1~5번 선택 버튼 */}
                    <div className="mt-8 space-y-3">
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
                              onClick={() => handleAnswerSelect(question.id, num)}
                              className={`py-4 rounded-2xl font-black text-base transition-all ${
                                isSelected
                                  ? 'bg-violet-600 text-white shadow-xl shadow-violet-600/50 scale-105'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                              }`}
                            >
                              {symbols[i]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 주관식 직접 입력란 */}
                    <div className="mt-8 space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        주관식 답안 직접 입력
                      </label>
                      <input
                        type="text"
                        value={currentAnswer}
                        onChange={e => handleAnswerSelect(question.id, e.target.value)}
                        placeholder="정답 입력 (예: 83, -2 등)"
                        className="w-full bg-white/5 border border-white/10 focus:border-violet-500 rounded-2xl py-3.5 px-4 text-center text-lg font-black text-white focus:outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  {/* 마킹 현황 요약 */}
                  <div className="pt-4 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between">
                    <span>작성한 문항</span>
                    <span className="font-black text-violet-400">
                      {Object.keys(userAnswers).length} / {currentExam.questions.length}문항
                    </span>
                  </div>
                </div>

              </div>
            );
          })()}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. 제출 확인 모달
      ───────────────────────────────────────────────────────────── */}
      {showSubmitConfirm && currentExam && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] max-w-md w-full p-8 space-y-6 shadow-3xl text-center">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
              <Send size={28} />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">시험지를 제출하시겠습니까?</h3>
              <p className="text-xs text-slate-400">
                총 {currentExam.questions.length}문제 중{' '}
                <strong className="text-violet-400 font-bold">{Object.keys(userAnswers).length}문제</strong>에 답안을 작성했습니다.
                제출 즉시 자동 채점이 진행됩니다.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-colors"
              >
                더 풀기
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                <span>제출 완료</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. 채점 결과 및 해설 보기 화면 (VIEW: 'result')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'result' && submissionResult && currentExam && (
        <div className="space-y-8 animate-in zoom-in-95 duration-500 pb-16">
          
          {/* 상단 성적 요약 카드 */}
          <div className="bg-gradient-to-br from-violet-900/40 to-slate-900/40 border border-violet-500/30 rounded-[40px] p-8 md:p-12 text-center relative overflow-hidden shadow-3xl backdrop-blur-3xl">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-black uppercase">
                <Sparkles size={14} />
                시험 채점 리포트
              </div>

              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                {submissionResult.exam_title}
              </h2>

              <div className="flex justify-center items-baseline gap-2 pt-2">
                <span className="text-6xl md:text-8xl font-black text-white italic tracking-tighter">
                  {submissionResult.score}
                </span>
                <span className="text-2xl font-black text-violet-400">점</span>
              </div>

              <p className="text-sm font-bold text-slate-400">
                총 {submissionResult.total_questions}문항 중{' '}
                <strong className="text-emerald-400">{submissionResult.correct_count}문항</strong>을 맞혔습니다!
              </p>

              <div className="pt-4 flex justify-center gap-4">
                <button
                  onClick={() => setViewMode('list')}
                  className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black text-xs transition-colors flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  시험 목록으로 이동
                </button>
              </div>
            </div>
          </div>

          {/* 문항별 정오답 및 해설보기 리스트 */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <FileCheck size={20} className="text-violet-400" />
              문항별 정오답 상세 내역
            </h3>

            <div className="space-y-3">
              {currentExam.questions.map((q, idx) => {
                const subDetail = submissionResult.answers[q.id];
                const isCorrect = subDetail?.is_correct;
                const userAns = subDetail?.user_answer || '(미입력)';
                const correctAns = subDetail?.correct_answer || q.answer || '-';
                const rawAns = subDetail?.raw_answer || q.raw_answer || '';
                const solutionDriveId = subDetail?.solution_drive_id || q.solution_drive_id || q.drive_id;

                return (
                  <div
                    key={q.id}
                    className={`p-6 rounded-[28px] border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-2xl ${
                      isCorrect
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-rose-950/20 border-rose-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* O / X 아이콘 */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {isCorrect ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-base">문항 {idx + 1}</span>
                          {q.folder_name && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/10 text-violet-300">
                              [{q.folder_name}] {q.question_number ? `${q.question_number}번` : ''}
                            </span>
                          )}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}>
                            {isCorrect ? '정답' : '오답'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <span className="text-slate-400 font-bold">
                            내가 쓴 답: <strong className={isCorrect ? 'text-emerald-400' : 'text-rose-400'}>{userAns}</strong>
                          </span>
                          <span className="text-slate-400 font-bold">
                            정답: <strong className="text-emerald-400">{correctAns}</strong>
                            {rawAns && rawAns !== correctAns && (
                              <span className="text-slate-500 ml-1">({rawAns})</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 해설보기 버튼 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenSolution(solutionDriveId)}
                        className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-violet-600 text-slate-300 hover:text-white border border-white/10 hover:border-violet-500 font-black text-xs transition-all flex items-center gap-2 shadow-lg"
                      >
                        <BookOpen size={16} />
                        <span>해설보기</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. 원본 라이브러리 해설 뷰어 모달 (HTML iframe)
      ───────────────────────────────────────────────────────────── */}
      {solutionModalFileId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/15 rounded-[36px] w-full max-w-5xl h-[90vh] flex flex-col shadow-3xl overflow-hidden">
            
            {/* 모달 상단 헤더 */}
            <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h4 className="text-base md:text-lg font-black text-white">원본 라이브러리 프리미엄 해설</h4>
                  <p className="text-[11px] font-bold text-slate-400">단계별 상세 해설 및 솔루션 리포트</p>
                </div>
              </div>

              <button
                onClick={() => { setSolutionModalFileId(null); setSolutionHtml(null); }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 hover:text-white text-slate-400 flex items-center justify-center font-bold transition-colors"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {/* 모달 본문: 아이프레임 */}
            <div className="flex-1 bg-white p-2 md:p-4 overflow-hidden relative">
              {solutionLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 space-y-3">
                  <Loader2 size={40} className="animate-spin text-violet-600" />
                  <p className="text-xs font-black text-slate-600">해설을 불러오는 중입니다...</p>
                </div>
              )}

              {solutionHtml ? (
                <iframe
                  srcDoc={solutionHtml}
                  className="w-full h-full border-0 rounded-2xl"
                  title="해설 뷰어"
                />
              ) : !solutionLoading && (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold">
                  해설 내용을 불러올 수 없습니다.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
