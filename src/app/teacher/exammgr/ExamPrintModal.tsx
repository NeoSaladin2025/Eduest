'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Printer,
  Download,
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
  Trash2,
  Sliders,
  AlertTriangle,
  Type,
  ArrowUpDown,
  BookOpen,
  Users,
  User
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { parseExamRoundAndBaseTitle } from './treasureTypes';

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface ExamPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPaper | null;
  students?: Student[];
}

export type QuestionsPerPageType = 1 | 2 | 4 | 6;
export type DuplexBindingType = 'long' | 'short';
export type AnswerFontFamilyType = 'math' | 'sans' | 'serif';
export type AnswerFontSizeType = 'small' | 'medium' | 'large';
export type AnswerFontWeightType = 'medium' | 'bold' | 'black';
export type TitleFontSizeType = 'small' | 'medium' | 'large';
export type HeaderDensityType = 'compact' | 'normal';
export type MarginPresetType = 'ultracompact' | 'compact' | 'normal' | 'custom';
export type PageRangePresetType = 'all' | 'problems_only' | 'odd' | 'even' | 'custom';

const DEFAULT_CHIPS = ['모의평가', '단원평가', '주간테스트', '과제물', '중간고사 대비'];

export default function ExamPrintModal({ isOpen, onClose, exam, students }: ExamPrintModalProps) {
  // 레이아웃 & 옵션 상태
  const [questionsPerPage, setQuestionsPerPage] = useState<QuestionsPerPageType>(4);
  const [columns, setColumns] = useState<1 | 2>(2);
  
  // 📏 여백 설정 상태 (초밀착 5mm★ / 좁게 8mm / 보통 12mm / 직접 설정)
  const [marginPreset, setMarginPreset] = useState<MarginPresetType>('normal');
  const [customMarginTB, setCustomMarginTB] = useState<number>(8); // mm (상하 여백)
  const [customMarginLR, setCustomMarginLR] = useState<number>(8); // mm (좌우 여백)
  const [columnGapSize, setColumnGapSize] = useState<'slim' | 'normal'>('normal'); // 2단 가운데 간격 (슬림 8px vs 보통 16px)
  const [enableBindingGutter, setEnableBindingGutter] = useState<boolean>(false); // 제본용 안쪽 여백 보정 (+3mm)

  // 📐 실제 적용되는 여백 (mm 단위 및 CSS 스타일)
  const resolvedMargins = useMemo(() => {
    let topBottom = 12;
    let leftRight = 15;

    if (marginPreset === 'ultracompact') {
      topBottom = 5;
      leftRight = 6;
    } else if (marginPreset === 'compact') {
      topBottom = 8;
      leftRight = 10;
    } else if (marginPreset === 'normal') {
      topBottom = 12;
      leftRight = 15;
    } else {
      topBottom = Math.max(3, Math.min(25, Number(customMarginTB) || 8));
      leftRight = Math.max(3, Math.min(25, Number(customMarginLR) || 8));
    }

    const gutterAdd = enableBindingGutter ? 3 : 0;
    const finalLeft = leftRight + gutterAdd;
    const finalRight = leftRight;

    return {
      topBottom,
      leftRight,
      finalLeft,
      finalRight,
      cssPadding: `${topBottom}mm ${finalRight}mm ${topBottom}mm ${finalLeft}mm`,
      compactLabel: `${topBottom}mm / ${leftRight}mm`,
      isUltra: marginPreset === 'ultracompact' || (marginPreset === 'custom' && (topBottom <= 6 || leftRight <= 6)),
      isCompact: marginPreset === 'compact' || (marginPreset === 'custom' && (topBottom <= 8 || leftRight <= 10)),
    };
  }, [marginPreset, customMarginTB, customMarginLR, enableBindingGutter]);

  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);

  // 📐 2단 시험지 배열 순서 & 가운데 기준선 & 폴더 정보 표시 상태
  const [columnFlowDirection, setColumnFlowDirection] = useState<'vertical' | 'horizontal'>('vertical'); // 디폴트: 세로 우선 (N자형 한국 표준)
  const [showCenterDivider, setShowCenterDivider] = useState(true); // 디폴트: ON (가운데 기준선)
  const [showFolderInfo, setShowFolderInfo] = useState(true); // 디폴트: ON (문제 폴더 정보 [5.1] 표기)

  // 📖 양면 인쇄 넘김 방향 (긴 가장자리 책넘김 vs 짧은 가장자리 위로넘김)
  const [duplexBinding, setDuplexBinding] = useState<DuplexBindingType>('long'); // 디폴트: 긴 가장자리 (책 넘김★)
  const [previewRotateEven, setPreviewRotateEven] = useState(false); // 화면 미리보기에서도 뒷면 180도 회전 여부 (디폴트: OFF)

  // 📝 빠른 정답표 전용 레이아웃 & 옵션 상태
  const [answerKeyColumns, setAnswerKeyColumns] = useState<1 | 2>(2); // 디폴트: 2단 (컴팩트 용지절약)
  const [showAnswerKeyType, setShowAnswerKeyType] = useState(false); // 디폴트: OFF (군더더기 제거, 정답란 넓게)
  const [showAnswerKeyPoints, setShowAnswerKeyPoints] = useState(true); // 디폴트: ON (정답표 배점 표기 토글)
  const [answersPerPage1Col, setAnswersPerPage1Col] = useState(22); // 1단 기준 기본 출력수
  const [answersPerPage2Col, setAnswersPerPage2Col] = useState(44); // 2단 기준 기본 출력수

  // 🎨 정답표 텍스트 글꼴 & 크기 & 수학 기호 스타일 상태
  const [answerFontFamily, setAnswerFontFamily] = useState<AnswerFontFamilyType>('math'); // 디폴트: 수학 표준 (π 완벽 곡선)
  const [answerFontSize, setAnswerFontSize] = useState<AnswerFontSizeType>('medium'); // 디폴트: 보통 (12px)
  const [answerFontWeight, setAnswerFontWeight] = useState<AnswerFontWeightType>('bold'); // 디폴트: 굵게 (700)
  const [smartMathFormatting, setSmartMathFormatting] = useState(true); // 디폴트: ON (cm³, cm² 위첨자 및 π 세리프 자동 정규화)

  // 🏷️ 제목 크기 & 헤더 레이아웃 조절 상태
  const [titleFontSize, setTitleFontSize] = useState<TitleFontSizeType>('medium'); // 디폴트: 보통 (20px)
  const [headerDensity, setHeaderDensity] = useState<HeaderDensityType>('normal'); // 디폴트: 표준형
  const [showStudentName, setShowStudentName] = useState(true); // 디폴트: 성명 자동 기재 ON
  const [customStudentName, setCustomStudentName] = useState('');
  const [showClassName, setShowClassName] = useState(true); // 디폴트: 반 자동 기재 ON
  const [customClassName, setCustomClassName] = useState('');

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

  // 📄 인쇄 대상 페이지 범위 상태
  const [pageRangePreset, setPageRangePreset] = useState<PageRangePresetType>('all');
  const [customPageInput, setCustomPageInput] = useState<string>('');
  const [manuallySelectedPages, setManuallySelectedPages] = useState<Set<number>>(new Set());

  // 화면 미리보기 줌 (기본 80%)
  const [zoomScale, setZoomScale] = useState(0.8);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printingProgress, setPrintingProgress] = useState<{
    current: number;
    total: number;
    studentName: string;
  } | null>(null);
  const cancelPrintRef = useRef(false);

  // 컴포넌트 언마운트 시 인쇄 플래그 정리
  useEffect(() => {
    return () => {
      cancelPrintRef.current = true;
    };
  }, []);

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

      // 인쇄 여백 및 간격 설정 복원
      const savedPreset = localStorage.getItem('eduest_print_margin_preset');
      const savedOldMargin = localStorage.getItem('eduest_print_margin');
      if (savedPreset === 'ultracompact' || savedPreset === 'compact' || savedPreset === 'normal' || savedPreset === 'custom') {
        setMarginPreset(savedPreset);
      } else if (savedOldMargin === 'compact' || savedOldMargin === 'normal') {
        setMarginPreset(savedOldMargin);
      }

      const savedTB = localStorage.getItem('eduest_print_margin_tb');
      if (savedTB) {
        const num = Number(savedTB);
        if (!isNaN(num) && num >= 3 && num <= 25) setCustomMarginTB(num);
      }

      const savedLR = localStorage.getItem('eduest_print_margin_lr');
      if (savedLR) {
        const num = Number(savedLR);
        if (!isNaN(num) && num >= 3 && num <= 25) setCustomMarginLR(num);
      }

      const savedGap = localStorage.getItem('eduest_print_column_gap');
      if (savedGap === 'slim' || savedGap === 'normal') {
        setColumnGapSize(savedGap);
      }

      const savedGutter = localStorage.getItem('eduest_print_binding_gutter');
      if (savedGutter !== null) {
        setEnableBindingGutter(savedGutter === 'true');
      }

      const savedHeaderInfo = localStorage.getItem('eduest_print_show_header');
      if (savedHeaderInfo !== null) setShowHeaderInfo(savedHeaderInfo === 'true');

      const savedPoints = localStorage.getItem('eduest_print_show_points');
      if (savedPoints !== null) setShowPoints(savedPoints === 'true');

      const savedKey = localStorage.getItem('eduest_print_include_key');
      if (savedKey !== null) setIncludeAnswerKey(savedKey === 'true');

      // 4. 빠른 정답표 전용 옵션 복원
      const savedAnsCols = localStorage.getItem('eduest_print_ans_columns');
      if (savedAnsCols === '1' || savedAnsCols === '2') {
        setAnswerKeyColumns(Number(savedAnsCols) as 1 | 2);
      }

      const savedAnsType = localStorage.getItem('eduest_print_ans_show_type');
      if (savedAnsType !== null) {
        setShowAnswerKeyType(savedAnsType === 'true');
      }

      const savedAnsPoints = localStorage.getItem('eduest_print_ans_show_points');
      if (savedAnsPoints !== null) {
        setShowAnswerKeyPoints(savedAnsPoints === 'true');
      }

      const savedAns1Col = localStorage.getItem('eduest_print_ans_per_page_1col');
      if (savedAns1Col) {
        const n = Number(savedAns1Col);
        if (!isNaN(n) && n >= 10 && n <= 36) setAnswersPerPage1Col(n);
      }

      const savedAns2Col = localStorage.getItem('eduest_print_ans_per_page_2col');
      if (savedAns2Col) {
        const n = Number(savedAns2Col);
        if (!isNaN(n) && n >= 20 && n <= 70) setAnswersPerPage2Col(n);
      }

      // 5. 정답표 폰트 & 크기 & 수학 스타일 복원
      const savedAnsFont = localStorage.getItem('eduest_print_ans_font_family');
      if (savedAnsFont === 'math' || savedAnsFont === 'sans' || savedAnsFont === 'serif') {
        setAnswerFontFamily(savedAnsFont);
      }

      const savedAnsSize = localStorage.getItem('eduest_print_ans_font_size');
      if (savedAnsSize === 'small' || savedAnsSize === 'medium' || savedAnsSize === 'large') {
        setAnswerFontSize(savedAnsSize);
      }

      const savedAnsWeight = localStorage.getItem('eduest_print_ans_font_weight');
      if (savedAnsWeight === 'medium' || savedAnsWeight === 'bold' || savedAnsWeight === 'black') {
        setAnswerFontWeight(savedAnsWeight);
      }

      const savedSmartMath = localStorage.getItem('eduest_print_ans_smart_math');
      if (savedSmartMath !== null) {
        setSmartMathFormatting(savedSmartMath === 'true');
      }

      // 6. 2단 문항 배열 순서 & 가운데 기준선 & 폴더 정보 복원
      const savedFlow = localStorage.getItem('eduest_print_flow_direction');
      if (savedFlow === 'vertical' || savedFlow === 'horizontal') {
        setColumnFlowDirection(savedFlow);
      }

      const savedCenterDivider = localStorage.getItem('eduest_print_show_center_divider');
      if (savedCenterDivider !== null) {
        setShowCenterDivider(savedCenterDivider === 'true');
      }

      const savedFolderInfo = localStorage.getItem('eduest_print_show_folder_info');
      if (savedFolderInfo !== null) {
        setShowFolderInfo(savedFolderInfo === 'true');
      }

      // 7. 양면 인쇄 넘김 방향 복원 (디폴트: 긴 가장자리 long)
      const savedDuplex = localStorage.getItem('eduest_print_duplex_binding');
      if (savedDuplex === 'long' || savedDuplex === 'short') {
        setDuplexBinding(savedDuplex);
      } else {
        setDuplexBinding('long'); // 디폴트: 긴 가장자리 (책 넘김★)
      }

      // 8. 제목 크기 & 헤더 밀도 & 수험표 복원
      const savedTitleSize = localStorage.getItem('eduest_print_title_size');
      if (savedTitleSize === 'small' || savedTitleSize === 'medium' || savedTitleSize === 'large') {
        setTitleFontSize(savedTitleSize as TitleFontSizeType);
      }
      const savedHeaderDensity = localStorage.getItem('eduest_print_header_density');
      if (savedHeaderDensity === 'compact' || savedHeaderDensity === 'normal') {
        setHeaderDensity(savedHeaderDensity as HeaderDensityType);
      }
      const savedShowStudent = localStorage.getItem('eduest_print_show_student_name');
      if (savedShowStudent !== null) {
        setShowStudentName(savedShowStudent === 'true');
      }
      const savedShowClass = localStorage.getItem('eduest_print_show_class_name');
      if (savedShowClass !== null) {
        setShowClassName(savedShowClass === 'true');
      }
    } catch (e) {
      console.warn('Failed to load saved print config:', e);
    }
  }, []);

  // 👥 배정 학생 목록 및 다중 선택 상태 (학생별 맞춤 인쇄)
  const assignedStudents = useMemo(() => {
    if (!exam || !Array.isArray(exam.assigned_student_ids) || !Array.isArray(students)) return [];
    return students.filter(s => exam.assigned_student_ids.includes(s.id));
  }, [exam, students]);

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // 🎓 배정 학생 성명 및 반 자동 초기화 (exam 또는 students prop 변경 시)
  useEffect(() => {
    if (!exam) return;
    let resolvedName = '';
    let resolvedClass = exam.grade || '';

    // 1. 배정된 학생이 있는 경우 (최우선 순위: 첫 번째 배정 학생 자동 선택)
    if (assignedStudents.length > 0) {
      setSelectedStudentIds([assignedStudents[0].id]);
      resolvedName = assignedStudents[0].name;
      resolvedClass = assignedStudents[0].grade || exam.grade || '';
    } else if (exam.target_student_name) {
      // 2. 1인 지정 시험지인 경우
      resolvedName = exam.target_student_name;
    } else {
      // 3. 배정 학생이 없는 경우: 제목 단어('원본문제', '교과서' 등) 오인 방어
      const parsed = parseExamRoundAndBaseTitle(exam.title);
      if (parsed.studentName) {
        const cleanCandidate = parsed.studentName.trim();
        const isBlacklisted = /^(원본|원본문제|교과서|문제|정답|해설|풀이|기출|모의평가|특강|수업|과제|중1|중2|중3|고1|고2|고3|[A-Za-z0-9]+)$/.test(cleanCandidate)
          || cleanCandidate.includes('문제')
          || cleanCandidate.includes('교과서')
          || cleanCandidate.includes('동아');
        if (!isBlacklisted) {
          resolvedName = cleanCandidate;
        }
      }
    }

    setCustomStudentName(resolvedName);
    setCustomClassName(resolvedClass);
  }, [exam, students, assignedStudents]);

  // 학생 선택 토글 핸들러
  const handleToggleStudentSelect = (studentId: string) => {
    setSelectedStudentIds(prev => {
      let next: string[];
      if (prev.includes(studentId)) {
        next = prev.filter(id => id !== studentId);
      } else {
        next = [...prev, studentId];
      }

      if (next.length === 1) {
        const target = assignedStudents.find(s => s.id === next[0]);
        if (target) {
          setCustomStudentName(target.name);
          setCustomClassName(target.grade || exam?.grade || '');
        }
      } else if (next.length === 0) {
        setCustomStudentName('');
      } else if (next.length > 1) {
        const firstSelected = assignedStudents.find(s => s.id === next[0]);
        if (firstSelected) {
          setCustomStudentName(firstSelected.name);
          setCustomClassName(firstSelected.grade || exam?.grade || '');
        }
      }
      return next;
    });
  };

  const handleToggleSelectAllStudents = () => {
    if (selectedStudentIds.length === assignedStudents.length) {
      setSelectedStudentIds([]);
      setCustomStudentName('');
    } else {
      setSelectedStudentIds(assignedStudents.map(s => s.id));
      if (assignedStudents.length > 0) {
        setCustomStudentName(assignedStudents[0].name);
        setCustomClassName(assignedStudents[0].grade || exam?.grade || '');
      }
    }
  };

  // 🔄 설정 변경 헬퍼 및 localStorage 동기화
  const handleDuplexBindingChange = (binding: DuplexBindingType) => {
    setDuplexBinding(binding);
    localStorage.setItem('eduest_print_duplex_binding', binding);
  };

  const handleToggleFlowDirection = (dir: 'vertical' | 'horizontal') => {
    setColumnFlowDirection(dir);
    localStorage.setItem('eduest_print_flow_direction', dir);
  };

  const handleToggleCenterDivider = (checked: boolean) => {
    setShowCenterDivider(checked);
    localStorage.setItem('eduest_print_show_center_divider', String(checked));
  };

  const handleTitleFontSizeChange = (size: TitleFontSizeType) => {
    setTitleFontSize(size);
    localStorage.setItem('eduest_print_title_size', size);
  };

  const handleHeaderDensityChange = (density: HeaderDensityType) => {
    setHeaderDensity(density);
    localStorage.setItem('eduest_print_header_density', density);
  };

  const handleToggleStudentName = (checked: boolean) => {
    setShowStudentName(checked);
    localStorage.setItem('eduest_print_show_student_name', String(checked));
  };

  const handleToggleClassName = (checked: boolean) => {
    setShowClassName(checked);
    localStorage.setItem('eduest_print_show_class_name', String(checked));
  };

  const handleToggleShowFolderInfo = (checked: boolean) => {
    setShowFolderInfo(checked);
    localStorage.setItem('eduest_print_show_folder_info', String(checked));
  };

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

  const handleMarginPresetChange = (preset: MarginPresetType) => {
    setMarginPreset(preset);
    localStorage.setItem('eduest_print_margin_preset', preset);
    if (preset === 'ultracompact') {
      setColumnGapSize('slim');
      localStorage.setItem('eduest_print_column_gap', 'slim');
    }
  };

  const handleCustomMarginTBChange = (val: number) => {
    const clamped = Math.max(3, Math.min(25, val));
    setCustomMarginTB(clamped);
    localStorage.setItem('eduest_print_margin_tb', String(clamped));
  };

  const handleCustomMarginLRChange = (val: number) => {
    const clamped = Math.max(3, Math.min(25, val));
    setCustomMarginLR(clamped);
    localStorage.setItem('eduest_print_margin_lr', String(clamped));
  };

  const handleToggleColumnGapSize = (gap: 'slim' | 'normal') => {
    setColumnGapSize(gap);
    localStorage.setItem('eduest_print_column_gap', gap);
  };

  const handleToggleBindingGutter = (checked: boolean) => {
    setEnableBindingGutter(checked);
    localStorage.setItem('eduest_print_binding_gutter', String(checked));
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

  const handleAnswerKeyColumnsChange = (cols: 1 | 2) => {
    setAnswerKeyColumns(cols);
    localStorage.setItem('eduest_print_ans_columns', String(cols));
  };

  const handleToggleAnswerKeyType = (checked: boolean) => {
    setShowAnswerKeyType(checked);
    localStorage.setItem('eduest_print_ans_show_type', String(checked));
  };

  const handleToggleAnswerKeyPoints = (checked: boolean) => {
    setShowAnswerKeyPoints(checked);
    localStorage.setItem('eduest_print_ans_show_points', String(checked));
  };

  const handleAnswersPerPageChange = (delta: number) => {
    if (answerKeyColumns === 1) {
      const nextVal = Math.min(32, Math.max(10, answersPerPage1Col + delta));
      setAnswersPerPage1Col(nextVal);
      localStorage.setItem('eduest_print_ans_per_page_1col', String(nextVal));
    } else {
      const nextVal = Math.min(64, Math.max(20, answersPerPage2Col + delta));
      setAnswersPerPage2Col(nextVal);
      localStorage.setItem('eduest_print_ans_per_page_2col', String(nextVal));
    }
  };

  const handleResetAnswersPerPage = () => {
    if (answerKeyColumns === 1) {
      setAnswersPerPage1Col(22);
      localStorage.setItem('eduest_print_ans_per_page_1col', '22');
    } else {
      setAnswersPerPage2Col(44);
      localStorage.setItem('eduest_print_ans_per_page_2col', '44');
    }
  };

  const handleAnswerFontFamilyChange = (val: AnswerFontFamilyType) => {
    setAnswerFontFamily(val);
    localStorage.setItem('eduest_print_ans_font_family', val);
  };

  const handleAnswerFontSizeChange = (val: AnswerFontSizeType) => {
    setAnswerFontSize(val);
    localStorage.setItem('eduest_print_ans_font_size', val);
  };

  const handleAnswerFontWeightChange = (val: AnswerFontWeightType) => {
    setAnswerFontWeight(val);
    localStorage.setItem('eduest_print_ans_font_weight', val);
  };

  const handleToggleSmartMath = (enabled: boolean) => {
    setSmartMathFormatting(enabled);
    localStorage.setItem('eduest_print_ans_smart_math', String(enabled));
  };

  // 📐 수학 기호(π, °) 스마트 렌더링 및 단위(cm³) 위첨자 자동 정규화 헬퍼
  const renderFormattedAnswer = (rawText: string | undefined | null) => {
    if (!rawText) return '-';
    let text = rawText;

    if (smartMathFormatting) {
      // 1. 일반 텍스트로 적힌 단위들을 표준 위첨자 기호로 자동 정규화
      text = text
        .replace(/\bcm3\b/gi, 'cm³')
        .replace(/\bcm2\b/gi, 'cm²')
        .replace(/\bm3\b/gi, 'm³')
        .replace(/\bm2\b/gi, 'm²')
        .replace(/\bkm2\b/gi, 'km²')
        .replace(/\bmm2\b/gi, 'mm²')
        .replace(/\bmm3\b/gi, 'mm³');

      // 2. 문맥 인식 각도 보정 (Context-Aware Degree Formatting):
      // 합성함수(f ∘ g, g ∘ f)는 100% 안전하게 보호하고, 오직 숫자 바로 뒤에 붙은 각도(1800∘, 156º, 90˚ 등)만 __DEGREE__ 토큰으로 변환!
      text = text.replace(/(\d+(?:\.\d+)?)\s*[∘º˚°]/g, '$1__DEGREE__');
    }

    // 3. π 기호 및 각도(__DEGREE__)를 교과서 표준 스타일로 분할 렌더링
    const tokenRegex = /(__DEGREE__|π)/g;
    if (tokenRegex.test(text)) {
      const parts = text.split(tokenRegex);
      return parts.map((part, pIdx) => {
        if (part === '__DEGREE__') {
          return (
            <span
              key={pIdx}
              className="font-sans font-black text-[0.85em] align-top relative -top-[0.25em] ml-[0.5px] select-text leading-none inline-block"
            >
              °
            </span>
          );
        }
        if (part === 'π') {
          return (
            <span
              key={pIdx}
              className="font-serif italic font-normal text-[1.15em] px-[1px] inline-block select-text leading-none"
              style={{
                fontFamily: '"Cambria Math", "Times New Roman", "KaTeX_Math", serif',
                verticalAlign: 'baseline'
              }}
            >
              π
            </span>
          );
        }
        return part;
      });
    }

    return text;
  };

  // 🎨 선택된 폰트, 크기, 굵기 스타일 계산
  const getAnswerTextStyle = () => {
    let fontFamStyle: React.CSSProperties = {};
    if (answerFontFamily === 'math') {
      fontFamStyle = {
        fontFamily: '"Cambria Math", "Times New Roman", "Noto Serif KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      };
    } else if (answerFontFamily === 'serif') {
      fontFamStyle = {
        fontFamily: '"KoPub Batang", Batang, "Noto Serif KR", serif'
      };
    } else {
      fontFamStyle = {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, "Malgun Gothic", sans-serif'
      };
    }

    let sizeClass = 'text-xs';
    if (answerFontSize === 'small') sizeClass = 'text-[11px]';
    if (answerFontSize === 'large') sizeClass = 'text-[13.5px]';

    let weightClass = 'font-bold';
    if (answerFontWeight === 'medium') weightClass = 'font-medium';
    if (answerFontWeight === 'black') weightClass = 'font-black';

    return { fontFamStyle, sizeClass, weightClass };
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

  // 📝 빠른 정답표 전용 스마트 페이지 분할 (1단 / 2단 및 텍스트 줄바꿈 대응)
  interface AnswerPageItem {
    q: ExamQuestion;
    globalIndex: number;
  }

  interface AnswerPageData {
    pageIndex: number;
    isFirstPage: boolean;
    questions1Col?: AnswerPageItem[];
    leftQuestions?: AnswerPageItem[];
    rightQuestions?: AnswerPageItem[];
    isWarningOverflow: boolean;
  }

  const answerPages = useMemo<AnswerPageData[]>(() => {
    if (!includeAnswerKey || !exam || !exam.questions || exam.questions.length === 0) {
      return [];
    }

    const allItems: AnswerPageItem[] = exam.questions.map((q, idx) => ({
      q,
      globalIndex: idx + 1
    }));

    const pages: AnswerPageData[] = [];
    let currentIndex = 0;
    let pageIdx = 0;

    if (answerKeyColumns === 1) {
      // 1단 모드: 1페이지는 메인 헤더(~40mm) 공간 감안하여 약간 적게 배치
      while (currentIndex < allItems.length) {
        const isFirst = pageIdx === 0;
        const capacity = isFirst
          ? Math.max(6, answersPerPage1Col - 4)
          : answersPerPage1Col;

        const pageItems = allItems.slice(currentIndex, currentIndex + capacity);
        currentIndex += pageItems.length;

        const isWarning =
          capacity > 26 ||
          pageItems.filter(item => (item.q.answer?.length || 0) > 40).length >= 4;

        pages.push({
          pageIndex: pageIdx,
          isFirstPage: isFirst,
          questions1Col: pageItems,
          isWarningOverflow: isWarning
        });
        pageIdx++;
      }
    } else {
      // 2단 컴팩트 모드: 1페이지는 메인 헤더 감안, 각 페이지는 좌/우 2열로 균등 분할
      while (currentIndex < allItems.length) {
        const isFirst = pageIdx === 0;
        const capacity = isFirst
          ? Math.max(12, answersPerPage2Col - 8)
          : answersPerPage2Col;

        const pageItems = allItems.slice(currentIndex, currentIndex + capacity);
        currentIndex += pageItems.length;

        const half = Math.ceil(pageItems.length / 2);
        const leftItems = pageItems.slice(0, half);
        const rightItems = pageItems.slice(half);

        const isWarning =
          capacity > 52 ||
          pageItems.filter(item => (item.q.answer?.length || 0) > 40).length >= 6;

        pages.push({
          pageIndex: pageIdx,
          isFirstPage: isFirst,
          leftQuestions: leftItems,
          rightQuestions: rightItems,
          isWarningOverflow: isWarning
        });
        pageIdx++;
      }
    }

    return pages;
  }, [includeAnswerKey, exam, answerKeyColumns, answersPerPage1Col, answersPerPage2Col]);

  // 시험지 본문 페이지수 + 정답표 페이지수 완벽 합산
  const totalPages = questionPages.length + (includeAnswerKey ? answerPages.length : 0);

  // 📄 텍스트 범위 파싱 헬퍼 (예: "1-3, 5" -> [1, 2, 3, 5])
  const parsePageRangeString = (input: string, maxPages: number): Set<number> => {
    const result = new Set<number>();
    const tokens = input.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);

    tokens.forEach(tok => {
      if (tok.includes('-')) {
        const parts = tok.split('-');
        const s = parseInt(parts[0], 10);
        const e = parseInt(parts[1], 10);
        if (!isNaN(s) && !isNaN(e)) {
          const from = Math.max(1, Math.min(s, e));
          const to = Math.min(maxPages, Math.max(s, e));
          for (let p = from; p <= to; p++) result.add(p);
        }
      } else {
        const p = parseInt(tok, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          result.add(p);
        }
      }
    });

    return result;
  };

  // 📄 실제 인쇄 대상 페이지 번호 집합 (1-based Set)
  const effectiveSelectedPages = useMemo<Set<number>>(() => {
    const allSet = new Set<number>();
    for (let i = 1; i <= totalPages; i++) allSet.add(i);

    if (pageRangePreset === 'all') {
      return allSet;
    }
    if (pageRangePreset === 'problems_only') {
      const qSet = new Set<number>();
      for (let i = 1; i <= questionPages.length; i++) qSet.add(i);
      return qSet.size > 0 ? qSet : allSet;
    }
    if (pageRangePreset === 'odd') {
      const oddSet = new Set<number>();
      for (let i = 1; i <= totalPages; i += 2) oddSet.add(i);
      return oddSet;
    }
    if (pageRangePreset === 'even') {
      const evenSet = new Set<number>();
      for (let i = 2; i <= totalPages; i += 2) evenSet.add(i);
      return evenSet;
    }
    // custom
    if (customPageInput.trim()) {
      const parsed = parsePageRangeString(customPageInput, totalPages);
      return parsed.size > 0 ? parsed : allSet;
    }
    return manuallySelectedPages.size > 0 ? manuallySelectedPages : allSet;
  }, [pageRangePreset, customPageInput, manuallySelectedPages, totalPages, questionPages.length]);

  const handlePagePresetChange = (preset: PageRangePresetType) => {
    setPageRangePreset(preset);
    if (preset === 'all') {
      const set = new Set<number>();
      for (let i = 1; i <= totalPages; i++) set.add(i);
      setManuallySelectedPages(set);
      setCustomPageInput('');
    } else if (preset === 'problems_only') {
      const set = new Set<number>();
      for (let i = 1; i <= questionPages.length; i++) set.add(i);
      setManuallySelectedPages(set);
      setCustomPageInput(`1-${questionPages.length}`);
    } else if (preset === 'odd') {
      const set = new Set<number>();
      for (let i = 1; i <= totalPages; i += 2) set.add(i);
      setManuallySelectedPages(set);
      setCustomPageInput(Array.from(set).join(', '));
    } else if (preset === 'even') {
      const set = new Set<number>();
      for (let i = 2; i <= totalPages; i += 2) set.add(i);
      setManuallySelectedPages(set);
      setCustomPageInput(Array.from(set).join(', '));
    }
  };

  const handleTogglePage = (pageNum: number) => {
    setPageRangePreset('custom');
    setManuallySelectedPages(prev => {
      const base = prev.size > 0 ? prev : effectiveSelectedPages;
      const next = new Set(base);
      if (next.has(pageNum)) {
        if (next.size > 1) {
          next.delete(pageNum);
        } else {
          alert('최소 1개 이상의 페이지를 선택해야 인쇄할 수 있습니다.');
          return prev;
        }
      } else {
        next.add(pageNum);
      }
      setCustomPageInput(Array.from(next).sort((a, b) => a - b).join(', '));
      return next;
    });
  };

  // 📋 정답표 테이블 렌더링 헬퍼 함수 (1단 및 2단 공용)
  const renderAnswerTable = (items: AnswerPageItem[], isCompactCol: boolean = false) => {
    const { fontFamStyle, sizeClass, weightClass } = getAnswerTextStyle();

    return (
      <div className="border border-slate-900 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-xs text-center border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-900 font-black text-slate-800">
              <th className={`py-1.5 px-2 border-r border-slate-300 ${isCompactCol ? 'w-10' : 'w-14'}`}>
                번호
              </th>
              {showAnswerKeyType && (
                <th className={`py-1.5 px-2 border-r border-slate-300 ${isCompactCol ? 'w-14' : 'w-18'}`}>
                  유형
                </th>
              )}
              {showAnswerKeyPoints && (
                <th className={`py-1.5 px-2 border-r border-slate-300 ${isCompactCol ? 'w-12' : 'w-16'}`}>
                  배점
                </th>
              )}
              <th className="py-1.5 px-3 text-left">정답</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIdx) => {
              const { q, globalIndex } = item;
              const points = q.points || (q.is_descriptive ? 5 : 4);
              const isSub = q.sub_questions && q.sub_questions.length > 0;

              return (
                <tr
                  key={q.id || globalIndex}
                  className={`border-b border-slate-200 ${
                    rowIdx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                  }`}
                >
                  <td className="py-1.5 px-2 border-r border-slate-200 font-black text-slate-800">
                    {globalIndex}
                  </td>
                  {showAnswerKeyType && (
                    <td className="py-1.5 px-2 border-r border-slate-200 text-slate-600 font-bold text-[11px]">
                      {q.is_descriptive ? '서술형' : isSub ? '소문항' : '단답/객관'}
                    </td>
                  )}
                  {showAnswerKeyPoints && (
                    <td className="py-1.5 px-2 border-r border-slate-200 text-slate-600 font-mono font-bold text-[11px]">
                      {points}.0점
                    </td>
                  )}
                  <td
                    style={fontFamStyle}
                    className={`py-1.5 px-3 text-left ${weightClass} ${sizeClass} text-slate-900 break-words whitespace-pre-wrap leading-snug`}
                  >
                    {isSub ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {q.sub_questions!.map((sq, sqIdx) => (
                          <span key={sqIdx} className="inline-block">
                            <strong className="text-violet-700 font-black font-sans">{sq.label}</strong>{' '}
                            {renderFormattedAnswer(sq.answer)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>{renderFormattedAnswer(q.answer || q.raw_answer)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // 인쇄 취소 핸들러
  const handleCancelPrinting = () => {
    cancelPrintRef.current = true;
    setPrintingProgress(null);
  };

  // 단일 독립 iframe 생성 및 인쇄 작업 실행 (afterprint 대기)
  const executePrintJob = (fullDocumentHtml: string): Promise<void> => {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve();
        return;
      }

      doc.open();
      doc.write(fullDocumentHtml);
      doc.close();

      let isFinished = false;
      let checkTimer: NodeJS.Timeout | null = null;
      let maxTimer: NodeJS.Timeout | null = null;

      const finish = () => {
        if (isFinished) return;
        isFinished = true;

        if (checkTimer) clearInterval(checkTimer);
        if (maxTimer) clearTimeout(maxTimer);

        window.removeEventListener('afterprint', finish);
        iframe.contentWindow?.removeEventListener('afterprint', finish);

        setTimeout(() => {
          try {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          } catch (e) {
            // ignore
          }
        }, 300);

        resolve();
      };

      const startPrint = async () => {
        try {
          // iframe 내부 이미지 로딩 대기
          const iframeImages = Array.from(doc.images);
          await Promise.all(
            iframeImages.map(img => {
              if (img.complete) return Promise.resolve(true);
              return new Promise(r => {
                img.onload = () => r(true);
                img.onerror = () => r(false);
              });
            })
          );

          // 렌더링 안정화 대기
          await new Promise(r => setTimeout(r, 200));

          if (cancelPrintRef.current) {
            finish();
            return;
          }

          // afterprint 리스너 등록
          window.addEventListener('afterprint', finish, { once: true });
          iframe.contentWindow?.addEventListener('afterprint', finish, { once: true });

          // 인쇄 다이얼로그 호출
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          // 안전장치 1: 키오스크 모드(--kiosk-printing)이거나 포커스가 돌아왔을 때 안전 감지
          let stableFocusTicks = 0;
          checkTimer = setInterval(() => {
            if (cancelPrintRef.current) {
              finish();
              return;
            }
            if (document.hasFocus()) {
              stableFocusTicks++;
              if (stableFocusTicks >= 4) {
                finish();
              }
            } else {
              stableFocusTicks = 0;
            }
          }, 250);

          // 안전장치 2: 최대 60초 타임아웃
          maxTimer = setTimeout(() => {
            finish();
          }, 60000);
        } catch (err) {
          console.error('executePrintJob startPrint error:', err);
          finish();
        }
      };

      startPrint();
    });
  };

  // 📥 현재 설정 그대로 PDF 파일 직접 다운로드 (방식 2: 네이티브 벡터 인쇄창 호출)
  const isDownloadingPdf = isPreparingPrint;
  const handleDownloadPdfFromModal = () => {
    handleTriggerPrint();
  };

  // 모든 문항 이미지 사전 로딩 후 독립 iframe을 통해 브라우저 인쇄창 호출 (A4 1:1 완벽 분할)
  // 다중 학생 선택 시: 복합기 스테이플러가 각 학생마다 따로 찍히도록 학생별 개별 Print Job으로 분리 순차 전송
  const handleTriggerPrint = async () => {
    if (!exam) return;
    setIsPreparingPrint(true);
    cancelPrintRef.current = false;

    try {
      // 1. 모든 문항 이미지 사전 로딩 및 디코딩 완료 대기
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

      const printArea = document.getElementById('eduest-print-area');
      if (!printArea) {
        window.print();
        setIsPreparingPrint(false);
        return;
      }

      // 2. 현재 문서의 모든 Tailwind/전역 스타일 태그 추출
      const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
      const combinedStyles = styleNodes
        .map(node => node.outerHTML)
        .join('\n');

      const paddingVal = resolvedMargins.cssPadding;

      // 공통 완벽한 A4 인쇄 HTML 빌더
      const buildDocumentHtml = (contentHtml: string) => `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${exam.title} - 시험지 인쇄</title>
            ${combinedStyles}
            <style>
              @page {
                size: A4 portrait;
                margin: 0;
              }
              *, *::before, *::after {
                box-sizing: border-box;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                width: 210mm !important;
                height: auto !important;
                overflow: visible !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              #eduest-print-area {
                display: block !important;
                position: static !important;
                transform: none !important;
                width: 210mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
              }
              .a4-print-sheet {
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                max-height: 297mm !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: ${paddingVal} !important;
                page-break-before: auto !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-after: page !important;
                break-inside: avoid !important;
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                background: #ffffff !important;
                overflow: hidden !important;
              }
              .a4-print-sheet.even-page-rotate {
                transform: rotate(180deg) !important;
                transform-origin: 50% 50% !important;
              }
              .a4-print-sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
              .print-avoid-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            </style>
          </head>
          <body>
            <div id="eduest-print-area">
              ${contentHtml}
            </div>
          </body>
        </html>
      `;

      // 선택된 페이지만 인쇄용 컨테이너에 남기는 필터 함수
      const filterSelectedSheets = (container: HTMLElement) => {
        const sheets = Array.from(container.querySelectorAll('.a4-print-sheet'));
        sheets.forEach((sheet) => {
          const pNum = Number(sheet.getAttribute('data-page-number'));
          if (pNum && !effectiveSelectedPages.has(pNum)) {
            sheet.remove();
          }
        });
      };

      // 1명 이하 인쇄 (단일 Print Job)
      if (selectedStudentIds.length <= 1) {
        setIsPreparingPrint(false);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = printArea.innerHTML;
        filterSelectedSheets(tempDiv);
        await executePrintJob(buildDocumentHtml(tempDiv.innerHTML));
        return;
      }

      // 2명 이상 다중 학생 인쇄 (각 학생마다 독립된 Print Job으로 순차 전송 ➜ 복합기 스테이플러 개별 체결)
      const selectedStudents = assignedStudents.filter(s => selectedStudentIds.includes(s.id));
      setIsPreparingPrint(false);

      for (let i = 0; i < selectedStudents.length; i++) {
        if (cancelPrintRef.current) break;

        const st = selectedStudents[i];
        setPrintingProgress({
          current: i + 1,
          total: selectedStudents.length,
          studentName: st.name
        });

        // 학생 맞춤형 DOM 생성
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = printArea.innerHTML;
        filterSelectedSheets(tempDiv);

        const nameCells = tempDiv.querySelectorAll('[data-field="student-name"]');
        nameCells.forEach(cell => {
          cell.textContent = st.name;
        });

        const classCells = tempDiv.querySelectorAll('[data-field="class-name"]');
        classCells.forEach(cell => {
          cell.textContent = st.grade || exam.grade || '';
        });

        // 셀렉터 미검출 대비 보조 치환
        if (nameCells.length === 0 && customStudentName) {
          const walkAndReplace = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim() === customStudentName.trim()) {
              node.nodeValue = st.name;
            } else {
              node.childNodes.forEach(walkAndReplace);
            }
          };
          walkAndReplace(tempDiv);
        }

        const studentDocHtml = buildDocumentHtml(tempDiv.innerHTML);

        // 학생 1명 인쇄 작업 실행 (프린터로 1개 Job 전송 및 대기)
        await executePrintJob(studentDocHtml);

        // 다음 작업으로 넘어가기 전 프린터 스풀러 안정화 딜레이 (400ms)
        if (i < selectedStudents.length - 1 && !cancelPrintRef.current) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }

      setPrintingProgress(null);
    } catch (e) {
      console.error('Print execution failed, fallback to window.print():', e);
      setIsPreparingPrint(false);
      setPrintingProgress(null);
      window.print();
    }
  };

  if (!isOpen || !exam) return null;

  return (
    <div className="eduest-print-modal-root fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* 인쇄 전용 CSS 스타일 태그 (메인 윈도우 단축키 등 대비 fallback) */}
      <style jsx global>{`
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .eduest-print-modal-root,
          .eduest-print-modal-inner,
          .eduest-print-main-viewport,
          #eduest-print-area,
          #eduest-print-area * {
            visibility: visible !important;
          }
          .eduest-print-modal-root {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .eduest-print-modal-inner,
          .eduest-print-main-viewport {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          #eduest-print-area {
            display: block !important;
            position: static !important;
            transform: none !important;
            width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          .a4-print-sheet {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            box-sizing: border-box !important;
            margin: 0 auto !important;
            padding: ${resolvedMargins.cssPadding} !important;
            page-break-before: auto !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
            overflow: hidden !important;
          }
          .a4-print-sheet.even-page-rotate {
            transform: rotate(180deg) !important;
            transform-origin: 50% 50% !important;
          }
          .a4-print-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* 🖨️ 학생별 순차 인쇄 진행 중 오버레이 (복합기 스테이플 분리용) */}
      {printingProgress && (
        <div className="no-print absolute inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-violet-500/40 rounded-3xl p-7 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/40 text-violet-300 flex items-center justify-center mx-auto shadow-inner">
              <Printer size={28} className="animate-pulse text-violet-400" />
            </div>
            <div className="space-y-1.5">
              <span className="inline-block text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                개별 스테이플 인쇄 진행 중
              </span>
              <h4 className="text-base font-black text-white">
                <span className="text-violet-400">{printingProgress.studentName}</span> 학생 시험지 전송 중
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                총 {printingProgress.total}명 중 <strong className="text-slate-200">{printingProgress.current}번째</strong> 학생 시험지를 인쇄기로 보내고 있습니다.
              </p>
            </div>

            {/* 프로그레스 바 */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 p-0.5 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-violet-600 to-indigo-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(printingProgress.current / printingProgress.total) * 100}%` }}
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCancelPrinting}
                className="px-4 py-2 text-xs font-black text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                인쇄 전송 중단
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                스테이플 분리 엔진 v2.2
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
            disabled={isPreparingPrint || printingProgress !== null}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 active:scale-98 text-white text-xs font-black rounded-xl shadow-lg shadow-violet-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isPreparingPrint ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>이미지 준비 중...</span>
              </>
            ) : printingProgress ? (
              <>
                <Loader2 size={16} className="animate-spin text-amber-300" />
                <span>인쇄 전송 중 ({printingProgress.current}/{printingProgress.total}명: {printingProgress.studentName})</span>
              </>
            ) : (
              <>
                <Printer size={16} />
                {selectedStudentIds.length > 1 ? (
                  <span>학생 {selectedStudentIds.length}명 일괄 인쇄 (개별 스테이플 철)</span>
                ) : (
                  <span>인쇄하기 (PDF 저장)</span>
                )}
              </>
            )}
          </button>

          {/* PDF 파일 바로 다운로드 버튼 */}
          <button
            type="button"
            onClick={handleDownloadPdfFromModal}
            disabled={isDownloadingPdf || isPreparingPrint}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black text-xs shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            title="현재 화면에 보이는 설정 그대로 PDF 파일 다운로드"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>PDF 생성 중...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>PDF 다운로드</span>
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
      <div className="eduest-print-modal-inner flex-1 flex overflow-hidden">
        {/* 좌측 사이드바: 레이아웃 & 옵션 패널 (no-print) */}
        <aside className="no-print w-84 bg-slate-900/90 border-r border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0 text-slate-200">
          
          {/* 👥 0. 배정 학생 인쇄 대상 선택기 (assignedStudents가 있을 때) */}
          {assignedStudents.length > 0 && (
            <div className="p-3.5 bg-violet-950/40 border border-violet-500/30 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-violet-300 flex items-center gap-1.5">
                  <Users size={14} className="text-violet-400" />
                  <span>배정 학생 인쇄 대상 ({assignedStudents.length}명)</span>
                </label>
                <button
                  type="button"
                  onClick={handleToggleSelectAllStudents}
                  className="text-[10px] font-black text-violet-400 hover:text-violet-200 underline decoration-violet-500/50 cursor-pointer"
                >
                  {selectedStudentIds.length === assignedStudents.length ? '선택 해제' : '전체 선택'}
                </button>
              </div>

              {/* 학생 알약 버튼 목록 */}
              <div className="flex flex-wrap gap-1.5">
                {assignedStudents.map((st) => {
                  const isSelected = selectedStudentIds.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleToggleStudentSelect(st.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30 border border-violet-400'
                          : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {isSelected ? <Check size={12} className="text-white" /> : <User size={12} className="text-slate-500" />}
                      <span>{st.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 다중 선택 안내 */}
              {selectedStudentIds.length > 1 && (
                <div className="text-[11px] font-bold text-violet-300/90 bg-violet-900/30 px-3 py-2 rounded-xl border border-violet-500/20 leading-tight space-y-1">
                  <div className="flex items-center gap-1.5 text-violet-200">
                    <Sparkles size={13} className="text-amber-400 shrink-0" />
                    <strong>{selectedStudentIds.length}명 개별 스테이플 인쇄</strong>
                  </div>
                  <p className="text-[10.5px] text-violet-300/80 font-normal">
                    학생마다 독립된 인쇄 작업으로 전송되어, 복합기 스테이플러가 한 명씩 따로 묶여서 출력됩니다.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 🌟 0. 인쇄 대상 페이지 선택 (원하는 페이지만 골라 인쇄) */}
          <div className="space-y-2 bg-gradient-to-br from-violet-950/40 via-slate-900 to-indigo-950/40 p-3 rounded-2xl border border-violet-500/30 shadow-inner">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <FileText size={14} className="text-violet-400" />
                <span>인쇄 페이지 범위</span>
              </label>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/30">
                {effectiveSelectedPages.size}쪽 / 총 {totalPages}쪽
              </span>
            </div>

            {/* 빠른 프리셋 버튼들 */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handlePagePresetChange('all')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  pageRangePreset === 'all'
                    ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                    : 'bg-slate-800/70 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>전체 ({totalPages}쪽)</span>
                {pageRangePreset === 'all' && <Check size={12} />}
              </button>

              <button
                type="button"
                onClick={() => handlePagePresetChange('problems_only')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  pageRangePreset === 'problems_only'
                    ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                    : 'bg-slate-800/70 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="정답/해설지를 제외하고 문제 페이지만 인쇄"
              >
                <span>문제만 ({questionPages.length}쪽)</span>
                {pageRangePreset === 'problems_only' && <Check size={12} />}
              </button>

              <button
                type="button"
                onClick={() => handlePagePresetChange('odd')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  pageRangePreset === 'odd'
                    ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                    : 'bg-slate-800/70 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="수동 양면 인쇄용 홀수 페이지만"
              >
                <span>홀수 쪽 (1, 3, 5...)</span>
                {pageRangePreset === 'odd' && <Check size={12} />}
              </button>

              <button
                type="button"
                onClick={() => handlePagePresetChange('even')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  pageRangePreset === 'even'
                    ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                    : 'bg-slate-800/70 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="수동 양면 인쇄용 짝수 페이지만"
              >
                <span>짝수 쪽 (2, 4, 6...)</span>
                {pageRangePreset === 'even' && <Check size={12} />}
              </button>
            </div>

            {/* 페이지 직접 입력창 */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10.5px] text-slate-400 font-bold">
                <span>페이지 직접 지정:</span>
                <span className="text-[10px] text-slate-500">예: 1-3, 5</span>
              </div>
              <input
                type="text"
                value={customPageInput}
                onChange={e => {
                  setCustomPageInput(e.target.value);
                  setPageRangePreset('custom');
                }}
                placeholder={`1-${totalPages}`}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <p className="text-[10px] text-slate-400/80 pt-0.5">
                💡 우측 A4 미리보기 상단 배지를 직접 클릭해 켜고 끌 수도 있습니다.
              </p>
            </div>
          </div>

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

          {/* 2. 단(Column) 배치 */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Columns size={12} className="text-violet-400" />
                <span>단 배치</span>
              </span>
              <span className="text-[10px] text-slate-400">{columns === 2 ? '2단 분할' : '1단 전면'}</span>
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

          {/* 3. 인쇄 여백 설정 (초밀착 5mm★ / 좁게 8mm / 보통 12mm / 직접 설정) */}
          <div className="space-y-2 p-3 bg-slate-800/60 rounded-xl border border-slate-700/80">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-200 flex items-center gap-1.5">
                <FileText size={13} className="text-violet-400" />
                <span>인쇄 여백 (상하/좌우)</span>
              </label>
              <span className="text-[10px] text-violet-300 font-mono font-bold bg-violet-950/60 px-2 py-0.5 rounded-md border border-violet-700/40">
                {resolvedMargins.compactLabel}
              </span>
            </div>

            {/* 4단계 프리셋 버튼 그리드 */}
            <div className="grid grid-cols-4 gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => handleMarginPresetChange('ultracompact')}
                className={`py-1.5 px-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  marginPreset === 'ultracompact'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="여백 5mm: 문제와 글씨 크기 극대화 (추천★)"
              >
                <span className="leading-none">초밀착</span>
                <span className="text-[9px] opacity-80 leading-none">5mm★</span>
              </button>
              <button
                type="button"
                onClick={() => handleMarginPresetChange('compact')}
                className={`py-1.5 px-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  marginPreset === 'compact'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="여백 8mm: 컴팩트 고밀도형"
              >
                <span className="leading-none">좁게</span>
                <span className="text-[9px] opacity-80 leading-none">8mm</span>
              </button>
              <button
                type="button"
                onClick={() => handleMarginPresetChange('normal')}
                className={`py-1.5 px-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  marginPreset === 'normal'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="여백 12mm: 표준 시험지 여백"
              >
                <span className="leading-none">보통</span>
                <span className="text-[9px] opacity-80 leading-none">12mm</span>
              </button>
              <button
                type="button"
                onClick={() => handleMarginPresetChange('custom')}
                className={`py-1.5 px-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  marginPreset === 'custom'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="사용자 맞춤 직접 설정"
              >
                <span className="leading-none">직접</span>
                <span className="text-[9px] opacity-80 leading-none">설정</span>
              </button>
            </div>

            {/* 직접 설정 선택 시 세부 슬라이더/인풋 아코디언 */}
            {marginPreset === 'custom' && (
              <div className="space-y-2.5 pt-2 pb-1 border-t border-slate-700/60 animate-in fade-in duration-150">
                {/* 좌우 여백 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                    <span>좌우 여백 (너비 확대)</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCustomMarginLRChange(customMarginLR - 1)}
                        disabled={customMarginLR <= 3}
                        className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-violet-300 w-8 text-center">{customMarginLR}mm</span>
                      <button
                        type="button"
                        onClick={() => handleCustomMarginLRChange(customMarginLR + 1)}
                        disabled={customMarginLR >= 25}
                        className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={25}
                    value={customMarginLR}
                    onChange={(e) => handleCustomMarginLRChange(Number(e.target.value))}
                    className="w-full accent-violet-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 상하 여백 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                    <span>상하 여백 (높이 확대)</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCustomMarginTBChange(customMarginTB - 1)}
                        disabled={customMarginTB <= 3}
                        className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-violet-300 w-8 text-center">{customMarginTB}mm</span>
                      <button
                        type="button"
                        onClick={() => handleCustomMarginTBChange(customMarginTB + 1)}
                        disabled={customMarginTB >= 25}
                        className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={25}
                    value={customMarginTB}
                    onChange={(e) => handleCustomMarginTBChange(Number(e.target.value))}
                    className="w-full accent-violet-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 5mm 미만 주의 경고 */}
                {(customMarginTB < 5 || customMarginLR < 5) && (
                  <div className="flex items-center gap-1 text-[9px] text-amber-300 bg-amber-950/40 p-1.5 rounded-lg border border-amber-800/40">
                    <AlertTriangle size={11} className="shrink-0" />
                    <span>5mm 미만은 일부 프린터에서 가장자리가 잘릴 수 있습니다.</span>
                  </div>
                )}
              </div>
            )}

            {/* 2단 및 제본 스마트 부가 옵션 */}
            <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
              {columns === 2 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-300">2단 가운데 간격</span>
                  <div className="inline-flex rounded-md bg-slate-900 p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleToggleColumnGapSize('slim')}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer ${
                        columnGapSize === 'slim' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="단 사이를 좁혀 문제 가로폭 추가 확보"
                    >
                      슬림 (추천★)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleColumnGapSize('normal')}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer ${
                        columnGapSize === 'normal' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      보통
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between text-[10px] cursor-pointer pt-0.5">
                <span className="font-bold text-slate-300">제본 여백 (+3mm 보정)</span>
                <input
                  type="checkbox"
                  checked={enableBindingGutter}
                  onChange={(e) => handleToggleBindingGutter(e.target.checked)}
                  className="accent-violet-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* 2-1. 2단 배열 순서 (세로 N자형 vs 가로 Z자형) */}
          {columns === 2 && (
            <div className="space-y-1.5 p-3 bg-slate-800/50 rounded-xl border border-slate-700/80 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-slate-300 flex items-center gap-1">
                  <ArrowUpDown size={12} className="text-violet-400" />
                  <span>2단 문항 배열 순서</span>
                </label>
                <span className="text-[10px] text-violet-300 font-bold">
                  {columnFlowDirection === 'vertical' ? 'N자형 (표준★)' : 'Z자형'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => handleToggleFlowDirection('vertical')}
                  className={`py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    columnFlowDirection === 'vertical'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="왼쪽 단을 위에서 아래로 먼저 채우고, 오른쪽 단으로 이동 (한국 시험지 표준)"
                >
                  세로 우선 (N자★)
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFlowDirection('horizontal')}
                  className={`py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    columnFlowDirection === 'horizontal'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="좌우 좌우 순서로 배치"
                >
                  가로 우선 (Z자)
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {columnFlowDirection === 'vertical'
                  ? '✓ 왼쪽 단(위→아래)을 모두 푼 뒤 오른쪽 단으로 넘어갑니다.'
                  : '✓ 1번(좌상) 2번(우상) 3번(좌하) 4번(우하) 순으로 배치됩니다.'}
              </p>
            </div>
          )}

          {/* 2-2. 📖 양면 인쇄 넘김 방향 (긴 가장자리 책넘김 vs 짧은 가장자리 위로넘김) */}
          <div className="space-y-2 p-3 bg-slate-800/60 rounded-xl border border-slate-700/80 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-300 flex items-center gap-1.5">
                <BookOpen size={13} className="text-violet-400" />
                <span>양면 인쇄 넘김 방향</span>
              </label>
              <span className="text-[10px] text-violet-300 font-extrabold px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30">
                {duplexBinding === 'long' ? '책 넘김 (표준★)' : '위로 넘김'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => handleDuplexBindingChange('long')}
                className={`py-2 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  duplexBinding === 'long'
                    ? 'bg-violet-600 text-white shadow-xs font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="책 넘기듯이 옆으로 넘겨 읽는 시험지 표준 방식 (뒷면 180° 자동 보정)"
              >
                <BookOpen size={12} />
                <span>긴 가장자리★</span>
              </button>
              <button
                type="button"
                onClick={() => handleDuplexBindingChange('short')}
                className={`py-2 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  duplexBinding === 'short'
                    ? 'bg-violet-600 text-white shadow-xs font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="달력이나 메모패드처럼 아래를 잡고 위로 넘기는 방식 (회전 없음)"
              >
                <FileText size={12} />
                <span>짧은 가장자리</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-400 leading-tight">
              {duplexBinding === 'long'
                ? '✓ 책처럼 옆으로 넘겨 읽도록 뒷면(짝수 쪽)을 180° 자동 회전하여 인쇄합니다.'
                : '✓ 달력처럼 아래를 잡고 위로 넘겨 읽도록 회전 없이 그대로 인쇄합니다.'}
            </p>

            {/* 긴 가장자리 모드일 때 화면 미리보기 회전 확인 토글 */}
            {duplexBinding === 'long' && (
              <div className="pt-1.5 border-t border-slate-700/60 flex items-center justify-between">
                <label className="text-[10px] text-slate-300 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={previewRotateEven}
                    onChange={e => setPreviewRotateEven(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-violet-600 accent-violet-600 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                  <span>미리보기 화면에서도 뒷면 회전 보기</span>
                </label>
                <span className="text-[9px] text-slate-500 font-medium">
                  {previewRotateEven ? '회전 표시 중' : '정방향 표시 중'}
                </span>
              </div>
            )}
          </div>

          {/* 🌟 2-3. 제목 크기 & 헤더 레이아웃 (공간 최적화) */}
          <div className="space-y-3 p-3.5 bg-slate-800/60 rounded-2xl border border-slate-700/80 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-200 flex items-center gap-1.5">
                <Sliders size={13} className="text-violet-400" />
                <span>제목 크기 & 헤더 레이아웃</span>
              </label>
              <span className="text-[10px] text-violet-300 font-extrabold px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30">
                {titleFontSize === 'small' ? '작게' : titleFontSize === 'large' ? '크게' : '보통'} • {headerDensity === 'compact' ? '슬림' : '표준'}
              </span>
            </div>

            {/* A. 제목 글자 크기 3단계 세그먼트 버튼 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>제목 크기</span>
                <span className="text-[9px] text-slate-500">{titleFontSize === 'small' ? '16px (공간 절약)' : titleFontSize === 'large' ? '24px (강조)' : '20px (표준)'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700">
                {(['small', 'medium', 'large'] as TitleFontSizeType[]).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleTitleFontSizeChange(size)}
                    className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      titleFontSize === size
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {size === 'small' ? '작게' : size === 'medium' ? '보통' : '크게'}
                  </button>
                ))}
              </div>
            </div>

            {/* B. 헤더 상하 밀도 (슬림형 vs 표준형) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>헤더 밀도 (상하 여백)</span>
                <span className="text-[9px] text-slate-500">{headerDensity === 'compact' ? '문제 공간 최대 확보' : '표준 여백'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => handleHeaderDensityChange('compact')}
                  className={`py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    headerDensity === 'compact'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="헤더 여백과 수험표 높이를 줄여 1페이지 문제 배치 공간을 최대로 확보합니다."
                >
                  <span>슬림형 (공간절약)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleHeaderDensityChange('normal')}
                  className={`py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    headerDensity === 'normal'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="클래식한 시험지 표준 여백"
                >
                  <span>표준형</span>
                </button>
              </div>
            </div>

            {/* C. 수험표 학생 성명 및 반 자동 기재 설정 */}
            <div className="pt-2 border-t border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-300">수험자 성명 자동 기재</span>
                <button
                  type="button"
                  onClick={() => handleToggleStudentName(!showStudentName)}
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    showStudentName ? 'bg-violet-600' : 'bg-slate-700'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition duration-200 ${
                    showStudentName ? 'translate-x-3' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {showStudentName && (
                <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-150">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400">성명</span>
                    <input
                      type="text"
                      value={customStudentName}
                      onChange={e => setCustomStudentName(e.target.value)}
                      placeholder="성명 (예: 김민우)"
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-lg text-xs text-white focus:outline-hidden font-bold"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400">반 / 학년</span>
                    <input
                      type="text"
                      value={customClassName}
                      onChange={e => setCustomClassName(e.target.value)}
                      placeholder="반 (예: 고2 A반)"
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-lg text-xs text-white focus:outline-hidden font-bold"
                    />
                  </div>
                </div>
              )}
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
                  checked={showFolderInfo}
                  onChange={e => handleToggleShowFolderInfo(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <span>문항 출처(폴더 정보) 표시</span>
                  <span className="text-[10px] text-violet-400 font-bold bg-violet-500/10 px-1 rounded">예: [5.1]</span>
                </span>
              </label>

              {columns === 2 && (
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCenterDivider}
                    onChange={e => handleToggleCenterDivider(e.target.checked)}
                    className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                  />
                  <span>2단 가운데 기준선 (중앙 구분선) 표시</span>
                </label>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAnswerKey}
                    onChange={e => handleToggleAnswerKey(e.target.checked)}
                    className="w-4 h-4 rounded-sm text-violet-600 accent-violet-600 bg-slate-800 border-slate-700 cursor-pointer"
                  />
                  <span>마지막 장 빠른 정답표(Answer Key) 첨부</span>
                </label>

                {/* 빠른 정답표 활성화 시 노출되는 전용 세부 설정 */}
                {includeAnswerKey && (
                  <div className="ml-6 p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* 1. 정답표 단 배치 (1단 vs 2단) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <Columns size={12} className="text-violet-400" />
                          <span>정답표 단 배치</span>
                        </label>
                        <span className="text-[10px] text-violet-300 font-bold">
                          {answerKeyColumns === 2 ? '용지 50% 절약 모드' : '상세 모드'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700">
                        <button
                          type="button"
                          onClick={() => handleAnswerKeyColumnsChange(1)}
                          className={`py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            answerKeyColumns === 1
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          1단 (상세형)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswerKeyColumnsChange(2)}
                          className={`py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            answerKeyColumns === 2
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          2단 (컴팩트★)
                        </button>
                      </div>
                    </div>

                    {/* 2. 문항 유형(단답/서술) 표기 토글 */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer">
                          <span>문항 유형(단답/서술) 표기</span>
                        </label>
                        <p className="text-[9px] text-slate-400">
                          OFF 시 정답란이 넓어져 채점이 편합니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleAnswerKeyType(!showAnswerKeyType)}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          showAnswerKeyType ? 'bg-violet-600' : 'bg-slate-700'
                        }`}
                        title={showAnswerKeyType ? '유형 표기 끄기 (OFF)' : '유형 표기 켜기 (ON)'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            showAnswerKeyType ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* 3. 정답표 배점(1.0점) 표기 토글 */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer">
                          <span>정답표 배점(1.0점) 표기</span>
                        </label>
                        <p className="text-[9px] text-slate-400">
                          OFF 시 [번호 | 정답]으로 정답란 폭이 극대화됩니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleAnswerKeyPoints(!showAnswerKeyPoints)}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          showAnswerKeyPoints ? 'bg-violet-600' : 'bg-slate-700'
                        }`}
                        title={showAnswerKeyPoints ? '배점 표기 끄기 (OFF)' : '배점 표기 켜기 (ON)'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            showAnswerKeyPoints ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* 3. 쪽당 정답 출력 수 직접 조절 */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <Sliders size={12} className="text-violet-400" />
                          <span>쪽당 정답 출력 수</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleResetAnswersPerPage}
                          className="text-[10px] text-slate-400 hover:text-violet-300 underline cursor-pointer"
                          title="추천 기본값으로 복원"
                        >
                          기본값 ({answerKeyColumns === 1 ? '22개' : '44개'})
                        </button>
                      </div>

                      <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-slate-700">
                        <button
                          type="button"
                          onClick={() => handleAnswersPerPageChange(answerKeyColumns === 1 ? -2 : -4)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-sm transition-colors cursor-pointer"
                          title="문항 수 줄이기 (여유 확보)"
                        >
                          -
                        </button>
                        <div className="flex-1 text-center font-mono font-bold text-xs text-white">
                          <span>{answerKeyColumns === 1 ? answersPerPage1Col : answersPerPage2Col}</span>
                          <span className="text-[10px] text-slate-400 font-normal ml-1">문항 / 쪽</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAnswersPerPageChange(answerKeyColumns === 1 ? 2 : 4)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-sm transition-colors cursor-pointer"
                          title="문항 수 늘리기 (페이지 압축)"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-violet-300/90 font-medium">
                        <span>현재 정답표: <strong>총 {answerPages.length}장</strong></span>
                        {answerPages.some(p => p.isWarningOverflow) && (
                          <span className="text-amber-400 font-bold flex items-center gap-1" title="A4 한 페이지 높이를 넘칠 수 있으니 문항 수를 줄여보세요">
                            <AlertTriangle size={11} />
                            <span>A4 초과 주의</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 4. 🎨 정답 폰트 및 글자 크기/굵기 스타일 조절 */}
                    <div className="space-y-2 pt-2 border-t border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <Type size={12} className="text-violet-400" />
                          <span>정답 글꼴(폰트)</span>
                        </label>
                        <span className="text-[10px] text-violet-300 font-bold">
                          {answerFontFamily === 'math' ? 'π 왜곡방지 (추천★)' : answerFontFamily === 'sans' ? '깔끔 고딕' : '교과서 명조'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700 text-[10px]">
                        <button
                          type="button"
                          onClick={() => handleAnswerFontFamilyChange('math')}
                          className={`py-1 rounded-md font-bold transition-all cursor-pointer ${
                            answerFontFamily === 'math'
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          수학 표준★
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswerFontFamilyChange('sans')}
                          className={`py-1 rounded-md font-bold transition-all cursor-pointer ${
                            answerFontFamily === 'sans'
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          깔끔 고딕
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswerFontFamilyChange('serif')}
                          className={`py-1 rounded-md font-bold transition-all cursor-pointer ${
                            answerFontFamily === 'serif'
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          교과서 명조
                        </button>
                      </div>

                      {/* 글자 크기 & 굵기 그리드 */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold">글자 크기</span>
                          <div className="grid grid-cols-3 gap-0.5 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                            {(['small', 'medium', 'large'] as AnswerFontSizeType[]).map(sz => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => handleAnswerFontSizeChange(sz)}
                                className={`py-1 rounded font-bold transition-all cursor-pointer ${
                                  answerFontSize === sz
                                    ? 'bg-violet-600 text-white shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {sz === 'small' ? '작게' : sz === 'medium' ? '보통' : '크게'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold">글자 굵기</span>
                          <div className="grid grid-cols-3 gap-0.5 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                            {(['medium', 'bold', 'black'] as AnswerFontWeightType[]).map(wt => (
                              <button
                                key={wt}
                                type="button"
                                onClick={() => handleAnswerFontWeightChange(wt)}
                                className={`py-1 rounded font-bold transition-all cursor-pointer ${
                                  answerFontWeight === wt
                                    ? 'bg-violet-600 text-white shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {wt === 'medium' ? '보통' : wt === 'bold' ? '굵게' : '진함'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 5. 💡 단위 및 각도 기호 자동 보정 토글 */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer">
                          <span>수식 단위 & 각도 보정 (cm³, °)</span>
                        </label>
                        <p className="text-[9px] text-slate-400">
                          cm3➔cm³, 1800∘➔1800° (합성함수 f∘g 보호)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleSmartMath(!smartMathFormatting)}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          smartMathFormatting ? 'bg-violet-600' : 'bg-slate-700'
                        }`}
                        title={smartMathFormatting ? '단위 변환 끄기 (OFF)' : '단위 변환 켜기 (ON)'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            smartMathFormatting ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-violet-950/40 border border-violet-800/40 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-violet-300 text-xs font-bold">
              <Sparkles size={13} />
              <span>인쇄 & PDF 저장 안내</span>
            </div>
            <p className="text-[11px] text-violet-300/80 leading-normal">
              • 인쇄 창에서 <strong>[대상: PDF로 저장]</strong>을 선택하시면 깨짐 없는 고화질 벡터 PDF로 바로 저장됩니다.
            </p>
            <p className="text-[11px] text-violet-300/80 leading-normal">
              • <strong>양면 인쇄(책넘김)</strong> 시 프린터가 상하 반전으로 인쇄하더라도, 뒷면이 자동 180° 보정되어 책처럼 편하게 넘겨 읽을 수 있습니다.
            </p>
          </div>
        </aside>

        {/* 우측 메인 영역: A4 실시간 미리보기 스크롤 뷰어 */}
        <main className="eduest-print-main-viewport flex-1 bg-slate-950 overflow-auto p-8 flex flex-col items-center">
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
              const isEvenPage = pageNumber % 2 === 0;
              const shouldRotate = duplexBinding === 'long' && isEvenPage;
              const isPageIncluded = effectiveSelectedPages.has(pageNumber);

              return (
                <div
                  key={pageIdx}
                  data-page-number={pageNumber}
                  className={`a4-print-sheet bg-white text-slate-900 shadow-2xl relative flex flex-col justify-between transition-all duration-200 ${
                    shouldRotate ? 'even-page-rotate' : ''
                  } ${
                    shouldRotate && previewRotateEven ? 'rotate-180' : ''
                  } ${
                    !isPageIncluded ? 'opacity-40 ring-4 ring-rose-500/50 grayscale-30' : ''
                  }`}
                  style={{
                    width: '210mm',
                    minHeight: '297mm',
                    boxSizing: 'border-box',
                    padding: resolvedMargins.cssPadding,
                  }}
                >
                  {/* 🌟 인쇄 대상 포함/제외 토글 뱃지 (화면 전용 no-print) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePage(pageNumber);
                    }}
                    className={`no-print absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full text-[11px] font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                      isPageIncluded
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30 ring-2 ring-white/80'
                        : 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/30'
                    }`}
                    title={isPageIncluded ? '클릭 시 이 페이지를 인쇄 대상에서 제외합니다' : '클릭 시 이 페이지를 인쇄 대상에 포함합니다'}
                  >
                    {isPageIncluded ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                    <span>{pageNumber}쪽 {isPageIncluded ? '인쇄 포함' : '인쇄 제외'}</span>
                  </button>

                  {/* 짝수 페이지(뒷면) 긴 가장자리 보정 표시 뱃지 (화면 전용 no-print) */}
                  {shouldRotate && (
                    <div className="no-print absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-violet-600/90 text-white text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs select-none">
                      <BookOpen size={11} />
                      <span>뒷면 (책넘김 180° 보정 인쇄)</span>
                    </div>
                  )}

                  {/* 상단 헤더 영역 */}
                  <div className={`shrink-0 ${headerDensity === 'compact' ? 'mb-2' : 'mb-4'}`}>
                    {isFirstPage ? (
                      /* 1페이지 메인 헤더: 학원 시험지 전통 스타일 상단 박스 */
                      <div className={`border-b-2 border-slate-900 ${headerDensity === 'compact' ? 'pb-2' : 'pb-3'}`}>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 pr-3">
                            
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

                            {/* 🏷️ 소형 회차 아이브로우 뱃지 (제목 상단 분리) */}
                            {(() => {
                              const parsed = parseExamRoundAndBaseTitle(exam.title);
                              const isTreasure = Boolean(exam.is_treasure_hunt || parsed.isTreasure);
                              const roundNum = exam.wrong_round || parsed.currentRound;
                              const isTwinVariant =
                                exam.is_twin_variant !== undefined
                                  ? Boolean(exam.is_twin_variant)
                                  : (Array.isArray(exam.questions) && exam.questions.some((q: any) => q.is_twin)) ||
                                    (/^\[[^\]]*쌍둥이/i.test(exam.title) && parsed.isTwin);

                              if (!(isTreasure || exam.is_wrong_review || roundNum > 0)) return null;

                              return (
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {isTreasure ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                                      <Sparkles size={11} className="fill-amber-600 text-amber-600" />
                                      <span>보물회수 {roundNum > 0 ? `${roundNum}회차` : ''}</span>
                                      <span className="opacity-80 font-bold">• {isTwinVariant ? '쌍둥이(변형)' : '원본'}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-950 border border-rose-300">
                                      <RotateCcw size={10} />
                                      <span>오답 {roundNum > 0 ? `${roundNum}회차` : '클리닉'}</span>
                                      <span className="opacity-80 font-bold">• {isTwinVariant ? '쌍둥이(변형)' : '원본'}</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 시험지 메인 타이틀 (크기 옵션 연동 & 순수 타이틀 출력) */}
                            <h1 className={`font-black text-slate-900 tracking-tight ${
                              titleFontSize === 'small'
                                ? 'text-base leading-snug'
                                : titleFontSize === 'large'
                                ? 'text-2xl leading-tight'
                                : 'text-xl leading-snug'
                            }`}>
                              {(() => {
                                const parsed = parseExamRoundAndBaseTitle(exam.title);
                                return parseExamRoundAndBaseTitle(exam.base_exam_title || exam.title).cleanBaseTitle;
                              })()}
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

                          {/* 수험자 기재란 박스 (반 / 성명 자동 기재 & 슬림 밀도 연동, 초밀착 모드 시 프린터 하드웨어 롤러 마진에 의한 우측 세로 테두리 잘림 방지 2.5mm 보정) */}
                          {showHeaderInfo && (
                            <div
                              style={{
                                marginRight: resolvedMargins.isUltra ? '2.5mm' : resolvedMargins.isCompact ? '1mm' : undefined,
                              }}
                              className="border border-slate-900 rounded-md overflow-hidden text-xs shrink-0 self-start transition-all"
                            >
                              <table className="border-collapse text-center">
                                <tbody>
                                  <tr className="border-b border-slate-300 bg-slate-50">
                                    <th className={`px-2.5 ${headerDensity === 'compact' ? 'py-0.5 text-[10px]' : 'py-1 text-xs'} font-bold text-slate-700 border-r border-slate-300`}>반</th>
                                    <th className={`px-3.5 ${headerDensity === 'compact' ? 'py-0.5 text-[10px]' : 'py-1 text-xs'} font-bold text-slate-700 border-r border-slate-300`}>성 명</th>
                                    <th className={`px-2.5 ${headerDensity === 'compact' ? 'py-0.5 text-[10px]' : 'py-1 text-xs'} font-bold text-slate-700`}>점 수</th>
                                  </tr>
                                  <tr>
                                    <td
                                      data-field="class-name"
                                      className={`${headerDensity === 'compact' ? 'h-6.5 text-[11px]' : 'h-8 text-xs'} border-r border-slate-300 w-16 font-bold text-slate-800`}
                                    >
                                      {showClassName ? customClassName : ''}
                                    </td>
                                    <td
                                      data-field="student-name"
                                      className={`${headerDensity === 'compact' ? 'h-6.5 text-[11px]' : 'h-8 text-xs'} border-r border-slate-300 w-24 font-black text-slate-950`}
                                    >
                                      {showStudentName ? customStudentName : ''}
                                    </td>
                                    <td className={`${headerDensity === 'compact' ? 'h-6.5 text-[9px]' : 'h-8 text-[10px]'} w-16 text-slate-400 font-mono align-bottom pb-1`}>
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
                        <span>
                          {(() => {
                            const parsed = parseExamRoundAndBaseTitle(exam.title);
                            return parseExamRoundAndBaseTitle(exam.base_exam_title || exam.title).cleanBaseTitle;
                          })()} ({exam.grade})
                        </span>
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

                  {/* 본문 문항 레이아웃 (1단 or 2단 - 세로 N자형 / 가로 Z자형 & 가운데 기준선 지원) */}
                  {(() => {
                    const renderQuestionCard = (q: ExamQuestion, globalQuestionNumber: number) => {
                      const points = q.points || (q.is_descriptive ? 5 : 4);
                      const formattedFolder = q.folder_name
                        ? (q.folder_name.startsWith('[') ? q.folder_name : `[${q.folder_name}]`)
                        : '';

                      return (
                        <div
                          key={q.id}
                          className="print-avoid-break flex flex-col justify-start relative p-2 rounded-lg border border-transparent hover:border-slate-200 transition-colors"
                        >
                          {/* 문항 번호 및 출처(폴더) & 배점 헤더 */}
                          <div className="flex items-baseline gap-1.5 mb-1.5 shrink-0 flex-wrap">
                            <span className="text-sm font-black text-slate-900">
                              {globalQuestionNumber}.
                            </span>
                            {showFolderInfo && formattedFolder && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 print:border-slate-300 print:bg-slate-100 print:text-slate-600">
                                {formattedFolder}
                              </span>
                            )}
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
                                    ? (resolvedMargins.isUltra ? 'max-h-[160mm]' : 'max-h-[140mm]')
                                    : questionsPerPage === 2
                                    ? (resolvedMargins.isUltra ? 'max-h-[120mm]' : 'max-h-[105mm]')
                                    : questionsPerPage === 4
                                    ? (resolvedMargins.isUltra ? 'max-h-[96mm]' : resolvedMargins.isCompact ? 'max-h-[90mm]' : 'max-h-[85mm]')
                                    : (resolvedMargins.isUltra ? 'max-h-[68mm]' : 'max-h-[60mm]')
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
                    };

                    if (columns === 1) {
                      return (
                        <div
                          className={`flex-1 ${
                            questionsPerPage === 1
                              ? 'flex flex-col justify-start gap-4'
                              : 'grid grid-cols-1 grid-rows-2 gap-y-6'
                          }`}
                        >
                          {pageQuestions.map((q, qSubIdx) =>
                            renderQuestionCard(q, pageIdx * questionsPerPage + qSubIdx + 1)
                          )}
                        </div>
                      );
                    }

                    // 2단 레이아웃 분할
                    let leftItems: { q: ExamQuestion; num: number }[] = [];
                    let rightItems: { q: ExamQuestion; num: number }[] = [];

                    if (columnFlowDirection === 'vertical') {
                      // 🌟 세로 우선 (N자형 한국 시험지 표준: 좌단 위→아래 먼저, 그 다음 우단 위→아래)
                      const mid = Math.ceil(pageQuestions.length / 2);
                      leftItems = pageQuestions.slice(0, mid).map((q, idx) => ({
                        q,
                        num: pageIdx * questionsPerPage + idx + 1,
                      }));
                      rightItems = pageQuestions.slice(mid).map((q, idx) => ({
                        q,
                        num: pageIdx * questionsPerPage + mid + idx + 1,
                      }));
                    } else {
                      // 가로 우선 (Z자형)
                      pageQuestions.forEach((q, idx) => {
                        const num = pageIdx * questionsPerPage + idx + 1;
                        if (idx % 2 === 0) {
                          leftItems.push({ q, num });
                        } else {
                          rightItems.push({ q, num });
                        }
                      });
                    }

                    const rowCount = questionsPerPage === 6 ? 3 : (questionsPerPage === 4 ? 2 : 1);
                    const rowGridClass = rowCount === 3
                      ? 'grid-rows-3 gap-y-4'
                      : (rowCount === 2 ? 'grid-rows-2 gap-y-5' : 'grid-rows-1 gap-y-6');

                    return (
                      <div className="flex-1 flex relative">
                        {/* 좌측 단 */}
                        <div
                          className={`flex-1 grid ${rowGridClass} ${
                            showCenterDivider
                              ? (columnGapSize === 'slim' ? 'pr-2 border-r border-slate-300 print:border-slate-400' : 'pr-4 border-r border-slate-300 print:border-slate-400')
                              : (columnGapSize === 'slim' ? 'pr-1.5' : 'pr-3')
                          }`}
                        >
                          {leftItems.map(({ q, num }) => renderQuestionCard(q, num))}
                        </div>

                        {/* 우측 단 */}
                        <div
                          className={`flex-1 grid ${rowGridClass} ${
                            showCenterDivider
                              ? (columnGapSize === 'slim' ? 'pl-2' : 'pl-4')
                              : (columnGapSize === 'slim' ? 'pl-1.5' : 'pl-3')
                          }`}
                        >
                          {rightItems.map(({ q, num }) => renderQuestionCard(q, num))}
                        </div>
                      </div>
                    );
                  })()}

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

            {/* 빠른 정답표 부록 페이지 (옵션 활성화 시 맨 뒤에 A4 페이지별로 동적 분할 출력) */}
            {includeAnswerKey &&
              answerPages.map((ansPage, ansPageIdx) => {
                const currentGlobalPage = questionPages.length + ansPageIdx + 1;
                const isEvenPage = currentGlobalPage % 2 === 0;
                const shouldRotate = duplexBinding === 'long' && isEvenPage;
                const isPageIncluded = effectiveSelectedPages.has(currentGlobalPage);

                return (
                  <div
                    key={`ans-page-${ansPageIdx}`}
                    data-page-number={currentGlobalPage}
                    className={`a4-print-sheet bg-white text-slate-900 shadow-2xl relative flex flex-col justify-between transition-all duration-200 ${
                      shouldRotate ? 'even-page-rotate' : ''
                    } ${
                      shouldRotate && previewRotateEven ? 'rotate-180' : ''
                    } ${
                      !isPageIncluded ? 'opacity-40 ring-4 ring-rose-500/50 grayscale-30' : ''
                    }`}
                    style={{
                      width: '210mm',
                      minHeight: '297mm',
                      boxSizing: 'border-box',
                      padding: resolvedMargins.cssPadding,
                    }}
                  >
                    {/* 🌟 인쇄 대상 포함/제외 토글 뱃지 (화면 전용 no-print) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePage(currentGlobalPage);
                      }}
                      className={`no-print absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full text-[11px] font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                        isPageIncluded
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30 ring-2 ring-white/80'
                          : 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/30'
                      }`}
                      title={isPageIncluded ? '클릭 시 이 페이지를 인쇄 대상에서 제외합니다' : '클릭 시 이 페이지를 인쇄 대상에 포함합니다'}
                    >
                      {isPageIncluded ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                      <span>{currentGlobalPage}쪽 (정답표) {isPageIncluded ? '인쇄 포함' : '인쇄 제외'}</span>
                    </button>

                    {/* 짝수 페이지(뒷면) 긴 가장자리 보정 표시 뱃지 (화면 전용 no-print) */}
                    {shouldRotate && (
                      <div className="no-print absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-violet-600/90 text-white text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs select-none">
                        <BookOpen size={11} />
                        <span>뒷면 (책넘김 180° 보정 인쇄)</span>
                      </div>
                    )}

                    <div>
                      {/* 정답표 상단 헤더 영역 */}
                      {ansPage.isFirstPage ? (
                        /* 1페이지 메인 헤더 */
                        <div className="border-b-2 border-slate-900 pb-3 mb-4">
                          <div className="text-[11px] font-bold text-slate-500 tracking-wider">
                            {showAcademyName && academyName ? `${academyName} • ` : ''}정답 및 배점표
                          </div>
                          <div className="flex items-baseline justify-between">
                            <h1 className="text-xl font-black text-slate-900">
                              {exam.title} - 빠른 정답표
                            </h1>
                            {answerPages.length > 1 && (
                              <span className="text-xs font-bold text-violet-700 font-mono">
                                (1 / {answerPages.length} 쪽)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            총 {exam.questions.length}문항 • 각 문항별 정답 및 소문항 기준 답안입니다.
                          </p>
                        </div>
                      ) : (
                        /* 2페이지 이후 간이 연속 헤더 */
                        <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between text-xs font-bold text-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-900 font-black">
                              {exam.title} - 빠른 정답표 (계속)
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({showAcademyName && academyName ? academyName : selectedChip || 'Eduest'})
                            </span>
                          </div>
                          <span className="text-violet-700 font-black font-mono">
                            ({ansPageIdx + 1} / {answerPages.length} 쪽)
                          </span>
                        </div>
                      )}

                      {/* 본문 테이블 렌더링 (1단 or 2단 그리드) */}
                      {answerKeyColumns === 1 ? (
                        /* 1단 모드 */
                        ansPage.questions1Col && renderAnswerTable(ansPage.questions1Col, false)
                      ) : (
                        /* 2단 컴팩트 모드 */
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            {ansPage.leftQuestions && renderAnswerTable(ansPage.leftQuestions, true)}
                          </div>
                          <div className="space-y-2">
                            {ansPage.rightQuestions && renderAnswerTable(ansPage.rightQuestions, true)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 정답표 하단 푸터 */}
                    <div className="shrink-0 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span>{showAcademyName && academyName ? academyName : ''}</span>
                      <span className="font-mono font-bold text-slate-600">
                        - {currentGlobalPage} / {totalPages} (정답표 {ansPageIdx + 1}/{answerPages.length}) -
                      </span>
                      <span>Eduest Examination</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </main>
      </div>
    </div>
  );
}
