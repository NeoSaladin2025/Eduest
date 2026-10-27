'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  Send,
  AlertCircle,
  HelpCircle,
  Sparkles,
  FileText,
  User,
  Award,
  Edit3
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { StudentTempProgress } from '@/app/api/test2/temp-progress/route';

interface LiveExamMonitoringModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
  student: { id: string; name: string; grade?: string } | null;
  initialProgress?: StudentTempProgress | null;
  onSuccessSubmit?: () => void;
}

// 원형 숫자 정규화 헬퍼
function normalizeAnswerStr(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  const circledMap: Record<string, string> = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5',
  };
  return str.replace(/[①②③④⑤❶❷❸❹❺]/g, (m) => circledMap[m] || m).toLowerCase();
}

export default function LiveExamMonitoringModal({
  isOpen,
  onClose,
  exam,
  student,
  initialProgress,
  onSuccessSubmit,
}: LiveExamMonitoringModalProps) {
  const [loading, setLoading] = useState(false);
  const [progressData, setProgressData] = useState<StudentTempProgress | null>(initialProgress || null);
  
  // 선생님이 화면에서 직접 편집 중인 답안 상태
  const [editableAnswers, setEditableAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 모달 열릴 때 최신 임시 데이터 로드
  useEffect(() => {
    if (isOpen && exam && student) {
      loadLatestProgress();
    }
  }, [isOpen, exam?.id, student?.id]);

  const loadLatestProgress = async () => {
    if (!exam || !student) return;
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/test2/temp-progress?examId=${exam.id}&studentId=${student.id}`);
      const data = await res.json();
      if (data.success && data.progress) {
        setProgressData(data.progress);
        // 편집 상태 초기화
        const rawAnswers = data.progress.answers || {};
        const flattened: Record<string, string> = {};
        Object.entries(rawAnswers).forEach(([qId, val]) => {
          if (typeof val === 'object' && val !== null) {
            flattened[qId] = JSON.stringify(val);
          } else {
            flattened[qId] = String(val ?? '');
          }
        });
        setEditableAnswers(flattened);
      } else {
        setProgressData(null);
        setEditableAnswers({});
      }
    } catch (e) {
      console.error('Failed to load temp progress:', e);
    } finally {
      setLoading(false);
    }
  };

  // 문항별 실시간 가채점 계산
  const gradingAnalysis = useMemo(() => {
    if (!exam || !Array.isArray(exam.questions)) {
      return { totalQuestions: 0, answeredCount: 0, correctCount: 0, wrongCount: 0, estimatedScore: 0, items: [] };
    }

    let correctCount = 0;
    let wrongCount = 0;
    let answeredCount = 0;
    let totalExamPoints10 = 0;
    let earnedPoints10 = 0;

    const items = exam.questions.map((q, idx) => {
      const qPoint10 = Math.round((Number(q.points) || 0) * 10);
      totalExamPoints10 += qPoint10;

      const userAns = editableAnswers[q.id] !== undefined ? editableAnswers[q.id] : (progressData?.answers?.[q.id] || '');
      const hasAnswer = userAns !== '' && userAns !== undefined && userAns !== null;
      if (hasAnswer) answeredCount++;

      let isCorrect: boolean | null = null;

      if (!hasAnswer) {
        isCorrect = null; // 미응시
      } else {
        const normUser = normalizeAnswerStr(userAns);
        const normCorrect = normalizeAnswerStr(q.answer);

        if (normUser === '?' || normUser === '모름') {
          isCorrect = false;
        } else if (normUser === normCorrect) {
          isCorrect = true;
          earnedPoints10 += qPoint10;
          correctCount++;
        } else {
          isCorrect = false;
          wrongCount++;
        }
      }

      return {
        question: q,
        index: idx + 1,
        userAnswer: userAns,
        correctAnswer: q.answer,
        points: q.points || 0,
        isCorrect,
      };
    });

    const totalQuestions = exam.questions.length;
    const estimatedScore = totalExamPoints10 > 0
      ? Math.min(100, Math.round(earnedPoints10 / 10))
      : totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return {
      totalQuestions,
      answeredCount,
      correctCount,
      wrongCount,
      estimatedScore,
      items,
    };
  }, [exam, editableAnswers, progressData]);

  // 선생님 수동 답안 입력 변경 핸들러
  const handleAnswerChange = (questionId: string, value: string) => {
    setEditableAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  // 1. 임시 답안 수동 저장 (서버로 전송하여 학생/선생님 화면 즉시 반영)
  const handleSaveManualAnswers = async () => {
    if (!exam || !student) return;
    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/test2/temp-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          studentId: student.id,
          studentName: student.name,
          answers: editableAnswers,
          currentQuestionIndex: 0,
          totalQuestions: exam.questions.length,
          updatedBy: 'teacher',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProgressData(data.data);
        setFeedbackMsg({ type: 'success', text: '선생님 수동 답안이 안전하게 임시 저장되었습니다.' });
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || '저장에 실패했습니다.' });
      }
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: e?.message || '네트워크 오류가 발생했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  // 2. 이 답안으로 즉시 최종 제출 및 채점 처리
  const handleSubmitFinal = async () => {
    if (!exam || !student) return;
    if (!window.confirm(`[${student.name}] 학생의 현재 입력된 답안(${gradingAnalysis.answeredCount}문항 작성됨)으로 시험을 최종 제출 및 공식 채점 처리할까요?`)) {
      return;
    }

    setIsSubmittingFinal(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/test2/student-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          studentId: student.id,
          answers: editableAnswers,
          submitted_by: '선생님 대리제출',
        }),
      });

      const data = await res.json();
      if (data.success) {
        // 임시 저장 레코드 삭제
        fetch(`/api/test2/temp-progress?examId=${exam.id}&studentId=${student.id}`, { method: 'DELETE' }).catch(() => {});
        alert(`[${student.name}] 학생의 시험이 성공적으로 최종 제출 및 채점(점수: ${data.submission?.score ?? gradingAnalysis.estimatedScore}점)되었습니다!`);
        if (onSuccessSubmit) onSuccessSubmit();
        onClose();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || '최종 제출 처리에 실패했습니다.' });
      }
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: e?.message || '제출 처리 중 통신 오류가 발생했습니다.' });
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  if (!isOpen || !exam || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-100">
        
        {/* 상단 헤더 */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">{student.name} 학생 실시간 풀이 현황</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-[11px]">
                  {student.grade || exam.grade || '공통'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold text-[11px] flex items-center gap-1">
                  <Clock size={11} />
                  실시간 모니터링
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                시험지: <span className="text-slate-600 font-bold">{exam.title}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadLatestProgress}
              disabled={loading}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 바디 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* 피드백 알림 배너 */}
          {feedbackMsg && (
            <div className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs font-bold ${
              feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* 📊 실시간 진행 요약 카드 3종 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* 진행률 */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">풀이 진행률</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900">{gradingAnalysis.answeredCount}</span>
                <span className="text-xs font-bold text-slate-400">/ {gradingAnalysis.totalQuestions}문항</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${gradingAnalysis.totalQuestions > 0 ? (gradingAnalysis.answeredCount / gradingAnalysis.totalQuestions) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* 실시간 가채점 점수 */}
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100">
              <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">실시간 가채점 점수</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-indigo-700">{gradingAnalysis.estimatedScore}</span>
                <span className="text-xs font-bold text-indigo-400">/ 100점</span>
              </div>
              <p className="text-[10px] text-indigo-500/80 font-bold mt-1">
                작성된 {gradingAnalysis.answeredCount}문항 기준 즉시 계산
              </p>
            </div>

            {/* 정답 / 오답 개수 */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">채점 현황</span>
              <div className="flex items-center gap-3 mt-1">
                <span className="inline-flex items-center gap-1 text-emerald-600 font-black text-sm">
                  <CheckCircle2 size={16} /> {gradingAnalysis.correctCount} 정답
                </span>
                <span className="inline-flex items-center gap-1 text-rose-500 font-black text-sm">
                  <XCircle size={16} /> {gradingAnalysis.wrongCount} 오답
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold mt-1">
                미응시: {gradingAnalysis.totalQuestions - gradingAnalysis.answeredCount}문항
              </span>
            </div>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-[11px] font-bold text-amber-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Edit3 size={14} className="text-amber-600 shrink-0" />
              <span>
                학생이 직접 입력한 답안이며, <strong>선생님이 직접 아래 칸을 클릭하여 답안을 수정하거나 수동 입력</strong>할 수 있습니다.
              </span>
            </span>
            <span className="text-[10px] text-amber-600 shrink-0 font-medium ml-2">
              (동기화 지연 시 수동 입력 지원)
            </span>
          </div>

          {/* 문항별 상세 목록 테이블 */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3.5 w-16 text-center">번호</th>
                  <th className="py-2.5 px-3 w-16 text-center">배점</th>
                  <th className="py-2.5 px-3 w-20 text-center">정답</th>
                  <th className="py-2.5 px-3">학생 답안 (선생님 수동 수정 가능)</th>
                  <th className="py-2.5 px-3.5 w-24 text-center">가채점 판정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {gradingAnalysis.items.map((item) => (
                  <tr key={item.question.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 text-center font-black text-slate-900">
                      {item.index}번
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-400 font-medium">
                      {item.points}점
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px]">
                        {item.correctAnswer || '-'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={editableAnswers[item.question.id] ?? ''}
                        onChange={(e) => handleAnswerChange(item.question.id, e.target.value)}
                        placeholder="미작성 (클릭하여 입력 가능)"
                        className={`w-full max-w-[280px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors focus:outline-hidden ${
                          editableAnswers[item.question.id]
                            ? 'bg-white border-indigo-300 text-slate-900 focus:border-indigo-500'
                            : 'bg-slate-50 border-slate-200 text-slate-400 focus:bg-white focus:border-indigo-400'
                        }`}
                      />
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {item.isCorrect === true ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> 정답
                        </span>
                      ) : item.isCorrect === false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800">
                          <XCircle size={12} /> 오답
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">
                          대기
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        {/* 하단 액션 버튼 바 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-black text-xs hover:bg-slate-100 transition-colors cursor-pointer"
          >
            닫기
          </button>

          <div className="flex items-center gap-2.5">
            {/* 1. 수동 답안 임시 저장 버튼 */}
            <button
              type="button"
              disabled={isSaving || isSubmittingFinal}
              onClick={handleSaveManualAnswers}
              className="px-4 py-2.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>선생님 수동 답안 저장</span>
            </button>

            {/* 2. 최종 제출 및 공식 채점 처리 버튼 */}
            <button
              type="button"
              disabled={isSaving || isSubmittingFinal}
              onClick={handleSubmitFinal}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmittingFinal ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>이 답안으로 즉시 최종 제출</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
