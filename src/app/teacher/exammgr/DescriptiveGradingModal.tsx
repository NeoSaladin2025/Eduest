'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Clock, 
  AlertCircle, 
  BookOpen, 
  Sparkles, 
  User, 
  Check, 
  Loader2,
  ExternalLink,
  ChevronRight,
  FileQuestion
} from 'lucide-react';

export interface PendingGradingItem {
  submission_id: string;
  student_id: string;
  student_name: string;
  exam_id: string;
  exam_title: string;
  question_id: string;
  question_number: number;
  question_name: string;
  image_url: string;
  user_answer: string;
  correct_answer: string;
  raw_answer: string;
  solution_drive_id: string;
  points: number;
  submitted_at: string;
  proof_image_url?: string;
}

interface DescriptiveGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGradedChange?: (remainingCount: number) => void;
}

export default function DescriptiveGradingModal({
  isOpen,
  onClose,
  onGradedChange,
}: DescriptiveGradingModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PendingGradingItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showSolutionCheck, setShowSolutionCheck] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 대기 목록 로드
  const fetchPendingItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/test2/descriptive-grading');
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
        setSelectedIndex(0);
        if (onGradedChange) {
          onGradedChange(data.items.length);
        }
      }
    } catch (e) {
      console.error('Failed to load pending grading items:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPendingItems();
      setShowSolutionCheck(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentItem = items[selectedIndex] || null;

  // 채점 승인/오답 확정 처리
  const handleGrade = async (isCorrect: boolean) => {
    if (!currentItem) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/test2/descriptive-grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: currentItem.student_id,
          exam_id: currentItem.exam_id,
          question_id: currentItem.question_id,
          is_correct: isCorrect,
          show_solution: showSolutionCheck,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // 목록에서 제거
        const updated = items.filter((_, idx) => idx !== selectedIndex);
        setItems(updated);
        const nextIdx = Math.min(selectedIndex, Math.max(0, updated.length - 1));
        setSelectedIndex(nextIdx);

        if (onGradedChange) {
          onGradedChange(updated.length);
        }
      } else {
        alert(`채점 반영 실패: ${data.error || '오류 발생'}`);
      }
    } catch (e) {
      console.error('Grade error:', e);
      alert('채점 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* 모달 헤더 */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-md shadow-violet-500/30">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">서술형 문항 채점 검토</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                  대기 {items.length}건
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                학생 답안과 모범 정답을 비교하여 [정답 인정] 또는 [오답 처리]를 원클릭으로 승인하세요.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* 모달 본문 */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 size={32} className="animate-spin text-violet-600" />
            <p className="text-xs font-bold text-slate-500">채점 대기 문항을 불러오는 중...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-base font-black text-slate-800">모든 서술형 채점이 완료되었습니다!</h3>
            <p className="text-xs text-slate-400">현재 대기 중인 서술형 문항이 없습니다. 수고하셨습니다.</p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
            
            {/* 좌측: 대기 문항 리스트 (4 cols) */}
            <div className="md:col-span-4 bg-slate-50/80 p-4 overflow-y-auto space-y-2 scrollbar-thin max-h-[70vh]">
              <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>채점 대기 목록 ({items.length})</span>
                <span className="text-[10px] text-violet-600 font-bold">항목 클릭 시 선택</span>
              </div>

              {items.map((it, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${it.submission_id}_${it.question_id}`}
                    onClick={() => setSelectedIndex(idx)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer select-none text-xs space-y-1.5 ${
                      isSelected
                        ? 'bg-white border-violet-500 shadow-md shadow-violet-100 ring-2 ring-violet-500/10'
                        : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-black text-slate-800">
                        <User size={13} className="text-violet-600" />
                        <span>{it.student_name}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 font-black text-[10px]">
                        문항 {it.question_number}번
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate font-medium" title={it.exam_title}>
                      {it.exam_title}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>배점: {it.points}점</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(it.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 우측: 상세 비교 및 채점 판정 뷰 (8 cols) */}
            {currentItem && (
              <div className="md:col-span-8 p-6 overflow-y-auto space-y-5 bg-white max-h-[70vh]">
                
                {/* 문항 헤더 정보 */}
                <div className="flex items-center justify-between bg-violet-50/60 p-4 rounded-2xl border border-violet-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-violet-600 text-white font-black flex items-center justify-center text-xs">
                        {currentItem.question_number}
                      </span>
                      <h4 className="text-sm font-black text-slate-800">
                        {currentItem.student_name} 학생의 답안 검토
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      시험지: <span className="font-bold text-slate-700">{currentItem.exam_title}</span> (문항 배점: {currentItem.points}점)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentItem.image_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(currentItem.image_url)}
                        className="px-3 py-1.5 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-xs font-black flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <Eye size={14} />
                        문제 이미지 보기
                      </button>
                    )}
                    {currentItem.solution_drive_id && (
                      <a
                        href={`https://lh3.googleusercontent.com/d/${currentItem.solution_drive_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-violet-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                      >
                        <ExternalLink size={13} />
                        원본 파일
                      </a>
                    )}
                  </div>
                </div>

                {/* 2단 비교 박스: 학생 제출 답안 vs 시스템 추출 모범 정답 */}
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* 1. 학생 제출 답안 */}
                  <div className="p-4.5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                        <span className="text-xs font-black text-indigo-900 uppercase tracking-wider">
                          🧑‍🎓 학생이 실제 입력한 답안
                        </span>
                      </div>
                      <span className="text-[10px] text-indigo-600 font-bold bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                        학생: {currentItem.student_name}
                      </span>
                    </div>

                    <div className="p-3.5 bg-white rounded-xl border border-indigo-100 text-slate-900 font-black text-sm whitespace-pre-wrap leading-relaxed shadow-2xs">
                      {currentItem.user_answer ? currentItem.user_answer : (
                        <span className="text-slate-400 italic font-normal">(제출된 텍스트 답안 없음)</span>
                      )}
                    </div>

                    {currentItem.proof_image_url && (
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600">풀이 사진 첨부됨:</span>
                        <button
                          type="button"
                          onClick={() => setPreviewImage(currentItem.proof_image_url!)}
                          className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                        >
                          <Eye size={12} />
                          학생 풀이 노트 보기
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 2. 시스템 추출 모범 정답 */}
                  <div className="p-4.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-violet-600" />
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          📖 시스템 추출 모범 정답 및 해설 요약
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">
                        채점 기준 모범답안
                      </span>
                    </div>

                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-slate-800 font-bold text-xs whitespace-pre-wrap leading-relaxed shadow-2xs">
                      {currentItem.correct_answer || currentItem.raw_answer}
                    </div>

                    {currentItem.raw_answer && currentItem.raw_answer !== currentItem.correct_answer && (
                      <div className="text-[11px] text-slate-400 px-1 truncate" title={currentItem.raw_answer}>
                        해설 원문: {currentItem.raw_answer}
                      </div>
                    )}
                  </div>
                </div>

                {/* 하단 판정 컨트롤 & 모범답안 공개 체크박스 */}
                <div className="pt-4 border-t border-slate-200 space-y-3.5">
                  
                  {/* 🌟 모범답안 및 해설 학생에게 공개 체크박스 */}
                  <div className="flex items-center justify-between bg-violet-50/70 p-3 rounded-xl border border-violet-200">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-violet-900">
                      <input
                        type="checkbox"
                        checked={showSolutionCheck}
                        onChange={(e) => setShowSolutionCheck(e.target.checked)}
                        className="w-4 h-4 text-violet-600 rounded focus:ring-violet-500 accent-violet-600 cursor-pointer"
                      />
                      <span>학생에게 모범 정답 및 원본 해설 페이지 열람 허용</span>
                    </label>
                    <span className="text-[11px] text-violet-600 font-medium">
                      * 정답 인정 / 오답 처리 시 학생 결과 화면에 모범 풀이가 공개됩니다.
                    </span>
                  </div>

                  {/* 승인 액션 버튼 */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleGrade(true)}
                      className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 hover:shadow-none transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 size={18} />
                          <span>⭕ 정답 인정 ({currentItem.points}점 부여)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleGrade(false)}
                      className="py-3.5 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-200 hover:shadow-none transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <XCircle size={18} />
                          <span>❌ 오답 처리 (0점)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </div>

      {/* 이미지 미리보기 팝업 */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] bg-white rounded-2xl p-2 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-1.5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <img src={previewImage} alt="미리보기" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
