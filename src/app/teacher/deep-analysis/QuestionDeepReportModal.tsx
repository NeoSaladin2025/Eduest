'use client';

import React from 'react';
import {
  X,
  FileCode,
  Flame,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Compass,
  Layers,
  BookOpen,
  Sparkles
} from 'lucide-react';

export interface QuestionReportItem {
  fileDriveId: string;
  fileName: string;
  qNum: number;
  displayName: string;
  aiScore: number;
  aiTier: 'KILLER' | 'SEMI_KILLER' | 'STANDARD' | 'BASIC';
  stepsCount: number;
  coreConcepts: string[];
  trapPoint: string;
  coachingTip: string;
  previewText?: string;
}

interface QuestionDeepReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: QuestionReportItem | null;
  folderName?: string;
  grade?: string;
}

export default function QuestionDeepReportModal({
  isOpen,
  onClose,
  question,
  folderName = '모의고사',
  grade = '고2',
}: QuestionDeepReportModalProps) {
  if (!isOpen || !question) return null;

  const isKiller = question.aiTier === 'KILLER';
  const isSemiKiller = question.aiTier === 'SEMI_KILLER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      
      {/* 모달 창 */}
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* 1. 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 text-white flex items-center justify-between border-b border-violet-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-violet-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
              {question.qNum}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">{question.displayName} AI 심층 난이도 진단 보고서</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  isKiller
                    ? 'bg-rose-500 text-white shadow-xs'
                    : isSemiKiller
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'bg-violet-500/40 text-violet-200 border border-violet-400/30'
                }`}>
                  {isKiller ? '🔥 킬러급' : isSemiKiller ? '⚡ 준킬러급' : '🌱 표준 기출'} ({question.aiScore}점)
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                소속: [{grade}] {folderName} · 구글 드라이브 원본 HTML 실시간 연동
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* 2. 바디: 좌측(문제 원본 뷰어 5열) vs 우측(AI 난이도 진단서 7열) */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          
          {/* 좌측: 실제 문제 원본 HTML 뷰어 (5열) */}
          <div className="md:col-span-5 bg-slate-50 border-r border-slate-200 p-4 sm:p-5 overflow-y-auto space-y-3 flex flex-col justify-between">
            <div className="space-y-3 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <FileCode size={14} className="text-violet-600" />
                  <span>구글 드라이브 원본 문제 (HTML)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-bold">학생 열람 화면 동일</span>
              </div>

              {/* iframe 문제 뷰어 */}
              <div className="flex-1 min-h-[400px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs relative">
                <iframe
                  src={`/api/student/file-content?fileId=${question.fileDriveId}&raw=true`}
                  title={question.displayName}
                  className="w-full h-full border-0"
                />
              </div>
            </div>

            <div className="text-[10px] text-slate-400 text-center font-bold pt-1">
              Eduest MathJax 리포트 엔진 v2 연동됨
            </div>
          </div>

          {/* 우측: AI 정밀 난이도 진단서 (7열) */}
          <div className="md:col-span-7 p-5 sm:p-6 overflow-y-auto space-y-4">
            
            {/* 난이도 게이지 & 3분할 스펙 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                <div className="text-[10px] font-bold text-slate-400">AI 정밀 평가 난이도</div>
                <div className={`text-xl font-black ${isKiller ? 'text-rose-600' : isSemiKiller ? 'text-amber-600' : 'text-violet-600'}`}>
                  {question.aiScore}점 <span className="text-xs text-slate-400">/ 100</span>
                </div>
                <div className={`text-[10px] font-extrabold rounded py-0.5 ${
                  isKiller ? 'bg-rose-100 text-rose-800' : isSemiKiller ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'
                }`}>
                  {isKiller ? '🔥 킬러 등급' : isSemiKiller ? '⚡ 준킬러 등급' : '🌱 표준 기출'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                <div className="text-[10px] font-bold text-slate-400">풀이 논리 단계</div>
                <div className="text-xl font-black text-slate-800">{question.stepsCount}단계</div>
                <div className="text-[10px] font-bold text-slate-600 bg-slate-200 rounded py-0.5">
                  {question.stepsCount >= 4 ? '다단계 복합 추론' : '표준 논리 전개'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                <div className="text-[10px] font-bold text-slate-400">주요 출제 테마</div>
                <div className="text-xs font-black text-violet-900 truncate mt-1">
                  {question.coreConcepts[0] || '단원 종합'}
                </div>
                <div className="text-[10px] font-bold text-violet-600 bg-violet-100 rounded py-0.5 mt-1">
                  수학 핵심 역량
                </div>
              </div>
            </div>

            {/* 핵심 개념 목록 */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Compass size={14} className="text-violet-600" />
                <span>출제 핵심 개념 및 요구 선수 지식</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {question.coreConcepts.map((c, idx) => (
                  <span
                    key={idx}
                    className="text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200 px-2.5 py-1 rounded-xl flex items-center gap-1"
                  >
                    <span>{idx + 1}.</span> {c}
                  </span>
                ))}
              </div>
            </div>

            {/* 치명적 함정 요인 (Trap Point) */}
            <div className="border border-rose-200 bg-rose-50/40 rounded-2xl p-4 space-y-1.5">
              <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-rose-600" />
                <span>오답을 유발하는 치명적 함정 (Trap Point)</span>
              </h4>
              <p className="text-xs text-rose-950 leading-relaxed font-medium">
                {question.trapPoint}
              </p>
            </div>

            {/* 선생님을 위한 판서 수업 코칭 가이드 */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-black text-purple-950">
                <Sparkles size={14} className="text-purple-700" />
                <span>선생님 수업 코칭 가이드 (판서 꿀팁)</span>
              </div>
              <p className="text-xs font-medium text-purple-900 leading-relaxed">
                {question.coachingTip}
              </p>
            </div>

          </div>

        </div>

        {/* 3. 푸터 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-bold flex items-center gap-2">
            <BookOpen size={13} className="text-violet-600" />
            <span>Eduest AI 아카이브 연동됨 · Supabase 실시간 동기화</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-violet-200 cursor-pointer"
            >
              <Printer size={13} />
              <span>진단서 인쇄</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
