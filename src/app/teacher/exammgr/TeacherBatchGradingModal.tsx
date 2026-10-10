'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckSquare, 
  X, 
  Check, 
  XCircle, 
  CheckCircle2, 
  ChevronRight, 
  Loader2, 
  Save, 
  Users, 
  RotateCcw,
  Sparkles,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { ExamPaper } from '@/app/api/test2/exam/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';

interface StudentItem {
  id: string;
  name: string;
  grade?: string;
}

interface TeacherBatchGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
  students: StudentItem[];
  submissions: StudentSubmission[];
  initialStudentId?: string;
  onSubmissionUpdated: (updatedSub: StudentSubmission) => void;
}

export default function TeacherBatchGradingModal({
  isOpen,
  onClose,
  exam,
  students,
  submissions,
  initialStudentId,
  onSubmissionUpdated,
}: TeacherBatchGradingModalProps) {
  // 현재 채점 대상 학생 ID
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  // 문항별 O/X 상태: { [qId]: true(맞음) | false(틀림) }
  const [gradingState, setGradingState] = useState<Record<string, boolean>>({});
  
  // 문항별 학생 답안(선택 사항): { [qId]: string }
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 배정된 학생 목록 추출
  const assignedStudents = useMemo(() => {
    if (!exam || !exam.assigned_student_ids) return [];
    return exam.assigned_student_ids.map((id) => {
      const found = students.find((s) => s.id === id);
      return found || { id, name: '미등록 학생' };
    });
  }, [exam, students]);

  // 제출 맵
  const subMap = useMemo(() => {
    const map = new Map<string, StudentSubmission>();
    submissions.forEach((s) => {
      if (s.exam_id === exam?.id) {
        map.set(s.student_id, s);
      }
    });
    return map;
  }, [submissions, exam]);

  // 학생 변경 또는 모달 열림 시 초기화
  useEffect(() => {
    if (isOpen && exam) {
      const defaultId = initialStudentId && exam.assigned_student_ids?.includes(initialStudentId)
        ? initialStudentId
        : (exam.assigned_student_ids?.[0] || '');
      setSelectedStudentId(defaultId);
    }
  }, [isOpen, exam, initialStudentId]);

  // 선택된 학생의 기존 답안/채점 상태 로드
  useEffect(() => {
    if (!selectedStudentId || !exam) return;

    const existingSub = subMap.get(selectedStudentId);
    const initialGrading: Record<string, boolean> = {};
    const initialAnswers: Record<string, string> = {};

    exam.questions.forEach((q) => {
      if (existingSub?.answers?.[q.id]) {
        const a = existingSub.answers[q.id];
        initialGrading[q.id] = a.is_correct === true;
        initialAnswers[q.id] = a.user_answer || '';
      } else {
        // 기존 제출이 없는 경우 기본값은 정답(true)으로 편의 세팅!
        // (선생님은 종이 보면서 틀린 문항만 X로 콕콕 바꾸면 됨)
        initialGrading[q.id] = true;
        initialAnswers[q.id] = q.answer || '';
      }
    });

    setGradingState(initialGrading);
    setCustomAnswers(initialAnswers);
    setSaveSuccessMsg(null);
  }, [selectedStudentId, exam, subMap]);

  if (!isOpen || !exam) return null;

  // 실시간 점수 및 정답 개수 계산
  const totalQuestions = exam.questions.length;
  let correctCount = 0;
  let earnedPoints10 = 0;
  let totalPoints10 = 0;

  exam.questions.forEach((q) => {
    const qPoint = typeof q.points === 'number' && q.points > 0
      ? q.points
      : (totalQuestions > 0 ? 100 / totalQuestions : 0);
    const qPoint10 = Math.round(qPoint * 10);
    totalPoints10 += qPoint10;

    if (gradingState[q.id]) {
      correctCount++;
      earnedPoints10 += qPoint10;
    }
  });

  const calculatedScore = totalPoints10 > 0
    ? Math.round((earnedPoints10 / totalPoints10) * 1000) / 10
    : (totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0);
  const finalScore = Number.isInteger(calculatedScore) ? calculatedScore : Number(calculatedScore.toFixed(1));

  // 전체 O / 전체 X 일괄 설정
  const handleSetAll = (allCorrect: boolean) => {
    const nextGrading: Record<string, boolean> = {};
    exam.questions.forEach((q) => {
      nextGrading[q.id] = allCorrect;
    });
    setGradingState(nextGrading);
  };

  // 문항 O/X 토글
  const handleToggleQuestion = (qId: string) => {
    setGradingState((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  // 채점 데이터 저장
  const handleSaveGrading = async (moveToNext = false) => {
    if (!selectedStudentId || !exam) return;

    try {
      setSaving(true);
      setSaveSuccessMsg(null);

      const res = await fetch('/api/test2/student-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          examId: exam.id,
          teacherGrading: gradingState,
          answers: customAnswers,
          submittedBy: 'teacher',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '채점 저장에 실패했습니다.');
      }

      // 부모 컴포넌트에 갱신된 제출 정보 전달
      onSubmissionUpdated(data.submission);
      setSaveSuccessMsg('채점 결과가 성공적으로 저장되었습니다!');

      // 다음 학생으로 자동 이동
      if (moveToNext) {
        const currentIdx = assignedStudents.findIndex((s) => s.id === selectedStudentId);
        if (currentIdx !== -1 && currentIdx + 1 < assignedStudents.length) {
          setSelectedStudentId(assignedStudents[currentIdx + 1].id);
        } else {
          setTimeout(() => onClose(), 600);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`채점 저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const gradedCount = assignedStudents.filter((s) => subMap.has(s.id)).length;
  const currentStudentObj = assignedStudents.find((s) => s.id === selectedStudentId);
  const currentSub = subMap.get(selectedStudentId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 animate-in zoom-in-95 duration-200">
      <div className="bg-white rounded-[32px] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* 🌟 헤더 영역 */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700">
              <CheckSquare size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-800">
                  선생 일괄 채점
                </h3>
                <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-200">
                  '{exam.title}'
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                종이 시험지를 걷어 문항별 <strong className="text-emerald-600 font-bold">O</strong>/<strong className="text-rose-600 font-bold">X</strong>로 빠르게 채점합니다. 틀린 문제만 클릭하여 X로 바꾸면 즉시 완료됩니다!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all font-bold"
          >
            <X size={20} />
          </button>
        </div>

        {/* 🌟 학생 선택 탭 바 */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <div className="text-xs font-bold text-slate-400 shrink-0 flex items-center gap-1 mr-2">
            <Users size={14} />
            <span>학생 ({gradedCount}/{assignedStudents.length}명 완료):</span>
          </div>
          {assignedStudents.map((st) => {
            const isSelected = st.id === selectedStudentId;
            const sub = subMap.get(st.id);
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStudentId(st.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 font-black ring-2 ring-violet-300'
                    : sub
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{st.name}</span>
                {sub ? (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-200/60 text-emerald-900'}`}>
                    {sub.score}점
                  </span>
                ) : (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    미제출
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 🌟 현재 학생 점수 및 일괄 조작 카드 */}
        <div className="p-4 md:px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400">채점 대상:</span>
              <h4 className="text-lg font-black text-slate-800">
                {currentStudentObj?.name || '학생'}
                {currentStudentObj?.grade && <span className="text-xs text-slate-500 font-bold ml-1.5">({currentStudentObj.grade})</span>}
              </h4>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold block">환산 점수</span>
                <span className="text-xl font-black text-violet-700">{finalScore}점</span>
              </div>
              <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold block">맞힌 개수</span>
                <span className="text-sm font-bold text-slate-700">
                  <strong className="text-emerald-600 font-black text-lg">{correctCount}</strong> / {totalQuestions}문항
                </span>
              </div>
            </div>
          </div>

          {/* 일괄 액션 버튼 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSetAll(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 size={13} />
              <span>전체 O (정답)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetAll(false)}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <XCircle size={13} />
              <span>전체 X (오답)</span>
            </button>
          </div>
        </div>

        {/* 🌟 문항 목록 (초고속 O/X 터치 패널) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 scrollbar-thin bg-slate-100/50">
          {exam.questions.map((q, idx) => {
            const isCorrect = gradingState[q.id] === true;
            const points = q.points || (totalQuestions > 0 ? Math.round((100 / totalQuestions) * 10) / 10 : 0);
            const qType = (q as any).question_type || (q.is_descriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(String(q.answer).trim()) ? 'MULTIPLE' : 'SHORT'));

            return (
              <div
                key={q.id}
                className={`p-3 md:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isCorrect
                    ? 'bg-emerald-50/70 border-emerald-200 shadow-xs'
                    : 'bg-rose-50/70 border-rose-200 shadow-xs'
                }`}
              >
                {/* 문항 정보 */}
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">
                        문항 {idx + 1}번
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                        {points}점
                      </span>
                      <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-100">
                        {qType === 'MULTIPLE' ? '객관식' : (qType === 'DESCRIPTIVE' ? '서술형' : '단답형')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>시스템 정답: <strong className="text-slate-800 font-bold">{q.answer || q.raw_answer || '-'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* 초고속 O / X 토글 버튼 그룹 */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setGradingState((prev) => ({ ...prev, [q.id]: true }));
                    }}
                    className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                      isCorrect
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-300 scale-105'
                        : 'bg-white hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 border border-slate-200'
                    }`}
                  >
                    <Check size={16} />
                    <span>O 맞음 (+{points}점)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGradingState((prev) => ({ ...prev, [q.id]: false }));
                    }}
                    className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                      !isCorrect
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-300 scale-105'
                        : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-700 border border-slate-200'
                    }`}
                  >
                    <X size={16} />
                    <span>X 틀림 (0점)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 🌟 하단 푸터 바 */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-white flex items-center justify-between">
          <div>
            {saveSuccessMsg && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={14} />
                <span>{saveSuccessMsg}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              닫기
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveGrading(false)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>이 학생 채점 저장</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveGrading(true)}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-violet-600/30 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={15} />}
              <span>저장 후 다음 학생 채점</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
