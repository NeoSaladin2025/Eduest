'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, RotateCcw, Check, Loader2, Eye } from 'lucide-react';
import type { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { CIRCLED_NUMBERS, generateChoicesFromShortAnswer } from '@/lib/choiceGenerator';
import { extractSourceFileName } from '@/lib/clientQuestionParser';
import ChoiceTextRenderer from '@/components/ChoiceTextRenderer';

interface ExamChoicesEditModalProps {
  exam: ExamPaper | null;
  onClose: () => void;
  onSaved: (updatedExam: ExamPaper) => void;
  onPreviewQuestion?: (q: ExamQuestion) => void;
}

export default function ExamChoicesEditModal({
  exam,
  onClose,
  onSaved,
  onPreviewQuestion,
}: ExamChoicesEditModalProps) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (exam) {
      setQuestions(
        (exam.questions || []).map((q) => ({
          ...q,
          choices: Array.isArray(q.choices) ? [...q.choices] : undefined,
        }))
      );
    }
  }, [exam]);

  if (!exam) return null;

  const handleConvert = (idx: number) => {
    const q = questions[idx];
    if (!q) return;
    if (Array.isArray(q.sub_questions) && q.sub_questions.length >= 2) {
      alert('소문항이 2개 이상 분할된 문항은 자동 객관식화를 지원하지 않습니다.');
      return;
    }
    const baseAnswer = (q.original_short_answer || q.answer || '').trim();
    if (!baseAnswer) {
      alert('원래 정답이 비어 있어 객관식 보기를 만들 수 없습니다.');
      return;
    }

    const generated = generateChoicesFromShortAnswer(baseAnswer);
    setQuestions((prev) => {
      const next = [...prev];
      if (generated) {
        next[idx] = {
          ...q,
          original_short_answer: q.original_short_answer || q.answer,
          choices: generated.choices,
          answer: String(generated.correctIndex),
          question_type: 'MULTIPLE',
          is_descriptive: false,
        };
      } else {
        // 긴 문장형 답안: 편집 가능한 5지 선지 칸을 열어줌
        next[idx] = {
          ...q,
          original_short_answer: q.original_short_answer || q.answer,
          choices: [baseAnswer, '', '', '', ''],
          answer: '1',
          question_type: 'MULTIPLE',
          is_descriptive: false,
        };
      }
      return next;
    });

    if (!generated) {
      alert('긴 문장형/복합 답안입니다. ①번에 정답을 채워두었으니 나머지 오답 보기를 입력하거나 마눌에게 선지 주입을 요청해 주세요!');
    }
  };

  const handleRevert = (idx: number) => {
    const q = questions[idx];
    if (!q) return;
    const restoredAns = q.original_short_answer || q.answer;
    setQuestions((prev) => {
      const next = [...prev];
      next[idx] = {
        ...q,
        answer: restoredAns,
        choices: undefined,
        original_short_answer: undefined,
        question_type: /^[1-5]$/.test(restoredAns.trim()) ? 'MULTIPLE' : 'SHORT',
        is_descriptive: false,
      };
      return next;
    });
  };

  const handleChoiceChange = (qIdx: number, cIdx: number, val: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const cur = next[qIdx];
      if (!cur) return prev;
      const nextChoices = Array.isArray(cur.choices) ? [...cur.choices] : ['', '', '', '', ''];
      nextChoices[cIdx] = val;
      next[qIdx] = { ...cur, choices: nextChoices };
      return next;
    });
  };

  const handleSave = async () => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (Array.isArray(q.choices) && q.choices.length > 0) {
        if (q.choices.length !== 5 || q.choices.some((c) => !c.trim())) {
          alert(`${i + 1}번 문항의 ①~⑤ 보기를 모두 채워주세요.`);
          return;
        }
        if (!/^[1-5]$/.test(String(q.answer || '').trim())) {
          alert(`${i + 1}번 문항의 객관식 정답 번호(1~5)를 선택해주세요.`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      const res = await fetch('/api/test2/exam', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          questions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }
      onSaved(data.exam);
      onClose();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '문항/보기 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Sparkles size={17} className="text-amber-300" />
              <span>문항 · 객관식 보기 관리 ({exam.title})</span>
            </h3>
            <p className="text-[11px] text-indigo-100 mt-0.5">
              단답형을 즉석 객관식화하거나, 주입된 5지 선지를 수정·검수할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/70">
          {questions.map((q, idx) => {
            const hasChoices = Array.isArray(q.choices) && q.choices.length === 5;
            const isDescriptive = q.question_type === 'DESCRIPTIVE' || !!q.is_descriptive;
            const isMultiple = q.question_type === 'MULTIPLE' || (!q.question_type && !isDescriptive && /^[1-5]$/.test(String(q.answer || '').trim()));
            const canConvert = !hasChoices && !isMultiple && !(Array.isArray(q.sub_questions) && q.sub_questions.length >= 2);

            return (
              <div key={q.id || idx} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg bg-violet-100 text-violet-800 font-black text-xs">
                      {idx + 1}번
                    </span>
                    {q.folder_name && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                        {q.folder_name}
                      </span>
                    )}
                    {extractSourceFileName(q) && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                        {extractSourceFileName(q)}
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-700">{q.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                        hasChoices
                          ? 'bg-indigo-100 text-indigo-700'
                          : isMultiple
                          ? 'bg-slate-100 text-slate-700'
                          : isDescriptive
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-violet-100 text-violet-700'
                      }`}
                    >
                      {hasChoices ? '보기 주입 객관식' : isMultiple ? '객관식' : isDescriptive ? '서술형' : '단답형'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onPreviewQuestion && q.image_url && (
                      <button
                        type="button"
                        onClick={() => onPreviewQuestion(q)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Eye size={12} /> 문제 보기
                      </button>
                    )}
                    {canConvert && (
                      <button
                        type="button"
                        onClick={() => handleConvert(idx)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-black flex items-center gap-1"
                      >
                        <Sparkles size={12} /> 객관식화
                      </button>
                    )}
                    {hasChoices && (
                      <button
                        type="button"
                        onClick={() => handleRevert(idx)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> 단답형 복구
                      </button>
                    )}
                  </div>
                </div>

                {hasChoices ? (
                  <div className="space-y-2 bg-indigo-50/40 p-3 rounded-xl border border-indigo-100">
                    {q.original_short_answer && (
                      <div className="text-[11px] font-bold text-slate-500">
                        원래 정답: <span className="text-indigo-700 font-black">{q.original_short_answer}</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {q.choices!.map((cText, cIdx) => {
                        const numStr = String(cIdx + 1);
                        const isAns = String(q.answer).trim() === numStr;
                        return (
                          <div key={cIdx} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setQuestions((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], answer: numStr };
                                  return next;
                                })
                              }
                              className={`w-7 h-7 rounded-lg font-black text-xs shrink-0 transition-all ${
                                isAns
                                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                                  : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-400'
                              }`}
                              title="정답 번호로 지정"
                            >
                              {CIRCLED_NUMBERS[cIdx]}
                            </button>
                            <input
                              type="text"
                              value={cText}
                              onChange={(e) => handleChoiceChange(idx, cIdx, e.target.value)}
                              placeholder={`보기 ${CIRCLED_NUMBERS[cIdx]} 입력`}
                              className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-bold focus:outline-none ${
                                isAns
                                  ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950'
                                  : 'border-slate-200 bg-white text-slate-800 focus:border-indigo-500'
                              }`}
                            />
                            {cText.trim() && (
                              <div className="hidden sm:block max-w-[220px] px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700">
                                <ChoiceTextRenderer text={cText} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-bold shrink-0">정답:</span>
                    <input
                      type="text"
                      value={q.answer}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuestions((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], answer: val };
                          return next;
                        });
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-black text-slate-800 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            <span>변경사항 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
}
