'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  Lock,
  Layers,
  PlayCircle
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { ExamBundle, ExamBundleItem } from '@/app/api/test2/bundle/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';
import { supabase } from '@/lib/supabase';

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
  const [listTab, setListTab] = useState<'single' | 'bundle'>('single');
  const [loading, setLoading] = useState(true);

  // 배정된 단일 시험지 및 묶음 시험지 목록
  const [examList, setExamList] = useState<any[]>([]);
  const [bundleList, setBundleList] = useState<ExamBundle[]>([]);

  // 현재 응시 중인 시험지 & 묶음 정보
  const [currentExam, setCurrentExam] = useState<ExamPaper | null>(null);
  const [currentBundle, setCurrentBundle] = useState<ExamBundle | null>(null);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // 답안 및 소요시간 관리
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [questionSpentTimes, setQuestionSpentTimes] = useState<Record<string, number>>({});
  const questionEnteredAtRef = useRef<number>(Date.now());

  // 타이머 & 일시정지 & 이탈 감지 화면 잠금
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // 제출 결과 정보
  const [submissionResult, setSubmissionResult] = useState<StudentSubmission | null>(null);

  // 원본 해설 보기 모달 (HTML iframe)
  const [solutionModalFileId, setSolutionModalFileId] = useState<string | null>(null);
  const [solutionHtml, setSolutionHtml] = useState<string | null>(null);
  const [solutionLoading, setSolutionLoading] = useState(false);

  // 실시간 채널 ref
  const channelRef = useRef<any>(null);

  // 시간 포맷팅 헬퍼 (HH:MM:SS 또는 MM:SS)
  const formatRemainingTime = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // 1. 배정된 시험지 및 묶음(카트리지) 목록 불러오기
  const loadAssignedData = useCallback(async () => {
    try {
      setLoading(true);
      const [examRes, bundleRes] = await Promise.all([
        fetch(`/api/test2/student-exams?studentId=${studentId}`),
        fetch(`/api/test2/bundle?studentId=${studentId}`),
      ]);
      const examData = await examRes.json();
      const bundleData = await bundleRes.json();

      if (examData.success) {
        setExamList(examData.exams || []);
      }
      if (bundleData.success) {
        setBundleList(bundleData.bundles || []);
      }
    } catch (e) {
      console.error('Failed to load assigned data:', e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      loadAssignedData();
    }
  }, [studentId, loadAssignedData]);

  // 실시간 모니터링 상태 전송 헬퍼 (Broadcast + DB sync)
  const broadcastProctorStatus = useCallback(
    (status: 'TESTING' | 'AWAY' | 'PAUSED' | 'FINISHED', overrideTime?: number) => {
      if (!currentExam) return;
      const curTime = overrideTime !== undefined ? overrideTime : timeLeft;
      const payload = {
        student_id: studentId,
        student_name: studentName,
        student_grade: studentGrade,
        exam_id: currentExam.id,
        exam_title: currentExam.title,
        bundle_id: currentBundle?.id || null,
        bundle_title: currentBundle?.title || null,
        round: currentRound,
        question_idx: currentQuestionIndex + 1,
        total_questions: currentExam.questions.length,
        test_status: status,
        test_remaining_sec: curTime,
        updated_at: new Date().toISOString(),
      };

      // 1) Realtime Broadcast 발송 (즉각 반응)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'proctor_sync',
          payload,
        });
      }

      // 2) Supabase students 테이블 업데이트
      supabase
        .from('students')
        .update({
          test_status: status,
          test_remaining_sec: curTime,
          last_away_at: status === 'AWAY' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId)
        .then();
    },
    [currentExam, timeLeft, studentId, studentName, studentGrade, currentBundle, currentRound, currentQuestionIndex]
  );

  // 📡 Supabase Realtime 채널 연결 (선생님의 원격 잠금 해제 승인 수신 & 브로드캐스트)
  useEffect(() => {
    if (!studentId) return;

    const channel = supabase.channel('proctoring_room');
    channelRef.current = channel;

    // 선생님의 잠금 해제 승인 이벤트 수신
    channel
      .on('broadcast', { event: 'unlock_student' }, (eventPayload: any) => {
        if (eventPayload?.payload?.studentId === studentId) {
          setIsLocked(false);
          setIsPaused(false);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'students',
        filter: `id=eq.${studentId}`,
      }, (payload: any) => {
        const newStatus = payload.new?.test_status;
        if (newStatus === 'TESTING') {
          setIsLocked(false);
          setIsPaused(false);
        } else if (newStatus === 'PAUSED') {
          setIsPaused(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  // 2. 시험 시작하기
  const handleStartExam = async (examId: string, bundle?: ExamBundle, roundNum = 1) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/test2/student-exams?studentId=${studentId}&examId=${examId}`);
      const data = await res.json();

      if (data.success && data.exam) {
        setCurrentExam(data.exam);
        setCurrentBundle(bundle || null);
        setCurrentRound(roundNum);
        setCurrentQuestionIndex(0);
        questionEnteredAtRef.current = Date.now();

        // 이미 제출된 시험지라면 결과 보기 화면으로
        if (data.is_submitted && data.submission) {
          setSubmissionResult(data.submission);
          setViewMode('result');
        } else {
          // 로컬 임시 저장 답안 복원
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

          // 문항별 소요시간 복원
          const savedQTimes = localStorage.getItem(`test2_qtimes_${studentId}_${examId}`);
          if (savedQTimes) {
            try {
              setQuestionSpentTimes(JSON.parse(savedQTimes));
            } catch {
              setQuestionSpentTimes({});
            }
          } else {
            setQuestionSpentTimes({});
          }

          // 남은 시간 복원 또는 기본 설정 (분 -> 초)
          const savedTime = localStorage.getItem(`test2_time_${studentId}_${examId}`);
          const initialDurationSec = (data.exam.duration_min || 60) * 60;
          const initialTime = savedTime ? parseInt(savedTime, 10) : initialDurationSec;
          setTimeLeft(initialTime);

          setIsLocked(false);
          setIsPaused(false);
          setViewMode('taking');

          // 시작 상태 알림
          setTimeout(() => {
            supabase
              .from('students')
              .update({
                test_status: 'TESTING',
                test_remaining_sec: initialTime,
                test_duration_min: data.exam.duration_min || 60,
                updated_at: new Date().toISOString(),
              })
              .eq('id', studentId)
              .then();
          }, 200);
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

  // 3. 타이머 자동 카운트다운 (1초 주기)
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam || isLocked || isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          alert('시험 제한시간이 종료되었습니다! 작성된 답안을 자동으로 제출합니다.');
          handleSubmitExam();
          return 0;
        }
        const next = prev - 1;
        // 5초마다 로컬스토리지 저장
        if (next % 5 === 0) {
          localStorage.setItem(`test2_time_${studentId}_${currentExam.id}`, String(next));
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [viewMode, currentExam, isLocked, isPaused, studentId]);

  // 주기적(20초마다) DB 동기화
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam || isLocked || isPaused) return;

    const syncInterval = setInterval(() => {
      broadcastProctorStatus('TESTING', timeLeft);
    }, 20000);

    return () => clearInterval(syncInterval);
  }, [viewMode, currentExam, isLocked, isPaused, timeLeft, broadcastProctorStatus]);

  // 4. 답안 변경 처리 및 문항 소요시간 자동 체크 (정답 입력 기준)
  const handleAnswerSelect = (questionId: string, answerValue: string) => {
    if (isLocked) return;

    // 답안 저장
    setUserAnswers(prev => {
      const next = { ...prev, [questionId]: answerValue };
      if (currentExam) {
        localStorage.setItem(`test2_answers_${studentId}_${currentExam.id}`, JSON.stringify(next));
      }
      return next;
    });

    // ⏱️ 정답 입력 기준 소요시간 자동 체크 & 누적
    const now = Date.now();
    const elapsedSec = Math.max(1, Math.round((now - questionEnteredAtRef.current) / 1000));
    questionEnteredAtRef.current = now; // 입력 시점 기준으로 시작 시점 리셋

    setQuestionSpentTimes(prev => {
      const updated = {
        ...prev,
        [questionId]: (prev[questionId] || 0) + elapsedSec,
      };
      if (currentExam) {
        localStorage.setItem(`test2_qtimes_${studentId}_${currentExam.id}`, JSON.stringify(updated));
      }
      return updated;
    });

    // 모니터링 실시간 정보 전송 (문항 풀이 중)
    broadcastProctorStatus('TESTING');
  };

  // 문항 전환 시 풀이 시작 시각 갱신
  const handleNavigateQuestion = (targetIdx: number) => {
    // 이전 문항에서 머문 시간 누적 (만약 답안을 마킹하지 않고 넘어가더라도 풀이 시간으로 인정)
    if (currentExam) {
      const curQ = currentExam.questions[currentQuestionIndex];
      if (curQ) {
        const now = Date.now();
        const elapsedSec = Math.max(0, Math.round((now - questionEnteredAtRef.current) / 1000));
        if (elapsedSec > 0) {
          setQuestionSpentTimes(prev => {
            const updated = { ...prev, [curQ.id]: (prev[curQ.id] || 0) + elapsedSec };
            localStorage.setItem(`test2_qtimes_${studentId}_${currentExam.id}`, JSON.stringify(updated));
            return updated;
          });
        }
      }
    }

    setCurrentQuestionIndex(targetIdx);
    questionEnteredAtRef.current = Date.now();

    // 진도 변경 실시간 통지
    setTimeout(() => {
      broadcastProctorStatus('TESTING');
    }, 100);
  };

  // 🚨 5. 화면 이탈 감지 (부정행위 방지: 화면 잠금 + 타이머 정지 + 원격 해제 대기)
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam) return;

    const triggerAwayLock = () => {
      if (isLocked) return;
      setIsLocked(true);

      // 모니터링 경보 발송
      broadcastProctorStatus('AWAY', timeLeft);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerAwayLock();
      }
    };

    const handleBlur = () => {
      triggerAwayLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [viewMode, currentExam, isLocked, timeLeft, broadcastProctorStatus]);

  // 잠금 상태일 때 2.5초마다 DB 상태 폴링 (웹소켓 유실 대비 백업 해제 감지)
  useEffect(() => {
    if (!isLocked || !studentId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('students')
        .select('test_status, test_remaining_sec')
        .eq('id', studentId)
        .single();

      if (data && data.test_status === 'TESTING') {
        setIsLocked(false);
        setIsPaused(false);
        if (data.test_remaining_sec !== undefined && data.test_remaining_sec !== null) {
          setTimeLeft(data.test_remaining_sec);
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isLocked, studentId]);

  // 6. 최종 답안 제출
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
          questionTimes: questionSpentTimes,
        }),
      });

      const data = await res.json();
      if (data.success && data.submission) {
        setSubmissionResult(data.submission);
        setShowSubmitConfirm(false);

        // 로컬 임시 데이터 정리
        localStorage.removeItem(`test2_answers_${studentId}_${currentExam.id}`);
        localStorage.removeItem(`test2_qtimes_${studentId}_${currentExam.id}`);
        localStorage.removeItem(`test2_time_${studentId}_${currentExam.id}`);

        // 모니터링 종료 통지
        broadcastProctorStatus('FINISHED', 0);

        // 목록 갱신
        loadAssignedData();
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

  // 7. 원본 라이브러리 해설 보기 모달 열기
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
    <div className="space-y-8 animate-in fade-in duration-500 relative">

      {/* ─────────────────────────────────────────────────────────────
          🚨 화면 이탈 잠금 오버레이 (선생님의 해제 승인 대기)
      ───────────────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="w-24 h-24 rounded-3xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-500 flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/30 animate-pulse">
            <ShieldAlert size={56} />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">
            ⚠️ 시험 화면이 잠겼습니다!
          </h2>
          <p className="text-base md:text-lg text-rose-300 font-bold max-w-lg mb-2">
            시험 화면을 벗어나거나 다른 프로그램을 조작하여 이탈이 감지되었습니다.
          </p>
          <p className="text-xs md:text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
            부정행위 방지를 위해 화면이 잠겼으며 <strong className="text-white font-bold">시험 시간은 일시정지</strong>되었습니다.<br />
            선생님이 모니터링 화면에서 확인 후 <strong className="text-rose-400 font-bold">잠금 해제 승인</strong>을 해주셔야 계속 응시할 수 있습니다.
          </p>

          <div className="flex items-center gap-3 px-6 py-4 bg-white/5 rounded-2xl border border-white/10 text-xs md:text-sm text-slate-300 font-mono shadow-inner">
            <Loader2 className="animate-spin text-rose-400" size={18} />
            <span>선생님의 잠금 해제 승인을 실시간 대기하고 있습니다...</span>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. 배정된 시험지 목록 화면 (VIEW: 'list')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-8 pb-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white">
              ASSIGNED <span className="text-violet-500">EXAMS</span>
            </h2>
            <p className="text-xs md:text-sm font-bold text-slate-400">
              선생님이 배정한 단일 시험지 및 카트리지(묶음) 시험지 목록입니다.
            </p>

            {/* 탭 전환 (단일 시험지 vs 카트리지 묶음) */}
            <div className="flex justify-center pt-2">
              <div className="bg-white/5 p-1 rounded-2xl border border-white/10 flex gap-1">
                <button
                  onClick={() => setListTab('single')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'single'
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCheck size={16} />
                  단일 시험지 ({examList.length})
                </button>
                <button
                  onClick={() => setListTab('bundle')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'bundle'
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers size={16} />
                  시험지 묶음 카트리지 ({bundleList.length})
                </button>
              </div>
            </div>
          </div>

          {/* 탭 1: 단일 시험지 목록 */}
          {listTab === 'single' && (
            examList.length === 0 ? (
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

                        <div>
                          <h3 className="text-2xl font-black text-white group-hover:text-violet-400 transition-colors line-clamp-2 leading-tight">
                            {exam.title}
                          </h3>
                          <p className="text-xs text-slate-500 font-bold mt-2">
                            총 {exam.question_count}문항 • 제한시간 {exam.duration_min}분
                          </p>
                        </div>

                        {isSubmitted && exam.submission && (
                          <div className="bg-white/5 rounded-2xl p-3 flex items-center justify-between border border-white/5 text-xs">
                            <span className="text-slate-400 font-bold">채점 결과</span>
                            <span className="text-emerald-400 font-black text-sm">
                              {exam.submission.correct_count} / {exam.submission.total_questions} 정답 ({exam.submission.score}점)
                            </span>
                          </div>
                        )}
                      </div>

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
            )
          )}

          {/* 탭 2: 카트리지(시험지 묶음) 목록 */}
          {listTab === 'bundle' && (
            bundleList.length === 0 ? (
              <div className="bg-white/5 border border-dashed border-white/10 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-violet-500/20 text-violet-400 rounded-3xl flex items-center justify-center mx-auto">
                  <Layers size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">배정된 시험지 묶음이 없습니다</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    선생님이 카트리지 묶음 시험지를 배정하면 이곳에 표시됩니다!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bundleList.map(bundle => (
                  <div
                    key={bundle.id}
                    className="bg-white/5 border border-white/10 hover:border-violet-500/50 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px] font-black rounded-full flex items-center gap-1.5">
                          <Layers size={12} />
                          {bundle.grade} 묶음
                        </span>
                        <span className="text-xs font-bold text-violet-400 bg-violet-500/10 px-2.5 py-0.5 rounded-full border border-violet-500/20">
                          총 {bundle.items.length}회차 구성
                        </span>
                      </div>

                      <div>
                        <h3 className="text-2xl font-black text-white group-hover:text-violet-400 transition-colors line-clamp-2 leading-tight">
                          {bundle.title}
                        </h3>
                        {bundle.description && (
                          <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-2">
                            {bundle.description}
                          </p>
                        )}
                      </div>

                      {/* 회차별 시험지 서브 리스트 */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                          포함된 시험지 순서
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {bundle.items.map((item, idx) => (
                            <div
                              key={item.exam_id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="w-5 h-5 rounded-lg bg-violet-600/30 text-violet-300 font-black flex items-center justify-center text-[10px] shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="font-bold text-slate-200 truncate">{item.exam_title}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0 font-medium ml-2">
                                {item.question_count ? `${item.question_count}문항` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-white/10">
                      <button
                        onClick={() => {
                          if (bundle.items.length > 0) {
                            handleStartExam(bundle.items[0].exam_id, bundle, 1);
                          }
                        }}
                        className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30"
                      >
                        <PlayCircle size={16} />
                        <span>카트리지 1회차부터 응시 시작</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
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
                    broadcastProctorStatus('PAUSED');
                    setViewMode('list');
                  }
                }}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
                title="목록으로"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  {currentBundle && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-bold text-[10px] border border-indigo-500/30">
                      {currentBundle.title} • {currentRound}회차
                    </span>
                  )}
                  <h3 className="text-lg md:text-xl font-black text-white line-clamp-1">
                    {currentExam.title}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-violet-400">
                  문항 {currentQuestionIndex + 1} / {currentExam.questions.length}
                </span>
              </div>
            </div>

            {/* 🔥 상단 실시간 제한시간 자동 카운트다운 타이머 */}
            <div className={`px-5 py-2.5 rounded-2xl flex items-center gap-2.5 border font-mono font-black text-sm md:text-base shadow-lg transition-all ${
              timeLeft < 300 
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse' 
                : 'bg-white/10 text-white border-white/10'
            }`}>
              <Clock size={19} className={timeLeft < 300 ? 'text-rose-400' : 'text-violet-400'} />
              <div className="flex flex-col text-left">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans">남은 제한시간</span>
                <span className="tracking-widest">{formatRemainingTime(timeLeft)}</span>
              </div>
            </div>

            {/* 문항 번호 네비게이션 칩 */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full md:max-w-md py-1 scrollbar-hide">
              {currentExam.questions.map((q, idx) => {
                const isCurrent = currentQuestionIndex === idx;
                const ans = userAnswers[q.id];
                const isUnknown = ans === '모름';
                const isAnswered = !!ans && !isUnknown;

                return (
                  <button
                    key={q.id}
                    onClick={() => handleNavigateQuestion(idx)}
                    className={`w-9 h-9 rounded-xl font-black text-xs shrink-0 transition-all flex items-center justify-center relative ${
                      isCurrent
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-105 ring-2 ring-violet-400'
                        : isUnknown
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-slate-500 hover:text-white border border-white/5'
                    }`}
                  >
                    {isUnknown ? '?' : idx + 1}
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
            const spentSec = questionSpentTimes[question.id] || 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* 좌측/중앙: 문제 이미지 뷰어 */}
                <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-[40px] p-6 md:p-8 backdrop-blur-3xl shadow-3xl min-h-[500px] flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-widest pb-4">
                    <div className="flex items-center gap-2">
                      <span>QUESTION {currentQuestionIndex + 1}</span>
                      {question.folder_name && (
                        <span className="px-2 py-0.5 rounded-lg bg-violet-500/20 text-violet-300 font-bold text-[11px] normal-case">
                          [{question.folder_name}] {question.question_number ? `${question.question_number}번` : ''}
                        </span>
                      )}
                    </div>

                    {/* 문제별 소요시간 실시간 표시 */}
                    <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                      <Clock size={13} className="text-violet-400" />
                      <span>소요시간: <strong className="text-white font-bold">{spentSec}초</strong></span>
                    </div>
                  </div>

                  {question.image_url ? (
                    <div className="w-full flex-1 flex justify-center items-center py-4">
                      <img
                        src={question.image_url}
                        alt={`문제 ${currentQuestionIndex + 1}번`}
                        className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl bg-white p-2"
                      />
                    </div>
                  ) : (
                    <div className="text-center space-y-2 py-20 text-slate-500 my-auto">
                      <AlertCircle size={40} className="mx-auto text-amber-500 opacity-60" />
                      <p className="text-sm font-bold">문제 이미지를 준비 중입니다.</p>
                      <p className="text-xs text-slate-600 font-medium">{question.name}</p>
                    </div>
                  )}

                  {/* 이전 / 다음 문제 이동 버튼 */}
                  <div className="w-full flex items-center justify-between pt-4 mt-auto border-t border-white/10">
                    <button
                      onClick={() => handleNavigateQuestion(Math.max(0, currentQuestionIndex - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={16} />
                      이전 문제
                    </button>

                    <button
                      onClick={() => handleNavigateQuestion(Math.min(currentExam.questions.length - 1, currentQuestionIndex + 1))}
                      disabled={currentQuestionIndex === currentExam.questions.length - 1}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      다음 문제
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>

                {/* 우측: 답안 입력 패널 (객관식 1~5번, 모름 버튼, 주관식) */}
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

                    {/* 🔥 [모름] 버튼 추가 */}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleAnswerSelect(question.id, '모름')}
                        className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                          currentAnswer === '모름'
                            ? 'bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/40 ring-2 ring-amber-300 font-extrabold scale-[1.02]'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <HelpCircle size={16} />
                        <span>{currentAnswer === '모름' ? '✓ 모름으로 마킹됨' : '모름 (정답 체크 및 시간 저장)'}</span>
                      </button>
                    </div>

                    {/* 주관식 직접 입력란 */}
                    <div className="mt-8 space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        주관식 답안 직접 입력
                      </label>
                      <input
                        type="text"
                        value={currentAnswer === '모름' ? '' : currentAnswer}
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
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-black text-xs transition-colors"
              >
                계속 풀기
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <span>제출 확정</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. 채점 결과 화면 (VIEW: 'result')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'result' && submissionResult && currentExam && (
        <div className="space-y-8 animate-in fade-in duration-500 pb-16">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setViewMode('list');
                setCurrentExam(null);
                setSubmissionResult(null);
              }}
              className="px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-xs transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              시험 목록으로 돌아가기
            </button>

            {currentBundle && (
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-black">
                {currentBundle.title} • {currentRound}회차 결과
              </span>
            )}
          </div>

          {/* 결과 요약 카드 */}
          <div className="bg-gradient-to-br from-violet-900/30 via-slate-900/40 to-slate-900/60 border border-violet-500/30 rounded-[40px] p-8 md:p-12 shadow-3xl text-center space-y-6">
            <div className="space-y-2">
              <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black rounded-full inline-block">
                채점 완료
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                {submissionResult.exam_title}
              </h2>
            </div>

            <div className="flex justify-center items-center gap-8 md:gap-16 pt-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">내 점수</p>
                <p className="text-5xl md:text-7xl font-black text-violet-400 mt-1">
                  {submissionResult.score}
                  <span className="text-2xl text-slate-500 font-medium">점</span>
                </p>
              </div>
              <div className="w-px h-16 bg-white/10" />
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">정답 문항</p>
                <p className="text-5xl md:text-7xl font-black text-emerald-400 mt-1">
                  {submissionResult.correct_count}
                  <span className="text-2xl text-slate-500 font-medium"> / {submissionResult.total_questions}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 문항별 상세 채점 내역 & 해설 보기 */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-white">문항별 상세 채점 & 해설</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentExam.questions.map((q, idx) => {
                const ansInfo = submissionResult.answers?.[q.id];
                const isCorrect = ansInfo?.is_correct ?? false;
                const userAns = ansInfo?.user_answer || '(미입력)';
                const correctAns = ansInfo?.correct_answer || q.answer || '';
                const spentSec = ansInfo?.time_spent_sec || questionSpentTimes[q.id] || 0;

                return (
                  <div
                    key={q.id}
                    className={`p-6 rounded-[28px] border transition-all ${
                      isCorrect
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-rose-500/5 border-rose-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center ${
                          isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-300">
                          {isCorrect ? '정답' : '오답'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400 font-mono">⏱️ {spentSec}초 소요</span>
                        {q.solution_drive_id && (
                          <button
                            onClick={() => handleOpenSolution(q.solution_drive_id)}
                            className="px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 font-black text-[11px] transition-colors flex items-center gap-1"
                          >
                            <BookOpen size={13} />
                            <span>해설 보기</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {q.image_url && (
                      <div className="bg-white p-2 rounded-xl mb-4 max-h-48 overflow-hidden flex justify-center">
                        <img
                          src={q.image_url}
                          alt={`문제 ${idx + 1}번`}
                          className="max-h-44 object-contain"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5">
                      <div className="p-2 rounded-xl bg-white/5">
                        <span className="text-slate-500 block text-[10px] font-bold">내가 작성한 답</span>
                        <span className={`font-black text-sm ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {userAns}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5">
                        <span className="text-slate-500 block text-[10px] font-bold">정답</span>
                        <span className="font-black text-sm text-slate-200">
                          {correctAns}
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

      {/* ─────────────────────────────────────────────────────────────
          5. 원본 해설 보기 모달 (HTML iframe)
      ───────────────────────────────────────────────────────────── */}
      {solutionModalFileId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[36px] max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-3xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={20} className="text-violet-400" />
                <h3 className="text-lg font-black text-white">문제 정답 및 상세 해설</h3>
              </div>
              <button
                onClick={() => setSolutionModalFileId(null)}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 bg-white p-4 overflow-y-auto">
              {solutionLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="animate-spin text-violet-600" size={36} />
                  <p className="text-xs font-bold text-slate-500">해설을 불러오는 중입니다...</p>
                </div>
              ) : solutionHtml ? (
                <iframe
                  srcDoc={solutionHtml}
                  title="해설"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  해설 내용을 표시할 수 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
