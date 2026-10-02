'use client';

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  FileText, 
  X, 
  Loader2, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { ReviewItem } from './types';

interface ReviewSolutionModalProps {
  items: ReviewItem[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ReviewSolutionModal({
  items,
  initialIndex = 0,
  onClose,
}: ReviewSolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // 'solution' (해설) 또는 'problem' (문제 원본)
  const [activeTab, setActiveTab] = useState<'solution' | 'problem'>('solution');
  
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentItem = items[currentIndex];

  useEffect(() => {
    if (!currentItem) return;

    let isCancelled = false;

    // 만약 해설 탭이고 solutionUrl이 있을 때 HTML 로딩
    if (activeTab === 'solution') {
      const solutionUrl = currentItem.solutionUrl || currentItem.fileId;

      if (!solutionUrl) {
        setHtmlContent(null);
        return;
      }

      // 이미 완전한 HTML이나 URL인 경우
      if (solutionUrl.startsWith('http') || solutionUrl.startsWith('data:')) {
        setHtmlContent(solutionUrl);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      fetch(`/api/drive/library/file?fileId=${encodeURIComponent(solutionUrl)}&type=html`)
        .then(res => res.json())
        .then(data => {
          if (isCancelled) return;
          if (data.success && data.data) {
            setHtmlContent(data.data);
          } else {
            // fallback: direct HTML이 아니라면
            setErrorMsg(data.error || '해설 문서를 불러오지 못했습니다.');
          }
        })
        .catch(err => {
          if (isCancelled) return;
          console.error('Failed to fetch solution html:', err);
          setErrorMsg('해설 로딩 중 통신 오류가 발생했습니다.');
        })
        .finally(() => {
          if (!isCancelled) setLoading(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [currentItem, activeTab]);

  if (!currentItem) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-white/10 rounded-[32px] md:rounded-[40px] max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden shadow-3xl">
        
        {/* 상단 헤더 바 */}
        <div className="p-4 md:p-5 border-b border-white/10 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          
          {/* 타이틀 및 메타정보 */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <BookOpen size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-black text-[10px] border border-indigo-500/30">
                  {currentItem.folderName}
                </span>
                {currentItem.answer && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-black text-[10px] border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    정답: {currentItem.answer}
                  </span>
                )}
              </div>
              <h3 className="text-sm md:text-base font-black text-white truncate mt-0.5">
                {currentItem.name.replace(/\.html?$/i, '')}
              </h3>
            </div>
          </div>

          {/* 중앙: 해설 / 문제 탭 전환 토글 */}
          <div className="flex items-center bg-black/40 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setActiveTab('solution')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'solution'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen size={14} />
              <span>해설 보기</span>
            </button>
            <button
              onClick={() => setActiveTab('problem')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'problem'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText size={14} />
              <span>문제 원본</span>
            </button>
          </div>

          {/* 우측: 문항 네비게이션 및 닫기 버튼 */}
          <div className="flex items-center gap-2">
            {items.length > 1 && (
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-white/5 transition-all"
                  title="이전 문항"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs font-mono font-bold text-slate-300 px-1">
                  {currentIndex + 1} / {items.length}
                </span>
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(items.length - 1, prev + 1))}
                  disabled={currentIndex === items.length - 1}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-white/5 transition-all"
                  title="다음 문항"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
              title="닫기"
            >
              <X size={18} />
            </button>
          </div>

        </div>

        {/* 문항 번호 빠른 선택 바 (여러 문항일 때) */}
        {items.length > 1 && (
          <div className="px-5 py-2 bg-slate-950/60 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">문항:</span>
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-7 h-7 rounded-lg text-xs font-black shrink-0 transition-all ${
                  currentIndex === idx
                    ? 'bg-indigo-600 text-white shadow-md scale-105'
                    : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}

        {/* 메인 본문 영역 */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden flex flex-col">
          {activeTab === 'solution' ? (
            <div className="w-full h-full bg-white relative flex flex-col">
              {loading ? (
                <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center space-y-3 z-10 text-white">
                  <Loader2 className="animate-spin text-indigo-400" size={40} />
                  <p className="text-xs font-bold text-slate-300">상세 해설을 불러오는 중입니다...</p>
                </div>
              ) : htmlContent ? (
                <iframe
                  srcDoc={htmlContent}
                  title="문제 해설"
                  className="w-full h-full border-0 bg-white"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-3 p-8 text-center bg-slate-900 text-white">
                  <AlertCircle size={44} className="text-amber-400" />
                  <h4 className="text-base font-black">해설 문서가 준비 중입니다</h4>
                  <p className="text-xs text-slate-400 max-w-sm">
                    {errorMsg || '해당 문항의 상세 해설 HTML을 조회하지 못했습니다.'}
                  </p>
                  {currentItem.answer && (
                    <div className="mt-3 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 text-sm font-black border border-emerald-500/30">
                      정답: {currentItem.answer}
                    </div>
                  )}
                  <button
                    onClick={() => setActiveTab('problem')}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all"
                  >
                    문제 원본 보기
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* 문제 원본 보기 */
            <div className="w-full h-full flex items-center justify-center p-6 overflow-auto bg-slate-900/50">
              {currentItem.problemUrl ? (
                <img
                  src={currentItem.problemUrl}
                  alt={currentItem.name}
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl bg-white p-3"
                />
              ) : (
                <div className="text-center space-y-2 text-slate-400">
                  <FileText size={40} className="mx-auto text-indigo-400 opacity-60" />
                  <p className="text-sm font-bold">문제 이미지가 등록되어 있지 않습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
