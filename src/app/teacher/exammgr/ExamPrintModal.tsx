'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Building2,
  Tag,
  Plus,
  Edit2,
  Trash2
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';

interface ExamPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
}

export type QuestionsPerPageType = 1 | 2 | 4 | 6;

const DEFAULT_CHIPS = ['모의평가', '단원평가', '주간테스트', '과제물', '중간고사 대비'];

export default function ExamPrintModal({ isOpen, onClose, exam }: ExamPrintModalProps) {
  // 레이아웃 & 옵션 상태
  const [questionsPerPage, setQuestionsPerPage] = useState<QuestionsPerPageType>(4);
  const [columns, setColumns] = useState<1 | 2>(2);
  const [marginSize, setMarginSize] = useState<'compact' | 'normal'>('normal');
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);

  // 🏫 학원명 토글 & 입력 (디폴트: OFF)
  const [showAcademyName, setShowAcademyName] = useState(false);
  const [academyName, setAcademyName] = useState('Eduest 수학학원');

  // 🏷️ 시험 구분 커스텀 칩 상태
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS);
  const [selectedChip, setSelectedChip] = useState('모의평가');
  const [isAddingChip, setIsAddingChip] = useState(false);
  const [newChipText, setNewChipText] = useState('');
  const [editingChipIdx, setEditingChipIdx] = useState<number | null>(null);
  const [editingChipText, setEditingChipText] = useState('');

  // 화면 미리보기 줌 (기본 80%)
  const [zoomScale, setZoomScale] = useState(0.8);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // 💾 브라우저 localStorage에서 저장된 설정 불러오기 (마운트 시점 1회)
  useEffect(() => {
    try {
      // 1. 학원명 토글 및 입력값
      const savedShowAcademy = localStorage.getItem('eduest_print_show_academy');
      if (savedShowAcademy !== null) {
        setShowAcademyName(savedShowAcademy === 'true');
      } else {
        setShowAcademyName(false); // 디폴트 OFF
      }

      const savedAcademyName = localStorage.getItem('eduest_print_academy_name');
      if (savedAcademyName) {
        setAcademyName(savedAcademyName);
      }

      // 2. 커스텀 칩 목록 및 선택 칩
      const savedChips = localStorage.getItem('eduest_print_chips');
      if (savedChips) {
        const parsed = JSON.parse(savedChips);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChips(parsed);
        }
      }

      const savedSelectedChip = localStorage.getItem('eduest_print_selected_chip');
      if (savedSelectedChip !== null) {
        setSelectedChip(savedSelectedChip);
      }

      // 3. 레이아웃 설정 복원
      const savedQPerPage = localStorage.getItem('eduest_print_q_per_page');
      if (savedQPerPage) {
        const num = Number(savedQPerPage) as QuestionsPerPageType;
        if ([1, 2, 4, 6].includes(num)) {
          setQuestionsPerPage(num);
          const savedCols = localStorage.getItem('eduest_print_columns');
          if (savedCols) {
            setColumns(Number(savedCols) as 1 | 2);
          } else {
            setColumns(num === 1 || num === 2 ? 1 : 2);
          }
        }
      }

      const savedMargin = localStorage.getItem('eduest_print_margin');
      if (savedMargin === 'compact' || savedMargin === 'normal') {
        setMarginSize(savedMargin);
      }

      const savedHeaderInfo = localStorage.getItem('eduest_print_show_header');
      if (savedHeaderInfo !== null) setShowHeaderInfo(savedHeaderInfo === 'true');

      const savedPoints = localStorage.getItem('eduest_print_show_points');
      if (savedPoints !== null) setShowPoints(savedPoints === 'true');

      const savedKey = localStorage.getItem('eduest_print_include_key');
      if (savedKey !== null) setIncludeAnswerKey(savedKey === 'true');
    } catch (e) {
      console.warn('Failed to load saved print config:', e);
    }
  }, []);

  // 🔄 설정 변경 헬퍼 및 localStorage 동기화
  const handleToggleAcademyName = (enabled: boolean) => {
    setShowAcademyName(enabled);
    localStorage.setItem('eduest_print_show_academy', String(enabled));
  };

  const handleAcademyNameChange = (val: string) => {
    setAcademyName(val);
    localStorage.setItem('eduest_print_academy_name', val);
  };

  const handleSelectChip = (chip: string) => {
    // 이미 선택된 칩을 다시 누르면 토글 해제(선택 없음)
    const nextVal = selectedChip === chip ? '' : chip;
    setSelectedChip(nextVal);
    localStorage.setItem('eduest_print_selected_chip', nextVal);
  };

  const handleAddChip = () => {
    const trimmed = newChipText.trim();
    if (!trimmed) return;
    if (!chips.includes(trimmed)) {
      const nextChips = [...chips, trimmed];
      setChips(nextChips);
      setSelectedChip(trimmed);
      localStorage.setItem('eduest_print_chips', JSON.stringify(nextChips));
      localStorage.setItem('eduest_print_selected_chip', trimmed);
    } else {
      setSelectedChip(trimmed);
      localStorage.setItem('eduest_print_selected_chip', trimmed);
    }
    setNewChipText('');
    setIsAddingChip(false);
  };

  const handleDeleteChip = (chipToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextChips = chips.filter(c => c !== chipToDelete);
    setChips(nextChips);
    localStorage.setItem('eduest_print_chips', JSON.stringify(nextChips));
    if (selectedChip === chipToDelete) {
      const fallback = nextChips.length > 0 ? nextChips[0] : '';
      setSelectedChip(fallback);
      localStorage.setItem('eduest_print_selected_chip', fallback);
    }
  };

  const handleStartEditChip = (idx: number, chip: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChipIdx(idx);
    setEditingChipText(chip);
  };

  const handleSaveEditChip = (idx: number) => {
    const trimmed = editingChipText.trim();
    if (!trimmed) {
      setEditingChipIdx(null);
      return;
    }
    const oldChip = chips[idx];
    const nextChips = [...chips];
    nextChips[idx] = trimmed;
    setChips(nextChips);
    localStorage.setItem('eduest_print_chips', JSON.stringify(nextChips));
    if (selectedChip === oldChip) {
      setSelectedChip(trimmed);
      localStorage.setItem('eduest_print_selected_chip', trimmed);
    }
    setEditingChipIdx(null);
  };

  const handleResetChips = () => {
    if (confirm('시험 구분 칩 목록을 초기 기본값으로 되돌리시겠습니까?')) {
      setChips(DEFAULT_CHIPS);
      setSelectedChip('모의평가');
      localStorage.setItem('eduest_print_chips', JSON.stringify(DEFAULT_CHIPS));
      localStorage.setItem('eduest_print_selected_chip', '모의평가');
    }
  };

  const handleQuestionsPerPageChange = (count: QuestionsPerPageType) => {
    setQuestionsPerPage(count);
    const nextCols = count === 1 || count === 2 ? 1 : 2;
    setColumns(nextCols);
    localStorage.setItem('eduest_print_q_per_page', String(count));
    localStorage.setItem('eduest_print_columns', String(nextCols));
  };

  const handleColumnsChange = (cols: 1 | 2) => {
    setColumns(cols);
    localStorage.setItem('eduest_print_columns', String(cols));
  };

  const handleMarginChange = (margin: 'compact' | 'normal') => {
    setMarginSize(margin);
    localStorage.setItem('eduest_print_margin', margin);
  };

  const handleToggleHeaderInfo = (checked: boolean) => {
    setShowHeaderInfo(checked);
    localStorage.setItem('eduest_print_show_header', String(checked));
  };

  const handleToggleShowPoints = (checked: boolean) => {
    setShowPoints(checked);
    localStorage.setItem('eduest_print_show_points', String(checked));
  };

  const handleToggleAnswerKey = (checked: boolean) => {
    setIncludeAnswerKey(checked);
    localStorage.setItem('eduest_print_include_key', String(checked));
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
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200">
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
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer"
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
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer"
              title="확대"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(0.8)}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
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
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="창 닫기"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* 중앙 메인 바디 (좌: 컨트롤 패널 / 우: 실시간 A4 미리보기 뷰어) */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 사이드바: 레이아웃 & 옵션 패널 (no-print) */}
        <aside className="no-print w-84 bg-slate-900/90 border-r border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0 text-slate-200">
          
          {/* 1. 페이지당 문항 수 선택 */}
          <div className="space-y-2">
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
          </div>

          {/* 2. 단(Column) & 여백 레이아웃 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-300 flex items-center gap-1">
                <Columns size={12} className="text-violet-400" />
                <span>단 배치</span>
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => handleColumnsChange(1)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    columns === 1 ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  1단
                </button>
                <button
                  type="button"
                  onClick={() => handleColumnsChange(2)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    columns === 2 ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  2단
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-300 flex items-center gap-1">
                <FileText size={12} className="text-violet-400" />
                <span>인쇄 여백</span>
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => handleMarginChange('compact')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    marginSize === 'compact' ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  좁게
                </button>
                <button
                  type="button"
                  onClick={() => handleMarginChange('normal')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    marginSize === 'normal' ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  보통
                </button>
              </div>
            </div>
          </div>

          {/* 3. 🏫 학원 / 기관명 표기 (디폴트 OFF, 토글 ON 시 활성화 + localStorage 자동 기억) */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-200 flex items-center gap-1.5 cursor-pointer">
                <Building2 size={14} className="text-violet-400" />
                <span>학원 / 기관명 표기</span>
              </label>
              
              {/* 스위치 토글 */}
              <button
                type="button"
                onClick={() => handleToggleAcademyName(!showAcademyName)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showAcademyName ? 'bg-violet-600' : 'bg-slate-700'
                }`}
                title={showAcademyName ? '학원명 표기 끄기 (OFF)' : '학원명 표기 켜기 (ON)'}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    showAcademyName ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {showAcademyName ? (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <input
                  type="text"
                  value={academyName}
                  onChange={e => handleAcademyNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 focus:border-violet-500 rounded-xl text-xs text-white focus:outline-hidden"
                  placeholder="예: OO수학학원, 에듀에스트"
                />
                <p className="text-[10px] text-violet-300/80">
                  ✓ 입력하신 학원명은 자동 저장되어 다음 인쇄 시에도 유지됩니다.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                현재 시험지에 학원명이 인쇄되지 않습니다. (무기명 모드)
              </p>
            )}
          </div>

          {/* 4. 🏷️ 시험 구분 (소제목 커스텀 칩 관리) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <Tag size={13} className="text-violet-400" />
                <span>시험 구분 (소제목 칩)</span>
              </label>
              <div className="flex items-center gap-2">
                {selectedChip && (
                  <button
                    type="button"
                    onClick={() => handleSelectChip(selectedChip)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                  >
                    선택 해제
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetChips}
                  className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                  title="기본 칩 목록으로 복원"
                >
                  기본값
                </button>
              </div>
            </div>

            {/* 칩 목록 */}
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, idx) => {
                const isSelected = selectedChip === chip;
                const isEditing = editingChipIdx === idx;

                if (isEditing) {
                  return (
                    <div key={idx} className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-violet-500">
                      <input
                        type="text"
                        value={editingChipText}
                        onChange={e => setEditingChipText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEditChip(idx);
                          if (e.key === 'Escape') setEditingChipIdx(null);
                        }}
                        autoFocus
                        className="w-20 px-1.5 py-0.5 text-xs bg-slate-900 text-white rounded focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditChip(idx)}
                        className="p-1 text-emerald-400 hover:bg-emerald-950/50 rounded cursor-pointer"
                        title="수정 완료"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingChipIdx(null)}
                        className="p-1 text-slate-400 hover:bg-slate-700 rounded cursor-pointer"
                        title="취소"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectChip(chip)}
                    className={`group pl-2.5 pr-1.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? 'bg-violet-600 text-white border-violet-500 shadow-xs'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{chip}</span>

                    {/* 칩 편집/삭제 액션 버튼들 */}
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 ml-0.5">
                      <button
                        type="button"
                        onClick={e => handleStartEditChip(idx, chip, e)}
                        className="p-0.5 hover:text-amber-300 transition-colors cursor-pointer"
                        title="칩 이름 수정"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={e => handleDeleteChip(chip, e)}
                        className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer"
                        title="칩 삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 새 칩 추가 인라인 버튼 or 입력창 */}
              {isAddingChip ? (
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-violet-500">
                  <input
                    type="text"
                    value={newChipText}
                    onChange={e => setNewChipText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddChip();
                      if (e.key === 'Escape') setIsAddingChip(false);
                    }}
                    placeholder="새 칩 이름"
                    autoFocus
                    className="w-24 px-1.5 py-0.5 text-xs bg-slate-900 text-white rounded focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddChip}
                    className="px-1.5 py-0.5 bg-violet-600 text-white text-[11px] font-bold rounded hover:bg-violet-500 cursor-pointer"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingChip(false); setNewChipText(''); }}
                    className="p-1 text-slate-400 hover:bg-slate-700 rounded cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingChip(true)}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800/40 text-slate-400 hover:text-violet-300 hover:bg-slate-800 border border-dashed border-slate-700 hover:border-violet-500 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus size={12} />
                  <span>새 칩 추가</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              ※ 칩을 클릭해 선택하거나, 마우스를 올려 이름을 수정/삭제할 수 있습니다.
            </p>
          </div>

          {/* 5. 세부 출력 옵션 (체크박스) */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-black text-slate-200">세부 인쇄 옵션</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeaderInfo}
                  onChange={e => handleToggleHeaderInfo(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                />
                <span>수험자 기재란 (반/이름/점수) 포함</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPoints}
                  onChange={e => handleToggleShowPoints(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                />
                <span>문항별 배점 표시 (예: [4.0점])</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={e => handleToggleAnswerKey(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                />
                <span>마지막 장 빠른 정답표(Answer Key) 첨부</span>
              </label>
            </div>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-violet-950/40 border border-violet-800/40 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-violet-300 text-xs font-bold">
              <Sparkles size={13} />
              <span>인쇄 & PDF 저장 안내</span>
            </div>
            <p className="text-[11px] text-violet-300/80 leading-normal">
              인쇄 창에서 <strong>[대상: PDF로 저장]</strong>을 선택하시면 깨짐 없는 고화질 벡터 PDF로 바로 저장됩니다.
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
                            
                            {/* 학원명 & 시험구분 칩 결합 헤더 라인 */}
                            {(showAcademyName && academyName) || selectedChip ? (
                              <div className="text-[11px] font-bold text-slate-500 tracking-wider flex items-center gap-2">
                                {showAcademyName && academyName && (
                                  <span className="text-slate-800 font-black">{academyName}</span>
                                )}
                                {showAcademyName && academyName && selectedChip && (
                                  <span className="text-slate-300 font-light">•</span>
                                )}
                                {selectedChip && (
                                  <span className="text-violet-700 font-extrabold">{selectedChip}</span>
                                )}
                              </div>
                            ) : null}

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
                        <span>
                          {showAcademyName && academyName
                            ? academyName
                            : selectedChip
                            ? selectedChip
                            : ''}
                        </span>
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
                    <span>{showAcademyName && academyName ? academyName : ''}</span>
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
                      {showAcademyName && academyName ? `${academyName} • ` : ''}정답 및 배점표
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
                  <span>{showAcademyName && academyName ? academyName : ''}</span>
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
