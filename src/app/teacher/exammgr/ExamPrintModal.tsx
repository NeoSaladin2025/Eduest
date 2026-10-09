'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Printer,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  FileText,
  LayoutGrid,
  Columns,
  Loader2,
  CheckCircle2,
  Sparkles,
  Info,
  Maximize2
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';

interface ExamPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
}

export type QuestionsPerPageType = 1 | 2 | 4 | 6;

export default function ExamPrintModal({ isOpen, onClose, exam }: ExamPrintModalProps) {
  // 레이아웃 & 옵션 상태
  const [questionsPerPage, setQuestionsPerPage] = useState<QuestionsPerPageType>(4);
  const [columns, setColumns] = useState<1 | 2>(2);
  const [marginSize, setMarginSize] = useState<'compact' | 'normal'>('normal');
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [academyName, setAcademyName] = useState('Eduest 수학학원');

  // 화면 미리보기 줌 (기본 80%로 맞춰서 한눈에 들어오게)
  const [zoomScale, setZoomScale] = useState(0.8);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // questionsPerPage 변경 시 단(column) 자동 추천 조정
  const handleQuestionsPerPageChange = (count: QuestionsPerPageType) => {
    setQuestionsPerPage(count);
    if (count === 1 || count === 2) {
      setColumns(1);
    } else {
      setColumns(2);
    }
  };

  // 문항 배열을 페이지 단위로 청크 분할
  const questionPages = useMemo(() => {
    if (!exam || !exam.questions || exam.questions.length === 0) return [];
    const chunks: ExamQuestion[][] = [];
    for (let i = 0; i < exam.questions.length; i += questionsPerPage) {
      chunks.push(exam.questions.slice(i, i + questionsPerPage));
    }
    return chunks;
  }, [exam, questionsPerPage]);

  const totalPages = questionPages.length + (includeAnswerKey ? 1 : 0);

  // 모든 문항 이미지 사전 로딩 후 브라우저 인쇄창 호출
  const handleTriggerPrint = async () => {
    if (!exam) return;
    setIsPreparingPrint(true);
    try {
      // 모든 이미지 사전 캐시 완료 대기
      const imageUrls = exam.questions.map(q => q.image_url).filter(Boolean);
      await Promise.all(
        imageUrls.map(
          url =>
            new Promise(resolve => {
              const img = new Image();
              img.onload = () => resolve(true);
              img.onerror = () => resolve(false);
              img.src = url;
            })
        )
      );

      // 인쇄 대화상자 호출
      setTimeout(() => {
        setIsPreparingPrint(false);
        window.print();
      }, 300);
    } catch (e) {
      console.error('Print image preloading failed:', e);
      setIsPreparingPrint(false);
      window.print();
    }
  };

  if (!isOpen || !exam) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* 인쇄 전용 CSS 스타일 태그 */}
      <style jsx global>{`
        @media print {
          /* 화면 일반 UI 전부 숨김 */
          body * {
            visibility: hidden !important;
          }
          /* 인쇄 대상 루트 컨테이너만 표시 */
          #eduest-print-area,
          #eduest-print-area * {
            visibility: visible !important;
          }
          #eduest-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: ${marginSize === 'compact' ? '8mm 10mm' : '12mm 15mm'};
          }
          .a4-print-sheet {
            page-break-after: always !important;
            break-after: page !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 275mm !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* 상단 모달 헤더 바 (화면 전용) */}
      <header className="no-print h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-md">
            <Printer size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">{exam.title}</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {exam.grade}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                총 {exam.questions.length}문항 • {totalPages}페이지
              </span>
            </div>
            <p className="text-xs text-slate-400">시험지 인쇄 레이아웃 설정 및 실시간 A4 미리보기</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 줌 배율 조절 버튼들 */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-slate-300">
            <button
              type="button"
              onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
              title="축소"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-mono font-bold px-2 min-w-[50px] text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomScale(prev => Math.min(1.2, prev + 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
              title="확대"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(0.8)}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="배율 초기화 (80%)"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {/* 인쇄 실행 버튼 */}
          <button
            type="button"
            onClick={handleTriggerPrint}
            disabled={isPreparingPrint}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 active:scale-98 text-white text-xs font-black rounded-xl shadow-lg shadow-violet-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isPreparingPrint ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>이미지 준비 중...</span>
              </>
            ) : (
              <>
                <Printer size={16} />
                <span>인쇄하기 (PDF 저장)</span>
              </>
            )}
          </button>

          {/* 모달 닫기 */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="창 닫기"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* 중앙 메인 바디 (좌: 컨트롤 패널 / 우: 실시간 A4 미리보기 뷰어) */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 사이드바: 레이아웃 & 옵션 패널 (no-print) */}
        <aside className="no-print w-80 bg-slate-900/90 border-r border-slate-800 p-5 overflow-y-auto space-y-6 shrink-0 text-slate-200">
          {/* 1. 페이지당 문항 수 선택 */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <LayoutGrid size={14} className="text-violet-400" />
              <span>페이지당 문항 수</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2, 4, 6] as QuestionsPerPageType[]).map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleQuestionsPerPageChange(num)}
                  className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-between cursor-pointer ${
                    questionsPerPage === num
                      ? 'bg-violet-600/20 text-violet-300 border-violet-500 shadow-xs'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span>{num}문항 / 쪽</span>
                  {num === 4 && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-200">
                      표준
                    </span>
                  )}
                  {questionsPerPage === num && <Check size={14} className="text-violet-400" />}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {questionsPerPage === 1 && '• 1쪽 1문항: 풀이 공간이 넓게 필요한 서술형/고난도 문항에 적합합니다.'}
              {questionsPerPage === 2 && '• 1쪽 2문항: 상·하 1단 배치로 넉넉한 문제 크기와 풀이 여백을 제공합니다.'}
              {questionsPerPage === 4 && '• 1쪽 4문항: 2열 2행 좌/우 2단 배치로 학원 시험지 표준 스타일입니다.'}
              {questionsPerPage === 6 && '• 1쪽 6문항: 2열 3행 컴팩트 배치로 용지를 가장 효율적으로 절약합니다.'}
            </p>
          </div>

          {/* 2. 단(Column) 분할 */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <Columns size={14} className="text-violet-400" />
              <span>단(Column) 레이아웃</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setColumns(1)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  columns === 1
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                1단 (세로형)
              </button>
              <button
                type="button"
                onClick={() => setColumns(2)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  columns === 2
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                2단 (좌/우 분할)
              </button>
            </div>
          </div>

          {/* 3. 용지 여백 */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <FileText size={14} className="text-violet-400" />
              <span>용지 인쇄 여백</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMarginSize('compact')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  marginSize === 'compact'
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                좁게 (8mm)
              </button>
              <button
                type="button"
                onClick={() => setMarginSize('normal')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  marginSize === 'normal'
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                보통 (15mm)
              </button>
            </div>
          </div>

          {/* 4. 학원 이름 커스텀 */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-300">학원 / 기관명 표기</label>
            <input
              type="text"
              value={academyName}
              onChange={e => setAcademyName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-violet-500"
              placeholder="예: Eduest 수학학원"
            />
          </div>

          {/* 5. 세부 출력 옵션 (체크박스) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <label className="text-xs font-black text-slate-300">세부 인쇄 옵션</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeaderInfo}
                  onChange={e => setShowHeaderInfo(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700"
                />
                <span>수험자 기재란 (반/이름/점수) 포함</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPoints}
                  onChange={e => setShowPoints(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700"
                />
                <span>문항별 배점 표시 (예: [4.0점])</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={e => setIncludeAnswerKey(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700"
                />
                <span>마지막 장 빠른 정답표(Answer Key) 첨부</span>
              </label>
            </div>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-violet-950/40 border border-violet-800/40 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-violet-300 text-xs font-bold">
              <Sparkles size={13} />
              <span>인쇄 팁</span>
            </div>
            <p className="text-[11px] text-violet-300/80 leading-normal">
              브라우저 인쇄 대화상자에서 <strong>[대상: PDF로 저장]</strong>을 선택하시면 고해상도 PDF 파일로 즉시 저장할 수 있습니다.
            </p>
          </div>
        </aside>

        {/* 우측 메인 영역: A4 실시간 미리보기 스크롤 뷰어 */}
        <main className="flex-1 bg-slate-950 overflow-auto p-8 flex flex-col items-center">
          <div
            id="eduest-print-area"
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out'
            }}
            className="space-y-8 flex flex-col items-center"
          >
            {/* 각 페이지별 A4 시트 */}
            {questionPages.map((pageQuestions, pageIdx) => {
              const pageNumber = pageIdx + 1;
              const isFirstPage = pageIdx === 0;

              return (
                <div
                  key={pageIdx}
                  className={`a4-print-sheet bg-white text-slate-900 shadow-2xl relative flex flex-col justify-between ${
                    marginSize === 'compact' ? 'p-[8mm]' : 'p-[12mm]'
                  }`}
                  style={{
                    width: '210mm',
                    minHeight: '297mm',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* 상단 헤더 영역 */}
                  <div className="shrink-0 mb-4">
                    {isFirstPage ? (
                      /* 1페이지 메인 헤더: 학원 시험지 전통 스타일 상단 박스 */
                      <div className="border-b-2 border-slate-900 pb-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="text-[11px] font-bold text-slate-500 tracking-wider">
                              {academyName} • 모의평가
                            </div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                              {exam.title}
                            </h1>
                            <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                              <span>학년: <strong>{exam.grade}</strong></span>
                              <span>•</span>
                              <span>문항수: <strong>총 {exam.questions.length}문항</strong></span>
                              <span>•</span>
                              <span>
                                제한시간: <strong>{exam.duration_min > 0 ? `${exam.duration_min}분` : '자율'}</strong>
                              </span>
                            </div>
                          </div>

                          {/* 수험자 기재란 박스 */}
                          {showHeaderInfo && (
                            <div className="border border-slate-900 rounded-md overflow-hidden text-xs shrink-0 self-start">
                              <table className="border-collapse text-center">
                                <tbody>
                                  <tr className="border-b border-slate-300 bg-slate-50">
                                    <th className="px-3 py-1 font-bold text-slate-700 border-r border-slate-300">반</th>
                                    <th className="px-4 py-1 font-bold text-slate-700 border-r border-slate-300">성 명</th>
                                    <th className="px-3 py-1 font-bold text-slate-700">점 수</th>
                                  </tr>
                                  <tr>
                                    <td className="h-8 border-r border-slate-300 w-16"></td>
                                    <td className="h-8 border-r border-slate-300 w-24"></td>
                                    <td className="h-8 w-16 text-[10px] text-slate-400 font-mono align-bottom pb-1">
                                      / 100
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* 2페이지 이후 간이 러닝 헤더 */
                      <div className="border-b border-slate-300 pb-1.5 flex items-center justify-between text-xs text-slate-500 font-bold">
                        <span>{exam.title} ({exam.grade})</span>
                        <span>{academyName}</span>
                      </div>
                    )}
                  </div>

                  {/* 본문 문항 그리드 레이아웃 */}
                  <div
                    className={`flex-1 ${
                      columns === 2
                        ? questionsPerPage === 6
                          ? 'grid grid-cols-2 grid-rows-3 gap-x-6 gap-y-4'
                          : 'grid grid-cols-2 grid-rows-2 gap-x-6 gap-y-5'
                        : questionsPerPage === 1
                        ? 'flex flex-col justify-start gap-4'
                        : 'grid grid-cols-1 grid-rows-2 gap-y-6'
                    }`}
                  >
                    {pageQuestions.map((q, qSubIdx) => {
                      const globalQuestionNumber = pageIdx * questionsPerPage + qSubIdx + 1;
                      const points = q.points || (q.is_descriptive ? 5 : 4);

                      return (
                        <div
                          key={q.id}
                          className="print-avoid-break flex flex-col justify-start relative p-2 rounded-lg border border-transparent hover:border-slate-200 transition-colors"
                        >
                          {/* 문항 번호 및 배점 헤더 */}
                          <div className="flex items-baseline gap-1.5 mb-1.5 shrink-0">
                            <span className="text-sm font-black text-slate-900">
                              {globalQuestionNumber}.
                            </span>
                            {showPoints && (
                              <span className="text-[11px] font-bold text-slate-500">
                                [{points}.0점]
                              </span>
                            )}
                            {q.is_descriptive && (
                              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-sm bg-slate-100 text-slate-700 border border-slate-300">
                                서술형
                              </span>
                            )}
                          </div>

                          {/* 문제 이미지 */}
                          {q.image_url ? (
                            <div className="flex-1 flex items-start justify-center overflow-hidden">
                              <img
                                src={q.image_url}
                                alt={`문제 ${globalQuestionNumber}번`}
                                className={`w-full object-contain object-top ${
                                  questionsPerPage === 1
                                    ? 'max-h-[140mm]'
                                    : questionsPerPage === 2
                                    ? 'max-h-[105mm]'
                                    : questionsPerPage === 4
                                    ? 'max-h-[85mm]'
                                    : 'max-h-[60mm]'
                                }`}
                              />
                            </div>
                          ) : (
                            <div className="p-4 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-400 my-auto">
                              문제 이미지 없음 ({q.name})
                            </div>
                          )}

                          {/* 1문항/쪽 전용: 하단 넉넉한 풀이 공간 가이드 */}
                          {questionsPerPage === 1 && (
                            <div className="mt-6 flex-1 min-h-[90mm] border border-dashed border-slate-300 rounded-xl p-3 flex flex-col justify-between">
                              <span className="text-[11px] font-bold text-slate-400">
                                [풀이 과정 및 정답 작성란]
                              </span>
                              <div className="text-right text-xs font-bold text-slate-700">
                                정답 : _________________________
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 하단 푸터 (페이지 번호) */}
                  <div className="shrink-0 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>{academyName}</span>
                    <span className="font-mono font-bold text-slate-600">
                      - {pageNumber} / {totalPages} -
                    </span>
                    <span>Eduest Examination</span>
                  </div>
                </div>
              );
            })}

            {/* 빠른 정답표 부록 페이지 (옵션 활성화 시 맨 뒤에 출력) */}
            {includeAnswerKey && (
              <div
                className={`a4-print-sheet bg-white text-slate-900 shadow-2xl relative flex flex-col justify-between ${
                  marginSize === 'compact' ? 'p-[8mm]' : 'p-[12mm]'
                }`}
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  boxSizing: 'border-box'
                }}
              >
                <div>
                  {/* 정답표 헤더 */}
                  <div className="border-b-2 border-slate-900 pb-3 mb-6">
                    <div className="text-[11px] font-bold text-slate-500 tracking-wider">
                      {academyName} • 정답 및 배점표
                    </div>
                    <h1 className="text-xl font-black text-slate-900">
                      {exam.title} - 빠른 정답표
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      총 {exam.questions.length}문항 • 각 문항별 정답 및 소문항 기준 답안입니다.
                    </p>
                  </div>

                  {/* 정답 그리드 테이블 */}
                  <div className="border border-slate-900 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-center border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-900 font-black text-slate-800">
                          <th className="py-2.5 px-3 border-r border-slate-300 w-16">번호</th>
                          <th className="py-2.5 px-3 border-r border-slate-300 w-20">유형</th>
                          <th className="py-2.5 px-3 border-r border-slate-300 w-20">배점</th>
                          <th className="py-2.5 px-4 text-left">정답</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exam.questions.map((q, idx) => {
                          const qNum = idx + 1;
                          const points = q.points || (q.is_descriptive ? 5 : 4);
                          const isSub = q.sub_questions && q.sub_questions.length > 0;

                          return (
                            <tr
                              key={q.id}
                              className={`border-b border-slate-200 ${
                                idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                              }`}
                            >
                              <td className="py-2 px-3 border-r border-slate-200 font-black text-slate-800">
                                {qNum}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-slate-600 font-bold">
                                {q.is_descriptive ? '서술형' : isSub ? '소문항' : '단답/객관'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-slate-600 font-mono font-bold">
                                {points}.0점
                              </td>
                              <td className="py-2 px-4 text-left font-black text-slate-900 font-mono">
                                {isSub ? (
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {q.sub_questions!.map((sq, sqIdx) => (
                                      <span key={sqIdx}>
                                        <strong className="text-violet-700">{sq.label}</strong> {sq.answer}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span>{q.answer || q.raw_answer}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 정답표 하단 푸터 */}
                <div className="shrink-0 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>{academyName}</span>
                  <span className="font-mono font-bold text-slate-600">
                    - {totalPages} / {totalPages} (정답표) -
                  </span>
                  <span>Eduest Examination</span>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
