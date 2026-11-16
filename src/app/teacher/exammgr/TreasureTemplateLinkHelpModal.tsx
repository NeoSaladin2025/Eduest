'use client';

import React from 'react';
import { HelpCircle, Link2, Unlink, Sparkles, ArrowRight, CheckCircle2, Layers } from 'lucide-react';

interface TreasureTemplateLinkHelpModalProps {
  onClose: () => void;
}

export default function TreasureTemplateLinkHelpModal({
  onClose,
}: TreasureTemplateLinkHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black">
                문항 선별 템플릿 ↔ 생성 설정 연동 안내
              </h3>
              <p className="text-[11px] text-slate-300">
                문항 고르기(선별 기준)와 회차·타임어택 설정을 따로 쓸지, 한 번에 묶어 쓸지 선택할 수 있어요!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/70">
          {/* 핵심 요약 2카드 비교 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. 독립 모드 (기본) */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-black">
                  <Unlink size={13} className="text-slate-600" />
                  연동 OFF · 독립 관리 (기본)
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  유연함 추천
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                선별 템플릿은 <strong className="text-slate-900">“어떤 문제를 고를지”</strong>만 자동으로 체크해 줍니다. 다음 창(생성 모달)에서는 그때그때 원하는 회차·타임어택을 자유롭게 선택합니다.
              </p>

              {/* 목업 다이어그램 A */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  화면 동작 미리보기 (Mockup)
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="px-2 py-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-black shadow-2xs">
                    🎯 정답률 50% 이하
                  </div>
                  <ArrowRight size={13} className="text-slate-400 shrink-0" />
                  <div className="px-2 py-1.5 rounded-lg bg-white border border-violet-300 text-[10px] font-bold text-slate-700">
                    ☑ 3문항 자동 체크
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-dashed border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500">생성 모달 열릴 때:</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-bold text-slate-600">
                    기존 기본값 유지 (직접 선택)
                  </span>
                </div>
              </div>
            </div>

            {/* 2. 자동 연동 모드 */}
            <div className="bg-white rounded-2xl border-2 border-amber-400 p-4 space-y-3 shadow-xs relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black">
                  <Link2 size={13} className="text-amber-700" />
                  연동 ON · 원클릭 풀세트
                </span>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  초고속 1초 세팅
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                선별 템플릿을 누르고 생성 버튼을 클릭하면 <strong className="text-amber-900">체크된 문항 + 지정해둔 생성 설정(회차/시간단축/할부)</strong>까지 한 번에 자동 세팅됩니다.
              </p>

              {/* 목업 다이어그램 B */}
              <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-3 space-y-2">
                <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                  화면 동작 미리보기 (Mockup)
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="px-2 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[10px] font-black shadow-2xs">
                    🔥 2회 이상 오답 + 🔗스파르타
                  </div>
                  <ArrowRight size={13} className="text-amber-500 shrink-0" />
                  <div className="px-2 py-1.5 rounded-lg bg-white border border-amber-300 text-[10px] font-bold text-amber-900">
                    ☑ 4문항 체크
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-dashed border-amber-200 flex-wrap">
                  <span className="text-[10px] font-bold text-amber-800">생성 모달 자동 적용:</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black">
                    🔥 스파르타 4회차 (-15% 단축)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 전체 흐름 시각화 Mockup UI */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Layers size={15} className="text-violet-600" />
                실제 사용 흐름 한눈에 보기 (Mockup)
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                필요한 템플릿만 골라서 연동 체크를 켜면 됩니다
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
              {/* Step 1 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                    1
                  </span>
                  <span className="text-[11px] font-black text-slate-800">선별 템플릿 띡! 클릭</span>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2 space-y-1.5">
                  <div className="flex gap-1 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[9px] font-black">
                      🎯 50% 이하
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold">
                      🔥 1회+ 오답
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <span>☑</span>
                    <span>생성 설정 자동 연동 (선택)</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                    2
                  </span>
                  <span className="text-[11px] font-black text-slate-800">체크 자동 선택 + 미세 조정</span>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2 space-y-1 text-[9.5px]">
                  <div className="flex items-center justify-between bg-rose-50/70 px-1.5 py-0.5 rounded border border-rose-200">
                    <span className="font-black text-rose-800">☑ 5번 · 1/5 정답 (20%)</span>
                    <span className="text-[8px] text-rose-600 font-bold">자동선택</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                    <span className="font-bold text-slate-500">☐ 6번 · 4/5 정답 (80%)</span>
                    <span className="text-[8px] text-slate-400">콕 찍어 추가가능</span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center">
                    3
                  </span>
                  <span className="text-[11px] font-black text-slate-800">다음 보물회수 생성!</span>
                </div>
                <div className="bg-white rounded-lg border border-amber-200 p-2 space-y-1.5">
                  <div className="px-2 py-1 rounded bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[9.5px] font-black text-center flex items-center justify-center gap-1">
                    <Sparkles size={10} />
                    <span>선택한 N문항으로 생성</span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-emerald-700 font-bold">
                    <CheckCircle2 size={10} />
                    <span>연동 ON이면 회차/시간까지 즉시 세팅!</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-[11px] text-indigo-900 font-medium leading-relaxed">
            💡 <strong>Tip:</strong> 평소에 시험지마다 회차·시간을 다르게 주시는 편이라면 <strong>연동 체크를 꺼두고(독립 모드)</strong> 쓰시고, 자주 쓰는 고정 루틴(예: “2회 이상 오답 → 바로 3회차 타임어택”)이 생기면 그 템플릿만 <strong>연동 체크 ON</strong> 해두시면 편리합니다!
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black cursor-pointer transition-colors"
          >
            확인했어요!
          </button>
        </div>
      </div>
    </div>
  );
}
