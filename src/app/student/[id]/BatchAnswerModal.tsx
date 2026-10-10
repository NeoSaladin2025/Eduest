'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  X, 
  Check, 
  HelpCircle, 
  Send, 
  Plus, 
  Minus, 
  CheckCircle2, 
  AlertCircle,
  FileCheck,
  Camera,
  Edit3
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';

interface BatchAnswerModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
  userAnswers: Record<string, any>;
  customSubLabels: Record<string, string[]>;
  descriptiveSubmitModes: Record<string, 'PAPER' | 'PHOTO' | 'TEXT'>;
  onApplyAnswers: (
    updatedAnswers: Record<string, any>,
    updatedSubLabels: Record<string, string[]>,
    updatedModes: Record<string, 'PAPER' | 'PHOTO' | 'TEXT'>,
    andSubmit?: boolean
  ) => void;
}

export default function BatchAnswerModal({
  isOpen,
  onClose,
  exam,
  userAnswers,
  customSubLabels,
  descriptiveSubmitModes,
  onApplyAnswers,
}: BatchAnswerModalProps) {
  // 로컬 편집 상태 복사본
  const [localAnswers, setLocalAnswers] = useState<Record<string, any>>({});
  const [localSubLabels, setLocalSubLabels] = useState<Record<string, string[]>>({});
  const [localModes, setLocalModes] = useState<Record<string, 'PAPER' | 'PHOTO' | 'TEXT'>>({});

  // 인풋 ref 관리 (Enter/Tab 연타 시 다음 문항 자동 포커스용)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (isOpen) {
      setLocalAnswers({ ...userAnswers });
      setLocalSubLabels({ ...customSubLabels });
      setLocalModes({ ...descriptiveSubmitModes });
    }
  }, [isOpen, userAnswers, customSubLabels, descriptiveSubmitModes]);

  if (!isOpen || !exam) return null;

  // 문항 소문항 라벨 계산
  const getSubLabels = (q: ExamQuestion): string[] => {
    if (localSubLabels[q.id] !== undefined) {
      return localSubLabels[q.id];
    }
    if (Array.isArray(q.sub_questions) && q.sub_questions.length >= 2) {
      return q.sub_questions.map((sq: any) => sq.label);
    }
    const ans = localAnswers[q.id];
    if (typeof ans === 'object' && ans !== null && Object.keys(ans).length >= 2) {
      return Object.keys(ans);
    }
    return [];
  };

  // 소분항 추가/분할
  const handleSplitSubQuestion = (qId: string) => {
    const qObj = exam.questions.find((q) => q.id === qId);
    if (!qObj) return;
    const curLabels = getSubLabels(qObj);
    let nextLabels: string[];
    if (curLabels.length === 0) {
      nextLabels = ['(1)', '(2)'];
    } else {
      nextLabels = [...curLabels, `(${curLabels.length + 1})`];
    }
    setLocalSubLabels((prev) => ({ ...prev, [qId]: nextLabels }));
  };

  const handleRemoveSubQuestion = (qId: string) => {
    const qObj = exam.questions.find((q) => q.id === qId);
    if (!qObj) return;
    const curLabels = getSubLabels(qObj);
    if (curLabels.length <= 2) {
      // 2개 이하에서 제거 시 일반 단일 입력창으로 복귀
      const nextSub = { ...localSubLabels };
      delete nextSub[qId];
      setLocalSubLabels(nextSub);
      setLocalAnswers((prev) => {
        const next = { ...prev };
        next[qId] = '';
        return next;
      });
    } else {
      const nextLabels = curLabels.slice(0, -1);
      setLocalSubLabels((prev) => ({ ...prev, [qId]: nextLabels }));
    }
  };

  // 일반 단답/객관식 답안 입력
  const handleAnswerChange = (qId: string, val: any) => {
    setLocalAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  // 소문항 개별 답안 입력
  const handleSubAnswerChange = (qId: string, label: string, val: string) => {
    setLocalAnswers((prev) => {
      let cur = prev[qId];
      let subMap: Record<string, string> = {};
      if (typeof cur === 'object' && cur !== null) {
        subMap = { ...cur };
      } else if (typeof cur === 'string') {
        try {
          subMap = JSON.parse(cur);
        } catch {
          subMap = {};
        }
      }
      subMap[label] = val;
      return { ...prev, [qId]: subMap };
    });
  };

  // 서술형 모드 변경
  const handleModeChange = (qId: string, mode: 'PAPER' | 'PHOTO' | 'TEXT') => {
    setLocalModes((prev) => ({ ...prev, [qId]: mode }));
    if (mode === 'PAPER') {
      handleAnswerChange(qId, '__DIRECT_PAPER__');
    } else if (mode === 'PHOTO') {
      handleAnswerChange(qId, '__PHOTO_SUBMISSION__');
    } else {
      if (localAnswers[qId] === '__DIRECT_PAPER__' || localAnswers[qId] === '__PHOTO_SUBMISSION__') {
        handleAnswerChange(qId, '');
      }
    }
  };

  // 다음 문항 인풋으로 포커스 이동
  const focusNextQuestion = (currentIndex: number) => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < exam.questions.length) {
      const nextQ = exam.questions[nextIdx];
      const nextInput = inputRefs.current[nextQ.id];
      if (nextInput) {
        nextInput.focus();
      }
    }
  };

  // 마킹 완료된 문항 수 계산
  const filledCount = exam.questions.filter((q) => {
    const ans = localAnswers[q.id];
    if (!ans) return false;
    if (ans === '__DIRECT_PAPER__' || ans === '__PHOTO_SUBMISSION__' || ans === '모름') return true;
    if (typeof ans === 'object') {
      return Object.values(ans).some((v) => String(v).trim().length > 0);
    }
    return String(ans).trim().length > 0;
  }).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-white/15 rounded-[32px] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-3xl overflow-hidden">
        
        {/* 🌟 헤더 영역 */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white">종이 시험지 답안 일괄 마킹 (OMR)</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs">
                  {filledCount} / {exam.questions.length}문항 작성됨
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                종이 시험지로 풀이한 답을 한 화면에서 빠르게 입력하세요. 단답형은 <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-slate-300 font-mono">Enter</kbd>를 누르면 다음 문제로 자동 이동합니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 🌟 문항 목록 (세로 스크롤 카드) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {exam.questions.map((q, idx) => {
            const currentAns = localAnswers[q.id] || '';
            const qType = (q as any).question_type || (q.is_descriptive ? 'DESCRIPTIVE' : (/^[1-5]$/.test(String(q.answer).trim()) ? 'MULTIPLE' : 'SHORT'));
            const subLabels = getSubLabels(q);
            const hasSub = subLabels.length >= 2;
            const isDirectPaper = currentAns === '__DIRECT_PAPER__';
            const isPhotoSub = currentAns === '__PHOTO_SUBMISSION__';
            const isUnknown = currentAns === '모름';
            const currentMode = localModes[q.id] || (isDirectPaper ? 'PAPER' : (isPhotoSub ? 'PHOTO' : 'TEXT'));

            return (
              <div 
                key={q.id}
                className={`p-4 md:p-5 rounded-2xl border transition-all ${
                  isUnknown 
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : currentAns 
                    ? 'bg-white/5 border-emerald-500/30' 
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
              >
                {/* 문항 번호 및 메타 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-white/10 text-white font-black text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-slate-200">
                      문제 {idx + 1}번
                    </span>
                    {q.points && (
                      <span className="text-[11px] font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md">
                        {q.points}점
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-md uppercase">
                      {qType === 'MULTIPLE' ? '객관식' : (qType === 'DESCRIPTIVE' ? '서술형' : '단답형')}
                    </span>
                  </div>

                  {/* 모름(?) 토글 버튼 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isUnknown) {
                        handleAnswerChange(q.id, '');
                      } else {
                        handleAnswerChange(q.id, '모름');
                      }
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isUnknown
                        ? 'bg-amber-500 text-neutral-950 font-black shadow-lg shadow-amber-500/20'
                        : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-300'
                    }`}
                  >
                    <HelpCircle size={13} />
                    <span>{isUnknown ? '모름 선택됨' : '모름'}</span>
                  </button>
                </div>

                {/* 문항별 답안 입력 컨트롤 */}
                {!isUnknown && (
                  <div className="mt-2">
                    {/* 1. 객관식 문항 (1 ~ 5) */}
                    {qType === 'MULTIPLE' && (
                      <div className="flex items-center gap-2 md:gap-3">
                        {['1', '2', '3', '4', '5'].map((num) => {
                          const isSelected = String(currentAns) === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => {
                                const nextVal = isSelected ? '' : num;
                                handleAnswerChange(q.id, nextVal);
                                if (nextVal) focusNextQuestion(idx);
                              }}
                              className={`w-11 h-11 md:w-12 md:h-12 rounded-2xl font-black text-sm md:text-base transition-all flex items-center justify-center ${
                                isSelected
                                  ? 'bg-emerald-500 text-neutral-950 shadow-lg shadow-emerald-500/30 scale-105 ring-2 ring-emerald-300'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                              }`}
                            >
                              {num === '1' ? '①' : num === '2' ? '②' : num === '3' ? '③' : num === '4' ? '④' : '⑤'}
                            </button>
                          );
                        })}
                        <span className="text-xs text-slate-500 ml-2">
                          (클릭 또는 번호 선택)
                        </span>
                      </div>
                    )}

                    {/* 2. 단답형 문항 (단일 또는 (1)(2) 소분항) */}
                    {qType === 'SHORT' && (
                      <div className="space-y-2">
                        {hasSub ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>소문항별 답안 입력:</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSplitSubQuestion(q.id)}
                                  className="px-2 py-0.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 rounded text-[11px] font-bold flex items-center gap-1"
                                >
                                  <Plus size={12} /> 소문항 추가
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubQuestion(q.id)}
                                  className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-[11px] font-bold flex items-center gap-1"
                                >
                                  <Minus size={12} /> 삭제
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {subLabels.map((lbl, sIdx) => {
                                const subVal = (typeof currentAns === 'object' && currentAns !== null) ? (currentAns[lbl] || '') : '';
                                return (
                                  <div key={lbl} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                                    <span className="font-bold text-violet-400 text-xs shrink-0">{lbl}</span>
                                    <input
                                      type="text"
                                      value={subVal}
                                      onChange={(e) => handleSubAnswerChange(q.id, lbl, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (sIdx === subLabels.length - 1) {
                                            focusNextQuestion(idx);
                                          }
                                        }
                                      }}
                                      placeholder="정답"
                                      className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <input
                              ref={(el) => { inputRefs.current[q.id] = el; }}
                              type="text"
                              value={typeof currentAns === 'string' ? currentAns : ''}
                              onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  focusNextQuestion(idx);
                                }
                              }}
                              placeholder="정답 입력 (예: 83, -2 등)"
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => handleSplitSubQuestion(q.id)}
                              className="px-3 py-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
                              title="(1), (2) 소분항으로 분할 입력"
                            >
                              <Plus size={14} className="text-violet-400" />
                              <span>(1),(2) 분할</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. 서술형 문항 (종이 직접제출 / 사진 / 텍스트) */}
                    {qType === 'DESCRIPTIVE' && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleModeChange(q.id, 'PAPER')}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                              currentMode === 'PAPER'
                                ? 'bg-emerald-500 text-neutral-950 font-black shadow-lg shadow-emerald-500/20'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            <FileCheck size={14} />
                            <span>📄 종이 직접 제출</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModeChange(q.id, 'PHOTO')}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                              currentMode === 'PHOTO'
                                ? 'bg-indigo-600 text-white font-black shadow-lg shadow-indigo-600/30'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Camera size={14} />
                            <span>📸 사진 제출 (시험화면에서 촬영)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModeChange(q.id, 'TEXT')}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                              currentMode === 'TEXT'
                                ? 'bg-violet-600 text-white font-black shadow-lg shadow-violet-600/30'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Edit3 size={14} />
                            <span>✏️ 풀이/답안 직접 텍스트 입력</span>
                          </button>
                        </div>

                        {currentMode === 'TEXT' && (
                          <textarea
                            value={typeof currentAns === 'string' && !currentAns.startsWith('__') ? currentAns : ''}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                            rows={2}
                            placeholder="서술형 풀이 또는 최종 정답 입력..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs font-medium focus:outline-none focus:border-violet-500"
                          />
                        )}
                        {currentMode === 'PAPER' && (
                          <p className="text-[11px] text-emerald-400 font-bold">
                            ✓ 종이 시험지에 풀이한 내용을 시험 종료 후 선생님께 직접 제출합니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 🌟 하단 액션 버튼 바 */}
        <div className="p-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (confirm('모든 입력 내용을 초기화하시겠습니까?')) {
                setLocalAnswers({});
              }
            }}
            className="px-4 py-2.5 bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 rounded-xl text-xs font-bold transition-all"
          >
            전체 비우기
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs rounded-xl transition-all"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyAnswers(localAnswers, localSubLabels, localModes, false);
                onClose();
              }}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 active:scale-95"
            >
              <Check size={16} />
              <span>답안 반영하기</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyAnswers(localAnswers, localSubLabels, localModes, true);
                onClose();
              }}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-violet-600/30 flex items-center gap-2 active:scale-95"
            >
              <Send size={15} />
              <span>반영 후 바로 최종 제출</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
