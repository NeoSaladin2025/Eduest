'use client';

import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  ArrowRight, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  ExternalLink,
  Code2,
  FileQuestion,
  HelpCircle,
  Eye
} from 'lucide-react';

export interface ExtractedQuestionData {
  id?: string;
  drive_id: string;
  name: string;
  folder_name?: string | null;
  question_number?: number | null;
  display_name?: string | null;
  image_url: string;
  raw_answer: string;
  answer: string;
  is_descriptive: boolean;
  solution_drive_id?: string;
  debug_info?: {
    matched_rule: string;
    image_source: string;
    raw_html_snippet?: string;
    fetch_source: 'drive_api' | 'gas_fallback' | 'failed';
  };
}

interface QuestionDiffModalProps {
  isOpen: boolean;
  questionIndex: number;
  currentData: ExtractedQuestionData;
  newData: ExtractedQuestionData;
  onApply: (appliedData: ExtractedQuestionData) => void;
  onClose: () => void;
}

export default function QuestionDiffModal({
  isOpen,
  questionIndex,
  currentData,
  newData,
  onApply,
  onClose,
}: QuestionDiffModalProps) {
  const [showDebug, setShowDebug] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  
  // 선생님이 모달 안에서 직접 커스텀 수정할 수 있는 상태
  const [customAnswer, setCustomAnswer] = useState(newData.answer);
  const [customIsDescriptive, setCustomIsDescriptive] = useState(newData.is_descriptive);
  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen) return null;

  const isAnswerDiff = currentData.answer !== newData.answer;
  const isTypeDiff = currentData.is_descriptive !== newData.is_descriptive;
  const isImageDiff = currentData.image_url !== newData.image_url;
  const isRawDiff = currentData.raw_answer !== newData.raw_answer;

  const handleCopySnippet = () => {
    if (newData.debug_info?.raw_html_snippet) {
      navigator.clipboard.writeText(newData.debug_info.raw_html_snippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const handleApplyNew = () => {
    onApply(newData);
    onClose();
  };

  const handleApplyCustom = () => {
    onApply({
      ...newData,
      answer: customAnswer,
      is_descriptive: customIsDescriptive,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 헤더 */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs shrink-0">
              <Sparkles size={18} className="text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm md:text-base leading-tight">
                  문항 {questionIndex + 1} 정답 재추출 결과 비교
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                  단독 검증
                </span>
              </div>
              <p className="text-[11px] text-violet-100 truncate mt-0.5">
                {currentData.folder_name ? `[${currentData.folder_name}] ` : ''}
                {currentData.question_number ? `${currentData.question_number}번 ` : ''}
                {currentData.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2. 본문 비교 영역 */}
        <div className="p-6 overflow-y-auto space-y-5 scrollbar-thin">
          
          {/* 변경점 요약 알림 바 */}
          <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
            isAnswerDiff || isTypeDiff || isImageDiff
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle size={16} className={isAnswerDiff || isTypeDiff ? 'text-amber-600' : 'text-emerald-600'} />
              <span>
                {isAnswerDiff || isTypeDiff || isImageDiff
                  ? '기존 데이터와 달라진 항목이 감지되었습니다. 아래 비교표를 확인해주세요.'
                  : '기존 데이터와 추출 결과가 완전히 동일합니다.'}
              </span>
            </div>
            {(isAnswerDiff || isTypeDiff) && (
              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black shrink-0">
                변동 감지
              </span>
            )}
          </div>

          {/* 비교 테이블 */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="grid grid-cols-12 bg-slate-100/80 text-[11px] font-extrabold text-slate-600 border-b border-slate-200 px-4 py-2.5">
              <div className="col-span-3">항목</div>
              <div className="col-span-4 text-slate-500">기존 (현재 설정)</div>
              <div className="col-span-1 text-center text-slate-400">→</div>
              <div className="col-span-4 text-indigo-700 font-black">🆕 새로 추출된 값</div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              
              {/* 1) 설정 정답 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 bg-white">
                <div className="col-span-3 font-bold text-slate-700 flex items-center gap-1.5">
                  <span>설정 정답</span>
                  {isAnswerDiff && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600"></span>
                  )}
                </div>
                <div className="col-span-4 font-mono font-bold text-slate-700 truncate pr-2" title={currentData.answer}>
                  {currentData.answer || <span className="text-slate-400 italic">미입력</span>}
                </div>
                <div className="col-span-1 text-center text-slate-300">
                  <ArrowRight size={13} className="mx-auto" />
                </div>
                <div className={`col-span-4 font-mono font-black truncate ${isAnswerDiff ? 'text-violet-700 bg-violet-50 px-2 py-1 rounded-lg border border-violet-200' : 'text-slate-800'}`} title={newData.answer}>
                  {newData.answer || <span className="text-slate-400 italic">정답 없음</span>}
                </div>
              </div>

              {/* 2) 문항 유형 (서술형 여부) */}
              <div className="grid grid-cols-12 items-center px-4 py-3 bg-white">
                <div className="col-span-3 font-bold text-slate-700">채점 유형</div>
                <div className="col-span-4">
                  {currentData.is_descriptive ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                      ✍️ 서술형
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                      단답/객관식
                    </span>
                  )}
                </div>
                <div className="col-span-1 text-center text-slate-300">
                  <ArrowRight size={13} className="mx-auto" />
                </div>
                <div className="col-span-4">
                  {newData.is_descriptive ? (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      isTypeDiff 
                        ? 'bg-amber-100 text-amber-900 border-amber-400 ring-2 ring-amber-200' 
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      ✍️ 서술형 {isTypeDiff && '✨'}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      isTypeDiff
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 ring-2 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      단답/객관식 {isTypeDiff && '✨'}
                    </span>
                  )}
                </div>
              </div>

              {/* 3) 원본 텍스트 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 bg-white">
                <div className="col-span-3 font-bold text-slate-700">원본 정답 텍스트</div>
                <div className="col-span-4 text-slate-500 font-mono text-[11px] truncate pr-2" title={currentData.raw_answer}>
                  {currentData.raw_answer || '-'}
                </div>
                <div className="col-span-1 text-center text-slate-300">
                  <ArrowRight size={13} className="mx-auto" />
                </div>
                <div className={`col-span-4 font-mono text-[11px] truncate ${isRawDiff ? 'text-indigo-900 font-bold bg-indigo-50/70 px-2 py-0.5 rounded' : 'text-slate-700'}`} title={newData.raw_answer}>
                  {newData.raw_answer || '-'}
                </div>
              </div>

              {/* 4) 문제 이미지 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 bg-white">
                <div className="col-span-3 font-bold text-slate-700">문제 이미지</div>
                <div className="col-span-4 flex items-center gap-2">
                  {currentData.image_url ? (
                    <a
                      href={currentData.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-violet-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Eye size={12} />
                      이미지 보기
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400">이미지 없음</span>
                  )}
                </div>
                <div className="col-span-1 text-center text-slate-300">
                  <ArrowRight size={13} className="mx-auto" />
                </div>
                <div className="col-span-4 flex items-center gap-2">
                  {newData.image_url ? (
                    <a
                      href={newData.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Eye size={12} />
                      새 이미지 확인 {isImageDiff && '✨'}
                    </a>
                  ) : (
                    <span className="text-[10px] text-rose-500 font-bold">이미지 추출 실패</span>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* 모달 내 즉시 인라인 수정 옵션 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>✏️ 추출 결과를 토대로 직접 수정 후 반영</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customIsDescriptive}
                  onChange={(e) => {
                    setCustomIsDescriptive(e.target.checked);
                    setIsEditing(true);
                  }}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>서술형 지정</span>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customAnswer}
                onChange={(e) => {
                  setCustomAnswer(e.target.value);
                  setIsEditing(true);
                }}
                placeholder="정답 텍스트 직접 입력..."
                className="flex-1 px-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomAnswer(newData.answer);
                  setCustomIsDescriptive(newData.is_descriptive);
                  setIsEditing(false);
                }}
                className="px-3 py-2 rounded-xl border border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                title="새로 추출된 원본 값으로 리셋"
              >
                리셋
              </button>
            </div>
          </div>

          {/* 🛠️ [디버그/원천 분석 정보] 아코디언 토글 */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDebug(!showDebug)}
              className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left text-xs font-bold text-slate-700"
            >
              <div className="flex items-center gap-2">
                <Code2 size={15} className="text-violet-600" />
                <span>원천 데이터 & 파싱 디버그 정보 (로직 분석용)</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>{showDebug ? '접기' : '펼쳐서 확인'}</span>
                {showDebug ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showDebug && (
              <div className="p-4 bg-slate-900 text-slate-200 text-xs space-y-3 font-mono">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">데이터 수신 경로: </span>
                    <span className="font-bold text-emerald-400">
                      {newData.debug_info?.fetch_source === 'drive_api' 
                        ? 'Google Drive Direct API' 
                        : newData.debug_info?.fetch_source === 'gas_fallback' 
                        ? 'GAS WebApp Fallback' 
                        : '수신 실패'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">이미지 검색 규칙: </span>
                    <span className="font-bold text-sky-400">
                      {newData.debug_info?.image_source || '미기재'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">정답 파싱 매칭 규칙: </span>
                    <span className="font-bold text-amber-300">
                      {newData.debug_info?.matched_rule || '미기재'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400">HTML 원본 발췌 스니펫 (최대 300자):</span>
                    <button
                      type="button"
                      onClick={handleCopySnippet}
                      className="text-[10px] text-violet-300 hover:text-white flex items-center gap-1 font-sans"
                    >
                      {copiedSnippet ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copiedSnippet ? '복사됨' : '복사하기'}
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-36 scrollbar-thin">
                    {newData.debug_info?.raw_html_snippet || '스니펫 정보가 없습니다.'}
                  </pre>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* 3. 하단 액션 버튼 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            취소 (기존 데이터 유지)
          </button>

          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleApplyCustom}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>수정값으로 반영</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyNew}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md shadow-violet-200 transition-colors flex items-center gap-1.5"
            >
              <Sparkles size={15} />
              <span>새 추출 결과로 반영하기</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
