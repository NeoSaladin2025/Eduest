'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileCheck, 
  Plus, 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  ArrowLeft, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  CheckSquare, 
  Square, 
  Users, 
  Clock, 
  Calendar, 
  Eye, 
  Sparkles, 
  Loader2, 
  Check, 
  AlertCircle, 
  Search,
  ExternalLink,
  Edit2,
  Layers,
  ArrowRight,
  ArrowUpDown,
  ShieldAlert,
  RotateCcw,
  RotateCw,
  BookOpen,
  Filter,
  Lock,
  Unlock,
  Camera,
  Printer
} from 'lucide-react';
import { ExamPaper, ExamQuestion, ExamSubQuestion, StudentOverrideConfig } from '@/app/api/test2/exam/route';
import { supabase } from '@/lib/supabase';
import { TestCategory, TestBankItem } from '@/app/api/test2/bank/route';
import { TwinStoreData, TwinQuestionItem } from '@/lib/twinTypes';
import ExamBundleTab from './ExamBundleTab';
import RealtimeProctorTab from './RealtimeProctorTab';
import DescriptiveGradingModal from './DescriptiveGradingModal';
import QuestionDiffModal from './QuestionDiffModal';
import ExamPrintModal from './ExamPrintModal';

interface Student {
  id: string;
  name: string;
  grade: string;
}

const GRADES = ['ALL', '중1', '중2', '중3', '고1', '고2', '고3'];

// 자연어 및 소수점/숫자 스마트 정렬 헬퍼 (5.1 vs 5.2 vs 5.10 완벽 지원)
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// 폴더명에서 회차 번호 추출 (예: "10차", "1차", "3차(공수2A 중간대비)" -> 10, 1, 3)
export function parseRoundNumber(folderName?: string | null): number {
  if (!folderName) return 999999;
  const chaMatch = folderName.match(/(\d+)\s*차/);
  if (chaMatch) return parseInt(chaMatch[1], 10);
  const hoeMatch = folderName.match(/(\d+)\s*회/);
  if (hoeMatch) return parseInt(hoeMatch[1], 10);
  const jeMatch = folderName.match(/제\s*(\d+)/);
  if (jeMatch) return parseInt(jeMatch[1], 10);
  const generalMatch = folderName.match(/\d+/);
  if (generalMatch) return parseInt(generalMatch[0], 10);
  return 999999;
}

// 문항 번호 추출 (예: "0001.html" -> 1)
export function parseQuestionNumber(file: { question_number?: number | null; name: string }): number {
  if (typeof file.question_number === 'number' && !isNaN(file.question_number)) {
    return file.question_number;
  }
  const clean = file.name.replace(/\.[^/.]+$/, "");
  const m = clean.match(/(\d+)(?!.*\d)/);
  if (m) {
    return parseInt(m[1], 10);
  }
  return 999999;
}

export default function ExamManagerMain({ onNavigate }: { onNavigate?: (menu: string) => void } = {}) {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'bundle' | 'proctor'>('list');
  const [isGradingModalOpen, setIsGradingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // 시험지 목록
  const [exams, setExams] = useState<ExamPaper[]>([]);
  // 학생 목록
  const [students, setStudents] = useState<Student[]>([]);

  // 🌟 시험 DB 상태 (테스트자료 관리에서 구축된 카테고리 및 문항들)
  const [bankGradeFilter, setBankGradeFilter] = useState('고1');
  const [bankCategories, setBankCategories] = useState<TestCategory[]>([]);
  const [bankItems, setBankItems] = useState<TestBankItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // 🌟 좌측 시험 DB 스마트 필터 상태 (번호 구간, 홀/짝수, 소단원 폴더 아코디언)
  const [qNumStart, setQNumStart] = useState<string>('');
  const [qNumEnd, setQNumEnd] = useState<string>('');
  const [qNumPreset, setQNumPreset] = useState<'all' | '1-5' | '6-10' | 'odd' | 'even'>('all');
  const [isFilterActive, setIsFilterActive] = useState<boolean>(false);
  const [expandedSubFolders, setExpandedSubFolders] = useState<Set<string>>(new Set());

  // ── 시험지 생성 폼 상태 ──
  const [examTitle, setExamTitle] = useState('');
  const [examGrade, setExamGrade] = useState('고1');
  const [examDuration, setExamDuration] = useState(50);
  const [isNoTimeLimit, setIsNoTimeLimit] = useState(false);

  // ── [신규] 화면 이탈 방지(잠금) 및 풀이 인증샷 기본값 & 디폴트 기억 상태 ──
  const [examEnableLockdown, setExamEnableLockdown] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eduest_pref_lockdown') === 'true';
    }
    return false; // 기본 OFF (자율 응시)
  });
  const [examRequireProof, setExamRequireProof] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eduest_pref_proof') === 'true';
    }
    return false; // 기본 OFF
  });
  const [rememberPreference, setRememberPreference] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('eduest_pref_remember');
      return saved === null ? true : saved === 'true';
    }
    return true; // 기본값 기억 활성화
  });

  const handleUpdateLockdownPref = (newVal: boolean) => {
    setExamEnableLockdown(newVal);
    if (rememberPreference && typeof window !== 'undefined') {
      localStorage.setItem('eduest_pref_lockdown', String(newVal));
    }
  };

  const handleUpdateProofPref = (newVal: boolean) => {
    setExamRequireProof(newVal);
    if (rememberPreference && typeof window !== 'undefined') {
      localStorage.setItem('eduest_pref_proof', String(newVal));
    }
  };
  
  // 선택된 문제들 (바구니)
  const [selectedFiles, setSelectedFiles] = useState<{
    drive_id: string;
    name: string;
    question_image_drive_id?: string | null;
    folder_name?: string | null;
    folder_path?: string | null;
    question_number?: number | null;
    display_name?: string | null;
  }[]>([]);
  // 🌟 바구니 정렬 모드: 'manual' (수동) | 'round_asc' (회차 오름차순) | 'round_desc' (회차 내림차순)
  const [basketSortMode, setBasketSortMode] = useState<'manual' | 'round_asc' | 'round_desc'>('manual');

  // 추출된 문제 정보 (이미지 URL, 정답 등)
  const [extractedQuestions, setExtractedQuestions] = useState<ExamQuestion[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);

  // 🌟 문항별 단독 병렬 재추출 상태 및 비교 모달 상태
  const [reExtractingIds, setReExtractingIds] = useState<Set<string>>(new Set());
  const [diffModalInfo, setDiffModalInfo] = useState<{
    questionIndex: number;
    currentData: any;
    newData: any;
  } | null>(null);

  // 배정할 학생 IDs
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [studentGradeFilter, setStudentGradeFilter] = useState('ALL');

  // ── 모달 상태 ──
  // 학생 배정 수정 모달
  const [assignModalExam, setAssignModalExam] = useState<ExamPaper | null>(null);
  const [modalAssignedIds, setModalAssignedIds] = useState<string[]>([]);
  const [modalStudentOverrides, setModalStudentOverrides] = useState<Record<string, StudentOverrideConfig>>({});
  const [modalSaving, setModalSaving] = useState(false);
  const [assignModalGradeFilter, setAssignModalGradeFilter] = useState<string>('ALL');
  const [assignModalSearch, setAssignModalSearch] = useState<string>('');

  // 응시 결과 현황 모달
  const [resultsModalExam, setResultsModalExam] = useState<ExamPaper | null>(null);
  const [examSubmissions, setExamSubmissions] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // 🌟 학생별 응시 상세 모달 (문항별 맞음/틀림/모름 및 소요시간)
  const [detailStudent, setDetailStudent] = useState<{ student: Student; submission: any } | null>(null);
  const [overridingQuestionId, setOverridingQuestionId] = useState<string | null>(null);
  const [teacherSolutionModalDriveId, setTeacherSolutionModalDriveId] = useState<string | null>(null);

  // 👯 쌍둥이 저장소 및 오답 맞춤 시험지 모달 상태
  const [twinStore, setTwinStore] = useState<TwinStoreData | null>(null);
  const [wrongExamModal, setWrongExamModal] = useState<{
    student: Student;
    submission: any;
    exam: ExamPaper;
    wrongQuestions: ExamQuestion[];
  } | null>(null);
  const [wrongExamMode, setWrongExamMode] = useState<'twin' | 'original'>('twin');
  const [creatingWrongExamModal, setCreatingWrongExamModal] = useState(false);

  // 🌟 [사용자 요청] 시험지 목록 필터링 상태 (검색어, 학년 필터, 시험지 종류 필터)
  const [examSearchInput, setExamSearchInput] = useState('');
  const [appliedExamSearch, setAppliedExamSearch] = useState('');
  const [examListGradeFilter, setExamListGradeFilter] = useState('ALL');
  const [examListTypeFilter, setExamListTypeFilter] = useState<'ALL' | 'NORMAL' | 'WRONG'>('ALL');

  // 문제 미리보기 모달
  const [previewQuestion, setPreviewQuestion] = useState<ExamQuestion | null>(null);

  // 🖨️ 시험지 인쇄 모달 상태
  const [printModalExam, setPrintModalExam] = useState<ExamPaper | null>(null);

  // 1. 초기 데이터 로드 (시험지 목록, 학생 목록)
  const loadInitialData = async () => {
    try {
      setLoading(true);

      // 1) 시험지 목록 조회
      const examRes = await fetch('/api/test2/exam');
      const examData = await examRes.json();
      if (examData.success) {
        setExams(examData.exams || []);
      }

      // 2) 학생 목록 조회
      const { data: studentList } = await supabase
        .from('students')
        .select('id, name, grade')
        .order('grade', { ascending: true })
        .order('name', { ascending: true });
      if (studentList) {
        setStudents(studentList);
      }

      // 3) 쌍둥이 메타데이터 로드
      await loadTwins();
    } catch (e) {
      console.error('Failed to load initial data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 2. 시험 DB 데이터 로드 (학년 필터 적용)
  const loadBankForExamCreation = async (grade: string) => {
    try {
      setLoadingBank(true);
      const res = await fetch(`/api/test2/bank?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success) {
        const catList: TestCategory[] = data.categories || [];
        setBankCategories(catList);
        setBankItems(data.items || []);

        // 모든 카테고리 기본 펼치기
        const initialExpanded = new Set<string>();
        catList.forEach(c => initialExpanded.add(c.id));
        setExpandedCategories(initialExpanded);
      } else {
        setBankCategories([]);
        setBankItems([]);
      }
    } catch (e) {
      console.error('Failed to load bank for exam:', e);
    } finally {
      setLoadingBank(false);
    }
  };

  // 학년 필터 또는 탭 진입 시 시험 DB 로드
  useEffect(() => {
    if (activeTab === 'create') {
      loadBankForExamCreation(bankGradeFilter);
    }
  }, [activeTab, bankGradeFilter]);

  // 카테고리 접기/펼치기 토글
  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // 🌟 바구니 정렬 로직 (폴더/회차 자연어 오름차순, 폴더/회차 내림차순)
  const applyBasketSort = (
    items: typeof selectedFiles, 
    mode: 'round_asc' | 'round_desc'
  ) => {
    return [...items].sort((a, b) => {
      // 1순위: 폴더 경로 우선 자연어 비교 (5.1 vs 5.2 vs 5.10 완벽 정렬)
      const pathA = a.folder_path || a.folder_name || '';
      const pathB = b.folder_path || b.folder_name || '';

      if (pathA !== pathB) {
        const pathCmp = compareNatural(pathA, pathB);
        return mode === 'round_asc' ? pathCmp : -pathCmp;
      }

      // 2순위: 동일 폴더 내에서는 항상 문항 번호 오름차순 (1번 -> 2번 -> ...)
      const qA = parseQuestionNumber(a);
      const qB = parseQuestionNumber(b);
      if (qA !== qB) {
        return qA - qB;
      }

      // 3순위: 파일명 자연어 정렬
      return compareNatural(a.name, b.name);
    });
  };

  const handleSortBasket = (mode: 'round_asc' | 'round_desc' | 'manual') => {
    setBasketSortMode(mode);
    if (mode === 'manual') return;

    setSelectedFiles(prev => {
      const sorted = applyBasketSort(prev, mode);

      // 이미 추출된 문제가 있다면 동일한 순서로 정렬 동기화
      if (extractedQuestions.length === sorted.length) {
        const orderMap = new Map(sorted.map((item, idx) => [item.drive_id, idx]));
        const sortedQ = [...extractedQuestions].sort((a, b) => {
          const idxA = orderMap.get(a.drive_id) ?? 0;
          const idxB = orderMap.get(b.drive_id) ?? 0;
          return idxA - idxB;
        });
        setExtractedQuestions(sortedQ);
      }

      return sorted;
    });
  };

  // 문제 바구니에 파일 추가/제거 토글
  const toggleSelectFile = (file: {
    drive_id: string;
    name: string;
    question_image_drive_id?: string | null;
    folder_name?: string | null;
    folder_path?: string | null;
    question_number?: number | null;
    display_name?: string | null;
  }) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.drive_id === file.drive_id);
      let nextList = exists
        ? prev.filter(f => f.drive_id !== file.drive_id)
        : [...prev, file];

      if (basketSortMode !== 'manual') {
        nextList = applyBasketSort(nextList, basketSortMode);
      }
      return nextList;
    });
    setExtractionDone(false);
  };

  // 특정 카테고리 안의 모든 문제 일괄 선택
  // 특정 카테고리 안의 모든 문제 일괄 선택 (필터 활성화 시 필터 매칭 문항만 선택)
  const handleSelectAllInCategory = (categoryId: string) => {
    const catItems = bankItems.filter(i => i.category_id === categoryId);
    const targetItems = isFilterActive ? catItems.filter(isItemMatchedFilter) : catItems;

    if (targetItems.length === 0) {
      alert('설정된 필터 조건에 매칭되는 문제가 없습니다.');
      return;
    }

    // 카테고리 내에서도 폴더 경로 자연어 및 문항 번호 순으로 정렬하여 바구니에 담기
    const sortedCatItems = [...targetItems].sort((a, b) => {
      const pathA = a.folder_path || a.folder_name || '';
      const pathB = b.folder_path || b.folder_name || '';
      if (pathA !== pathB) {
        return compareNatural(pathA, pathB);
      }
      const qA = parseQuestionNumber(a);
      const qB = parseQuestionNumber(b);
      if (qA !== qB) return qA - qB;
      return compareNatural(a.name, b.name);
    });

    setSelectedFiles(prev => {
      const currentIds = new Set(prev.map(f => f.drive_id));
      const toAdd = sortedCatItems
        .filter(item => !currentIds.has(item.drive_id))
        .map(item => ({
          drive_id: item.drive_id,
          name: item.name,
          question_image_drive_id: item.question_image_drive_id,
          folder_name: item.folder_name,
          folder_path: item.folder_path,
          question_number: item.question_number,
          display_name: item.display_name,
        }));
      let nextList = [...prev, ...toAdd];
      if (basketSortMode !== 'manual') {
        nextList = applyBasketSort(nextList, basketSortMode);
      }
      return nextList;
    });
    setExtractionDone(false);
  };

  // 🌟 문항 필터 매칭 판정 헬퍼
  const isItemMatchedFilter = (item: TestBankItem): boolean => {
    if (!isFilterActive) return true;
    const qNum = parseQuestionNumber(item);

    // 1. 프리셋 검사
    if (qNumPreset === 'odd') {
      if (qNum === 999999 || qNum % 2 === 0) return false;
    } else if (qNumPreset === 'even') {
      if (qNum === 999999 || qNum % 2 !== 0) return false;
    } else if (qNumPreset === '1-5') {
      if (qNum < 1 || qNum > 5) return false;
    } else if (qNumPreset === '6-10') {
      if (qNum < 6 || qNum > 10) return false;
    }

    // 2. 직접 입력 구간 검사
    const s = qNumStart.trim() !== '' ? parseInt(qNumStart.trim(), 10) : null;
    const e = qNumEnd.trim() !== '' ? parseInt(qNumEnd.trim(), 10) : null;
    if (s !== null && !isNaN(s) && e !== null && !isNaN(e)) {
      if (qNum === 999999 || qNum < Math.min(s, e) || qNum > Math.max(s, e)) return false;
    } else if (s !== null && !isNaN(s)) {
      if (qNum === 999999 || qNum < s) return false;
    } else if (e !== null && !isNaN(e)) {
      if (qNum === 999999 || qNum > e) return false;
    }

    return true;
  };

  // 🌟 특정 소단원 폴더 전체 담기 / 비우기 토글 (필터 활성화 시 필터 매칭 문항 대상)
  const handleToggleFolderToBasket = (folderItems: TestBankItem[]) => {
    const targetItems = isFilterActive ? folderItems.filter(isItemMatchedFilter) : folderItems;
    if (targetItems.length === 0) {
      alert('설정된 필터 조건에 매칭되는 문제가 해당 폴더에 없습니다.');
      return;
    }

    const currentIds = new Set(selectedFiles.map(f => f.drive_id));
    const allInBasket = targetItems.every(item => currentIds.has(item.drive_id));

    if (allInBasket) {
      const targetDriveIds = new Set(targetItems.map(i => i.drive_id));
      setSelectedFiles(prev => prev.filter(f => !targetDriveIds.has(f.drive_id)));
    } else {
      const toAdd = targetItems
        .filter(item => !currentIds.has(item.drive_id))
        .map(item => ({
          drive_id: item.drive_id,
          name: item.name,
          question_image_drive_id: item.question_image_drive_id,
          folder_name: item.folder_name,
          folder_path: item.folder_path,
          question_number: item.question_number,
          display_name: item.display_name,
        }));
      setSelectedFiles(prev => {
        let nextList = [...prev, ...toAdd];
        if (basketSortMode !== 'manual') {
          nextList = applyBasketSort(nextList, basketSortMode);
        }
        return nextList;
      });
    }
    setExtractionDone(false);
  };

  // 🌟 필터 조건 매칭 문항들 일괄 담기
  const handleAddFilteredToBasket = (targetItems: TestBankItem[]) => {
    const matched = targetItems.filter(isItemMatchedFilter);
    if (matched.length === 0) {
      alert('설정한 필터 조건에 매칭되는 문제가 없습니다.');
      return;
    }

    const currentIds = new Set(selectedFiles.map(f => f.drive_id));
    const toAdd = matched
      .filter(item => !currentIds.has(item.drive_id))
      .map(item => ({
        drive_id: item.drive_id,
        name: item.name,
        question_image_drive_id: item.question_image_drive_id,
        folder_name: item.folder_name,
        folder_path: item.folder_path,
        question_number: item.question_number,
        display_name: item.display_name,
      }));

    if (toAdd.length === 0) {
      alert('조건에 해당하는 모든 문제가 이미 바구니에 담겨 있습니다.');
      return;
    }

    setSelectedFiles(prev => {
      let nextList = [...prev, ...toAdd];
      if (basketSortMode !== 'manual') {
        nextList = applyBasketSort(nextList, basketSortMode);
      }
      return nextList;
    });
    setExtractionDone(false);
    alert(`🎯 필터 조건에 맞는 ${toAdd.length}개 문제가 바구니에 쏙 담겼습니다!`);
  };

  // 🌟 소단원 폴더 접기/펼치기 토글
  const toggleSubFolderExpand = (folderKey: string) => {
    setExpandedSubFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  };

  // 문제 바구니 순서 이동 (위로)
  const moveFileUp = (index: number) => {
    if (index === 0) return;
    setBasketSortMode('manual');
    const next = [...selectedFiles];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setSelectedFiles(next);

    if (extractedQuestions.length === next.length) {
      const nextQ = [...extractedQuestions];
      const tempQ = nextQ[index - 1];
      nextQ[index - 1] = nextQ[index];
      nextQ[index] = tempQ;
      setExtractedQuestions(nextQ);
    }
  };

  // 문제 바구니 순서 이동 (아래로)
  const moveFileDown = (index: number) => {
    if (index === selectedFiles.length - 1) return;
    setBasketSortMode('manual');
    const next = [...selectedFiles];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setSelectedFiles(next);

    if (extractedQuestions.length === next.length) {
      const nextQ = [...extractedQuestions];
      const tempQ = nextQ[index + 1];
      nextQ[index + 1] = nextQ[index];
      nextQ[index] = tempQ;
      setExtractedQuestions(nextQ);
    }
  };

  // 문제 삭제
  const removeSelectedFile = (driveId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.drive_id !== driveId));
    setExtractedQuestions(prev => prev.filter(q => q.drive_id !== driveId));
  };

  // 🌟 문제 이미지 및 정답 자동 추출 API 호출
  const handleExtractQuestions = async () => {
    if (selectedFiles.length === 0) {
      alert('시험지에 포함할 문제를 최소 1개 이상 선택해주세요.');
      return;
    }

    try {
      setIsExtracting(true);
      const res = await fetch('/api/test2/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedFiles }),
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.questions)) {
        setExtractedQuestions(data.questions);
        setExtractionDone(true);
      } else {
        alert(`문제 추출 중 오류: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e: any) {
      console.error('Failed to extract questions:', e);
      alert('문제 추출 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  // 🌟 특정 문항 단독 재추출 핸들러 (병렬 비동기 지원)
  const handleReExtractSingleQuestion = async (qIndex: number) => {
    const targetQ = extractedQuestions[qIndex];
    if (!targetQ || !targetQ.drive_id) return;

    // 해당 문항에 대응하는 selectedFiles 찾기 (fallback)
    const matchingFile = selectedFiles.find(f => f.drive_id === targetQ.drive_id) || {
      drive_id: targetQ.drive_id,
      name: targetQ.name,
      folder_name: targetQ.folder_name,
      question_number: targetQ.question_number,
      display_name: targetQ.display_name,
    };

    setReExtractingIds(prev => new Set(prev).add(targetQ.drive_id));

    try {
      const res = await fetch('/api/test2/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [matchingFile] }),
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        const newlyExtracted = data.questions[0];
        // 비교 모달 띄우기
        setDiffModalInfo({
          questionIndex: qIndex,
          currentData: targetQ,
          newData: newlyExtracted,
        });
      } else {
        alert(`문항 ${qIndex + 1} 재추출 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e: any) {
      console.error(`Failed to re-extract question ${targetQ.name}:`, e);
      alert(`문항 ${qIndex + 1} 재추출 중 네트워크 오류가 발생했습니다.`);
    } finally {
      setReExtractingIds(prev => {
        const next = new Set(prev);
        next.delete(targetQ.drive_id);
        return next;
      });
    }
  };

  // 🌟 비교 모달에서 새 추출 결과(또는 수정값) 적용 핸들러
  const handleApplyExtractedDiff = (appliedData: any) => {
    if (!diffModalInfo) return;
    const targetIdx = diffModalInfo.questionIndex;
    setExtractedQuestions(prev => {
      const next = [...prev];
      next[targetIdx] = {
        ...next[targetIdx],
        answer: appliedData.answer,
        raw_answer: appliedData.raw_answer || next[targetIdx].raw_answer,
        is_descriptive: !!appliedData.is_descriptive,
        image_url: appliedData.image_url || next[targetIdx].image_url,
      };
      return next;
    });
  };

  // 선생님의 정답 수정 반영
  const handleUpdateQuestionAnswer = (qIndex: number, newAnswer: string) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      next[qIndex] = {
        ...next[qIndex],
        answer: newAnswer,
      };
      return next;
    });
  };

  // 문항의 서술형(선생님 직접 채점) 토글
  const handleToggleQuestionDescriptive = (qIndex: number) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      const isDesc = !next[qIndex].is_descriptive;
      next[qIndex] = {
        ...next[qIndex],
        is_descriptive: isDesc,
        question_type: isDesc ? 'DESCRIPTIVE' : (/^[1-5]$/.test(next[qIndex].answer) ? 'MULTIPLE' : 'SHORT'),
      };
      return next;
    });
  };

  // 문항 유형 직접 변경 ('MULTIPLE' | 'SHORT' | 'DESCRIPTIVE')
  const handleChangeQuestionType = (qIndex: number, newType: 'MULTIPLE' | 'SHORT' | 'DESCRIPTIVE') => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      next[qIndex] = {
        ...next[qIndex],
        question_type: newType,
        is_descriptive: newType === 'DESCRIPTIVE',
      };
      return next;
    });
  };

  // 소문항 추가
  const handleAddSubQuestion = (qIndex: number) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      const currentSubs = next[qIndex].sub_questions || [];
      const nextNum = currentSubs.length + 1;
      const newSub: ExamSubQuestion = {
        label: `(${nextNum})`,
        answer: '',
      };
      const updatedSubs = [...currentSubs, newSub];
      next[qIndex] = {
        ...next[qIndex],
        sub_questions: updatedSubs,
        question_type: next[qIndex].question_type === 'MULTIPLE' ? 'SHORT' : next[qIndex].question_type,
      };
      return next;
    });
  };

  // 소문항 수정
  const handleUpdateSubQuestion = (qIndex: number, subIndex: number, field: 'label' | 'answer', val: string) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      const subs = [...(next[qIndex].sub_questions || [])];
      if (subs[subIndex]) {
        subs[subIndex] = {
          ...subs[subIndex],
          [field]: val,
        };
      }
      next[qIndex] = {
        ...next[qIndex],
        sub_questions: subs,
      };
      return next;
    });
  };

  // 소문항 삭제
  const handleRemoveSubQuestion = (qIndex: number, subIndex: number) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      const subs = [...(next[qIndex].sub_questions || [])];
      subs.splice(subIndex, 1);
      next[qIndex] = {
        ...next[qIndex],
        sub_questions: subs.length > 0 ? subs : undefined,
      };
      return next;
    });
  };

  // 학생 배정 체크박스 토글
  const toggleStudentAssign = (studentId: string) => {
    setAssignedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  // 필터링된 학생 전체 선택 / 해제
  const handleSelectAllFilteredStudents = (studentsToSelect: Student[]) => {
    const idsToSelect = studentsToSelect.map(s => s.id);
    const allSelected = idsToSelect.every(id => assignedStudentIds.includes(id));
    if (allSelected) {
      setAssignedStudentIds(prev => prev.filter(id => !idsToSelect.includes(id)));
    } else {
      setAssignedStudentIds(prev => Array.from(new Set([...prev, ...idsToSelect])));
    }
  };

  // 🚀 최종 시험지 생성 및 저장
  const handleCreateExam = async () => {
    if (!examTitle.trim()) {
      alert('시험지 제목을 입력해주세요.');
      return;
    }
    if (selectedFiles.length === 0) {
      alert('시험지에 포함할 문제를 선택해주세요.');
      return;
    }
    if (!extractionDone || extractedQuestions.length === 0) {
      alert('먼저 [문제 이미지 및 정답 추출]을 실행해주세요.');
      return;
    }
    if (!isNoTimeLimit && (!examDuration || examDuration <= 0)) {
      alert('제한 시간을 분 단위로 입력하거나 [제한시간 없음]을 체크해주세요.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/test2/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade: examGrade,
          duration_min: isNoTimeLimit ? 0 : Math.max(0, examDuration),
          questions: extractedQuestions,
          assigned_student_ids: assignedStudentIds,
          enable_lockdown: examEnableLockdown,
          require_proof_image: examRequireProof,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`🎉 '${examTitle}' 시험지가 성공적으로 생성되었습니다! (${assignedStudentIds.length}명 배정됨)`);
        setExamTitle('');
        setSelectedFiles([]);
        setExtractedQuestions([]);
        setExtractionDone(false);
        setAssignedStudentIds([]);
        setExamDuration(50);
        setIsNoTimeLimit(false);
        setActiveTab('list');
        loadInitialData();
      } else {
        alert(`시험지 생성 실패: ${data.error}`);
      }
    } catch (e: any) {
      console.error('Failed to create exam:', e);
      alert('시험지 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 시험지 삭제
  const handleDeleteExam = async (examId: string, title: string) => {
    if (!confirm(`'${title}' 시험지를 정말 삭제하시겠습니까? 배정된 학생들의 기록도 삭제됩니다.`)) return;

    try {
      const res = await fetch(`/api/test2/exam?examId=${examId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setExams(prev => prev.filter(e => e.id !== examId));
        alert('시험지가 삭제되었습니다.');
      } else {
        alert(`삭제 실패: ${data.error}`);
      }
    } catch (e) {
      alert('시험지 삭제 중 오류가 발생했습니다.');
    }
  };

  // 시험지 이탈 잠금 모드 원클릭 토글
  const handleToggleExamLockdown = async (exam: ExamPaper) => {
    const nextVal = !exam.enable_lockdown;
    try {
      const res = await fetch('/api/test2/exam', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          enable_lockdown: nextVal,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExams(prev => prev.map(e => e.id === exam.id ? { ...e, enable_lockdown: nextVal } : e));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 풀이 인증샷 필수 여부 원클릭 토글
  const handleToggleExamProof = async (exam: ExamPaper) => {
    const nextVal = !exam.require_proof_image;
    try {
      const res = await fetch('/api/test2/exam', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          require_proof_image: nextVal,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExams(prev => prev.map(e => e.id === exam.id ? { ...e, require_proof_image: nextVal } : e));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 배정 모달 열기
  const handleOpenAssignModal = (exam: ExamPaper) => {
    setAssignModalExam(exam);
    setModalAssignedIds(exam.assigned_student_ids || []);
    setModalStudentOverrides(exam.student_overrides || {});
    setAssignModalGradeFilter('ALL');
    setAssignModalSearch('');
  };

  // 🌟 배정 모달 내 사용 가능한 학년 목록
  const availableAssignGrades = useMemo(() => {
    const gradeSet = new Set<string>();
    students.forEach(st => {
      if (st.grade) gradeSet.add(st.grade);
    });
    const order = ['중1', '중2', '중3', '고1', '고2', '고3'];
    const sorted = Array.from(gradeSet).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
    return ['ALL', ...sorted];
  }, [students]);

  // 🌟 배정 모달 내 필터링된 학생 목록 (학년 탭 + 자유 검색어 통합 필터)
  const filteredModalStudents = useMemo(() => {
    return students.filter(st => {
      // 1. 학년 필터
      if (assignModalGradeFilter !== 'ALL' && st.grade !== assignModalGradeFilter) {
        return false;
      }
      // 2. 검색어 필터 (이름 또는 학년 부분 일치)
      if (assignModalSearch.trim()) {
        const query = assignModalSearch.trim().toLowerCase();
        const nameMatch = (st.name || '').toLowerCase().includes(query);
        const gradeMatch = (st.grade || '').toLowerCase().includes(query);
        if (!nameMatch && !gradeMatch) {
          return false;
        }
      }
      return true;
    });
  }, [students, assignModalGradeFilter, assignModalSearch]);

  // 🌟 채점 결과 수동 수정 (맞음/틀림 토글 및 실시간 재계산)
  const handleOverrideQuestionGrade = async (questionId: string, currentIsCorrect: boolean) => {
    if (!detailStudent || !resultsModalExam) return;
    const nextIsCorrect = !currentIsCorrect;

    try {
      setOverridingQuestionId(questionId);
      const res = await fetch('/api/test2/student-exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: detailStudent.student.id,
          examId: resultsModalExam.id,
          questionId,
          isCorrect: nextIsCorrect,
        }),
      });

      const data = await res.json();
      if (data.success && data.submission) {
        // 1. 상세 모달 내 submission 즉시 갱신 (점수, 정답수, 오답수 자동 재계산)
        setDetailStudent(prev => prev ? { ...prev, submission: data.submission } : null);

        // 2. 부모 결과 모달의 examSubmissions 목록도 동기화
        setExamSubmissions(prev =>
          prev.map(sub =>
            (sub.student_id === detailStudent.student.id && sub.exam_id === resultsModalExam.id)
              ? data.submission
              : sub
          )
        );
      } else {
        alert(data.error || '채점 수정에 실패했습니다.');
      }
    } catch (e) {
      console.error('Error overriding question grade:', e);
      alert('채점 수정 중 오류가 발생했습니다.');
    } finally {
      setOverridingQuestionId(null);
    }
  };

  // 배정 모달 저장
  const handleSaveAssignment = async () => {
    if (!assignModalExam) return;
    try {
      setModalSaving(true);
      const res = await fetch('/api/test2/exam', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: assignModalExam.id,
          assigned_student_ids: modalAssignedIds,
          student_overrides: modalStudentOverrides,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExams(prev =>
          prev.map(e => (e.id === assignModalExam.id ? { ...e, assigned_student_ids: modalAssignedIds, student_overrides: modalStudentOverrides } : e))
        );
        alert('학생 배정이 업데이트되었습니다.');
        setAssignModalExam(null);
      } else {
        alert(`배정 실패: ${data.error}`);
      }
    } catch (e) {
      alert('배정 저장 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  // 응시 결과 현황 모달 열기
  const handleOpenResultsModal = async (exam: ExamPaper) => {
    setResultsModalExam(exam);
    setLoadingResults(true);
    try {
      const { data } = await supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', 'test2_student_submissions_data')
        .maybeSingle();

      if (data?.file_data) {
        const parsed = JSON.parse(data.file_data);
        const list = Array.isArray(parsed.submissions)
          ? parsed.submissions.filter((s: any) => s.exam_id === exam.id)
          : [];
        setExamSubmissions(list);
      } else {
        setExamSubmissions([]);
      }
    } catch (e) {
      console.error('Failed to load submissions:', e);
      setExamSubmissions([]);
    } finally {
      setLoadingResults(false);
    }
  };

  // 🌟 학생 응시 상세 결과 보기
  const handleOpenStudentDetail = (st: Student | undefined, sub: any) => {
    if (!st || !sub) return;
    setDetailStudent({ student: st, submission: sub });
  };

  // 1-1. 쌍둥이 데이터 로드
  const loadTwins = async () => {
    try {
      const res = await fetch('/api/test2/twins');
      const data = await res.json();
      if (data.success && data.store) {
        setTwinStore(data.store);
      }
    } catch (e) {
      console.error('Failed to load twin store in exammgr:', e);
    }
  };

  // 🌟 학생에게 배정할 다음 회차 쌍둥이 찾기 (1안: 학생 이력 검사 후 자동 승급 출제)
  const getNextAvailableTwinForStudent = (
    q: ExamQuestion,
    studentId: string
  ): { roundName: string; item: TwinQuestionItem } | null => {
    if (!twinStore) return null;
    const qNum = q.question_number ?? parseQuestionNumber(q);
    if (!qNum || isNaN(qNum)) return null;

    // 1. 해당 문항의 원본 회차 폴더 매칭
    let matchedFolderData = null;
    for (const fData of Object.values(twinStore.folders || {})) {
      if (
        fData.parent_folder_name === q.folder_name ||
        (q.folder_name && fData.parent_folder_name.includes(q.folder_name)) ||
        (q.name && fData.parent_folder_name.includes(q.name))
      ) {
        matchedFolderData = fData;
        break;
      }
    }

    if (!matchedFolderData || !matchedFolderData.rounds) return null;

    // 2. 해당 문항의 보유 쌍둥이 목록 (1차, 2차, 3차... 오름차순)
    const availableTwins: Array<{ roundName: string; item: TwinQuestionItem }> = [];
    Object.entries(matchedFolderData.rounds).forEach(([rName, rData]) => {
      const it = rData.items?.find(item => item.question_number === qNum);
      if (it) {
        availableTwins.push({ roundName: rName, item: it });
      }
    });

    if (availableTwins.length === 0) return null;
    availableTwins.sort((a, b) => parseRoundNumber(a.roundName) - parseRoundNumber(b.roundName));

    // 3. 학생이 이미 응시했던 시험지들 중 이 문항의 어떤 쌍둥이를 풀었는지 검사
    const solvedTwinRounds = new Set<string>();
    exams.forEach(ex => {
      if (ex.assigned_student_ids?.includes(studentId)) {
        ex.questions?.forEach(eq => {
          if (
            (eq as any).parent_question_id === q.id ||
            ((eq as any).is_twin && eq.question_number === qNum && (eq as any).folder_name === q.folder_name)
          ) {
            if ((eq as any).twin_round) {
              solvedTwinRounds.add((eq as any).twin_round);
            }
          }
        });
      }
    });

    // 4. 아직 풀지 않은 가장 빠른 회차 쌍둥이 선택
    const unSolved = availableTwins.find(at => !solvedTwinRounds.has(at.roundName));
    if (unSolved) return unSolved;

    // 만약 모든 쌍둥이를 다 풀었다면, 가장 마지막 회차(또는 1차) 제공
    return availableTwins[availableTwins.length - 1];
  };

  // 🌟 오답 맞춤 시험지 생성 모달 열기
  const handleCreateWrongExam = (st: Student | undefined, sub: any) => {
    if (!st || !sub || !resultsModalExam) return;

    // 틀린 문항 필터링 (정답이 아니거나 '모름'인 문항)
    const wrongQuestions = (resultsModalExam.questions || []).filter(q => {
      const ans = sub.answers?.[q.id];
      if (!ans) return true;
      if (!ans.is_correct) return true;
      const u = String(ans.user_answer || '').trim();
      if (u === '모름' || u === 'unknown') return true;
      return false;
    });

    if (wrongQuestions.length === 0) {
      alert(`🎉 '${st.name}' 학생은 모든 문제를 맞혔거나 틀린 문항이 없습니다!`);
      return;
    }

    setWrongExamModal({
      student: st,
      submission: sub,
      exam: resultsModalExam,
      wrongQuestions,
    });
    setWrongExamMode('twin'); // 기본값: 쌍둥이(변형) 문제 모드
  };

  // 🌟 맞춤 오답 시험지 실제 생성 및 배정
  const handleConfirmCreateWrongExam = async () => {
    if (!wrongExamModal) return;
    const { student, exam, wrongQuestions } = wrongExamModal;

    try {
      setCreatingWrongExamModal(true);

      let finalQuestions: ExamQuestion[] = [];
      let examTitle = '';

      if (wrongExamMode === 'twin') {
        examTitle = `[오답·쌍둥이] ${exam.title} (${student.name})`;
        finalQuestions = wrongQuestions.map(q => {
          const assignedTwin = getNextAvailableTwinForStudent(q, student.id);
          if (assignedTwin) {
            return {
              ...q,
              id: `twin_${assignedTwin.item.drive_id}_${Date.now()}`,
              name: `[${assignedTwin.roundName} 쌍둥이] ${q.name}`,
              image_url: assignedTwin.item.image_url || q.image_url,
              answer: assignedTwin.item.answer || q.answer,
              raw_answer: assignedTwin.item.raw_answer || q.raw_answer,
              solution_drive_id: assignedTwin.item.solution_drive_id || q.solution_drive_id,
              is_twin: true,
              twin_round: assignedTwin.roundName,
              parent_question_id: q.id,
            };
          }
          // 쌍둥이가 없는 문항은 원본 문제로 출제 (Fallback)
          return q;
        });
      } else {
        examTitle = `[오답] ${exam.title} (${student.name})`;
        finalQuestions = [...wrongQuestions];
      }

      const res = await fetch('/api/test2/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle,
          grade: exam.grade,
          duration_min: Math.max(10, finalQuestions.length * 3),
          questions: finalQuestions,
          assigned_student_ids: [student.id],
          is_wrong_review: true,
          parent_exam_id: exam.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(
          `🎉 '${student.name}' 학생의 ${wrongExamMode === 'twin' ? '쌍둥이 변형 ' : ''}오답 시험지(${finalQuestions.length}문항)가 성공적으로 생성 및 배정되었습니다!\n학생 화면의 [오답 시험지] 탭에서 응시할 수 있습니다.`
        );
        setWrongExamModal(null);
        setDetailStudent(null);
        loadInitialData();
      } else {
        alert(`오답 시험지 생성 실패: ${data.error}`);
      }
    } catch (e: any) {
      console.error('Failed to create wrong exam:', e);
      alert('오답 시험지 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingWrongExamModal(false);
    }
  };

  // 학생 필터링
  const filteredStudents = useMemo(() => {
    if (studentGradeFilter === 'ALL') return students;
    return students.filter(s => s.grade.includes(studentGradeFilter));
  }, [students, studentGradeFilter]);

  // 🌟 [사용자 요청] 필터링된 시험지 목록 (텍스트 검색 + 학년 필터 + 시험지 종류 필터)
  const filteredExams = useMemo(() => {
    return exams.filter(exam => {
      // 1. 텍스트 검색어 필터 (시험지 이름 매칭)
      if (appliedExamSearch.trim()) {
        const query = appliedExamSearch.trim().toLowerCase();
        if (!exam.title.toLowerCase().includes(query)) {
          return false;
        }
      }

      // 2. 학년 필터
      if (examListGradeFilter !== 'ALL') {
        if (exam.grade !== examListGradeFilter) {
          return false;
        }
      }

      // 3. 시험지 종류 필터 (전체 / 일반 / 오답)
      const isWrong = !!exam.is_wrong_review || exam.title.startsWith('[오답]');
      if (examListTypeFilter === 'NORMAL' && isWrong) return false;
      if (examListTypeFilter === 'WRONG' && !isWrong) return false;

      return true;
    });
  }, [exams, appliedExamSearch, examListGradeFilter, examListTypeFilter]);

  // 돋보기 버튼 클릭 또는 Enter 검색 실행
  const handleExecuteSearch = () => {
    setAppliedExamSearch(examSearchInput);
  };

  // 필터 초기화
  const handleResetExamFilters = () => {
    setExamSearchInput('');
    setAppliedExamSearch('');
    setExamListGradeFilter('ALL');
    setExamListTypeFilter('ALL');
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 헤더 & 탭 스위처 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <div className="w-10 h-10 bg-violet-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-violet-200">
              <FileCheck size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              테스트 관리
            </h1>
            <span className="text-xs px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full font-bold">
              시험지 제작 및 배정 센터
            </span>

            {/* 🌟 [사용자 요청] 왼쪽위 테스트관리(시험지 제작 및 배정센터) 글자 옆 [실시간 모니터링] 메뉴 */}
            <button
              onClick={() => {
                if (onNavigate) onNavigate('monitoring');
                else setActiveTab('proctor');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black transition-all shadow-sm ${
                activeTab === 'proctor'
                  ? 'bg-rose-600 text-white shadow-rose-200 ring-2 ring-rose-400 scale-105'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:scale-105'
              }`}
            >
              <ShieldAlert size={14} className={activeTab === 'proctor' ? 'animate-bounce' : 'text-rose-500'} />
              <span>실시간 모니터링</span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </button>

            {/* 🌟 서술형 채점 검토 버튼 */}
            <button
              onClick={() => setIsGradingModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black transition-all shadow-sm bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 hover:scale-105 cursor-pointer"
            >
              <Sparkles size={14} className="text-amber-600" />
              <span>서술형 채점 검토</span>
            </button>
          </div>
          <p className="text-sm font-medium text-slate-500">
            [테스트자료 관리]에서 선별·구축된 시험 DB에서 문제를 골라 맞춤 시험지를 제작하고 학생들에게 배정합니다.
          </p>
        </div>

        {/* 탭 전환 버튼 */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl flex-wrap">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'list'
                ? 'bg-white text-violet-700 shadow-sm scale-[1.02]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck size={16} />
            시험지 목록 ({exams.length})
          </button>
          <button
            onClick={() => setActiveTab('bundle')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'bundle'
                ? 'bg-white text-violet-700 shadow-sm scale-[1.02]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={16} />
            시험지 묶음 [카트리지]
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'create'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-[1.02]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus size={16} strokeWidth={3} />
            새 시험지 만들기
          </button>
          <button
            onClick={() => {
              if (onNavigate) onNavigate('monitoring');
              else setActiveTab('proctor');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'proctor'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200 scale-[1.02]'
                : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
            }`}
          >
            <ShieldAlert size={16} />
            실시간 모니터링
          </button>
        </div>
      </div>

      {/* 2. 탭 1: 시험지 목록 */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* 🌟 [사용자 요청] 시험지 목록 상단 필터링 바 (학년별 필터 + 텍스트 검색 및 돋보기 + 종류 필터) */}
          {exams.length > 0 && (
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* 왼쪽: 학년별 필터 버튼 칩 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-slate-500 mr-1">학년:</span>
                  {['ALL', '고1', '고2', '고3', '중1', '중2', '중3'].map(grade => {
                    const isSelected = examListGradeFilter === grade;
                    return (
                      <button
                        key={grade}
                        onClick={() => setExamListGradeFilter(grade)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          isSelected
                            ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-105'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {grade === 'ALL' ? '전체 학년' : grade}
                      </button>
                    );
                  })}
                </div>

                {/* 오른쪽: 텍스트 검색 입력창 및 돋보기 버튼 */}
                <div className="flex items-center gap-2 max-w-md w-full lg:w-auto">
                  <div className="relative flex-1 lg:w-72">
                    <input
                      type="text"
                      value={examSearchInput}
                      onChange={e => setExamSearchInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleExecuteSearch();
                        }
                      }}
                      placeholder="시험지 이름 입력..."
                      className="w-full pl-3.5 pr-8 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition-all bg-slate-50 focus:bg-white"
                    />
                    {examSearchInput && (
                      <button
                        onClick={() => {
                          setExamSearchInput('');
                          setAppliedExamSearch('');
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleExecuteSearch}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black shadow-md shadow-violet-200 transition-all flex items-center gap-1.5 shrink-0"
                    title="시험지 이름으로 검색"
                  >
                    <Search size={14} />
                    <span>검색</span>
                  </button>
                </div>
              </div>

              {/* 하단 서브 필터: 시험지 유형 (전체 / 일반 시험지 / 오답 시험지) 및 필터 초기화 */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-400 mr-1">분류:</span>
                  <button
                    onClick={() => setExamListTypeFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                      examListTypeFilter === 'ALL'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    전체 ({exams.length})
                  </button>
                  <button
                    onClick={() => setExamListTypeFilter('NORMAL')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                      examListTypeFilter === 'NORMAL'
                        ? 'bg-violet-600 text-white shadow-2xs'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    단일 시험지 ({exams.filter(e => !(e.is_wrong_review || e.title.startsWith('[오답]'))).length})
                  </button>
                  <button
                    onClick={() => setExamListTypeFilter('WRONG')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                      examListTypeFilter === 'WRONG'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    오답 시험지 ({exams.filter(e => e.is_wrong_review || e.title.startsWith('[오답]')).length})
                  </button>
                </div>

                {(appliedExamSearch || examListGradeFilter !== 'ALL' || examListTypeFilter !== 'ALL') && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">
                      검색 결과: <strong className="text-violet-600">{filteredExams.length}</strong>개
                    </span>
                    <button
                      onClick={handleResetExamFilters}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                    >
                      <RotateCcw size={11} />
                      <span>필터 초기화</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {exams.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto">
                <FileCheck size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-700">생성된 시험지가 없습니다</h3>
                <p className="text-xs text-slate-400">
                  우측 상단의 [새 시험지 만들기] 버튼을 눌러 첫 번째 맞춤 시험지를 제작해보세요!
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="mt-4 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-violet-200"
              >
                + 새 시험지 만들기
              </button>
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-16 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Search size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-700">검색 조건에 맞는 시험지가 없습니다</h3>
                <p className="text-xs text-slate-400">
                  입력한 검색어 또는 선택한 필터 조건에 일치하는 시험지가 없습니다.
                </p>
              </div>
              <button
                onClick={handleResetExamFilters}
                className="mt-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>필터 초기화</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredExams.map(exam => {
                const assignedCount = exam.assigned_student_ids ? exam.assigned_student_ids.length : 0;
                const isWrong = !!exam.is_wrong_review || exam.title.startsWith('[오답]');
                return (
                  <div
                    key={exam.id}
                    className={`bg-white rounded-3xl border p-6 shadow-xs hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden ${
                      isWrong
                        ? 'border-rose-200 hover:border-rose-400'
                        : 'border-slate-200 hover:border-violet-400'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* 카드 상단 배지 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2.5 py-1 border text-[11px] font-black rounded-lg ${
                            isWrong
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-violet-50 text-violet-700 border border-violet-200'
                          }`}>
                            {exam.grade}
                          </span>
                          {isWrong && (
                            <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded-md flex items-center gap-1">
                              <RotateCcw size={10} />
                              오답
                            </span>
                          )}

                          {/* 🔒 이탈 잠금 모드 원클릭 토글 */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleExamLockdown(exam); }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer ${
                              exam.enable_lockdown
                                ? 'bg-violet-600 text-white border-violet-700 shadow-2xs'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                            title={exam.enable_lockdown ? '화면 이탈 잠금 ON (클릭 시 자율 응시로 전환)' : '화면 이탈 잠금 OFF (클릭 시 잠금 모드로 전환)'}
                          >
                            {exam.enable_lockdown ? <Lock size={10} /> : <Unlock size={10} />}
                            <span>{exam.enable_lockdown ? '잠금 ON' : '잠금 OFF'}</span>
                          </button>

                          {/* 📷 풀이 인증샷 원클릭 토글 */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleExamProof(exam); }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer ${
                              exam.require_proof_image
                                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs font-extrabold'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                            title={exam.require_proof_image ? '풀이 인증샷 필수 ON (클릭 시 OFF 전환)' : '풀이 인증샷 OFF (클릭 시 필수 인증으로 전환)'}
                          >
                            <Camera size={10} />
                            <span>{exam.require_proof_image ? '인증 ON' : '인증 OFF'}</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold shrink-0">
                          <Clock size={14} />
                          <span>{exam.duration_min > 0 ? `${exam.duration_min}분` : '무제한'}</span>
                        </div>
                      </div>

                      {/* 시험지 타이틀 */}
                      <div>
                        <h3 className={`text-xl font-black transition-colors line-clamp-1 ${
                          isWrong
                            ? 'text-slate-800 group-hover:text-rose-600'
                            : 'text-slate-800 group-hover:text-violet-700'
                        }`}>
                          {exam.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-1">
                          총 {exam.questions.length}문항 • 생성일: {new Date(exam.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* 배정 현황 박스 */}
                      <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-600">배정된 학생</span>
                        </div>
                        <span className={`text-sm font-black ${isWrong ? 'text-rose-600' : 'text-violet-700'}`}>
                          {assignedCount}명
                        </span>
                      </div>
                    </div>

                    {/* 카드 하단 액션 버튼바 */}
                    <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenAssignModal(exam)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                          title="학생 배정 관리"
                        >
                          <Users size={14} />
                          배정 관리
                        </button>
                        <button
                          onClick={() => handleOpenResultsModal(exam)}
                          className="px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                          title="학생별 응시 결과 확인"
                        >
                          <Eye size={14} />
                          응시 현황
                        </button>
                        <button
                          onClick={() => setPrintModalExam(exam)}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-200/60"
                          title="시험지 인쇄 및 출력 설정"
                        >
                          <Printer size={14} />
                          출력
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteExam(exam.id, exam.title)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        title="시험지 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 🌟 탭 2: 시험지 묶음 [카트리지] */}
      {activeTab === 'bundle' && (
        <ExamBundleTab exams={exams} students={students} />
      )}

      {/* 🌟 탭 3: 실시간 모니터링 센터 */}
      {activeTab === 'proctor' && (
        <RealtimeProctorTab allStudents={students} />
      )}

      {/* 3. 탭 4: 새 시험지 만들기 */}
      {activeTab === 'create' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* STEP 1: 기본 정보 설정 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 font-black text-slate-800 text-base">
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">1</span>
              <span>시험지 기본 정보 설정</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  시험지 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  placeholder="예: 3월 모의평가 대비 핵심 빈출 20제"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  대상 학년
                </label>
                <select
                  value={examGrade}
                  onChange={e => {
                    setExamGrade(e.target.value);
                    if (e.target.value !== '공통') {
                      setBankGradeFilter(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold bg-white"
                >
                  <option value="공통">공통</option>
                  <option value="중1">중1</option>
                  <option value="중2">중2</option>
                  <option value="중3">중3</option>
                  <option value="고1">고1</option>
                  <option value="고2">고2</option>
                  <option value="고3">고3</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-500">
                    제한 시간 (분)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isNoTimeLimit}
                      onChange={e => setIsNoTimeLimit(e.target.checked)}
                      className="w-3.5 h-3.5 text-violet-600 rounded border-slate-300 focus:ring-violet-500 cursor-pointer"
                    />
                    <span className={`text-xs font-black transition-colors ${isNoTimeLimit ? 'text-violet-700' : 'text-slate-400'}`}>
                      제한시간 없음 (무제한)
                    </span>
                  </label>
                </div>

                {isNoTimeLimit ? (
                  <div className="w-full px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50/70 text-violet-700 text-sm font-black flex items-center justify-between">
                    <span>✨ 무제한 (자율 학습 / 대량 문제 모음)</span>
                    <span className="text-[11px] font-bold text-violet-500">시간 제약 없음</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    min={1}
                    placeholder="예: 50, 300 등 자유롭게 입력"
                    value={examDuration === 0 ? '' : examDuration}
                    onChange={e => {
                      const v = e.target.value;
                      setExamDuration(v === '' ? 0 : Math.max(1, parseInt(v, 10) || 0));
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold placeholder:font-normal placeholder:text-slate-400"
                  />
                )}
              </div>
            </div>

            {/* 🌟 [신규] 시험 보안 및 진행 옵션 (이탈 잠금, 풀이 인증샷, 기본값 유지) */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-6">
                {/* 이탈 방지 잠금 토글 */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={examEnableLockdown}
                    onChange={e => handleUpdateLockdownPref(e.target.checked)}
                    className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    {examEnableLockdown ? <Lock size={15} className="text-violet-600" /> : <Unlock size={15} className="text-slate-400" />}
                    <span className={`text-xs font-black ${examEnableLockdown ? 'text-violet-700' : 'text-slate-600'}`}>
                      화면 이탈 방지(잠금)
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      examEnableLockdown ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {examEnableLockdown ? 'ON (학원 정규)' : 'OFF (자율 응시)'}
                    </span>
                  </div>
                </label>

                {/* 풀이 인증샷 필수 토글 */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={examRequireProof}
                    onChange={e => handleUpdateProofPref(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Camera size={15} className={examRequireProof ? 'text-amber-600' : 'text-slate-400'} />
                    <span className={`text-xs font-black ${examRequireProof ? 'text-amber-800' : 'text-slate-600'}`}>
                      풀이과정 사진 인증
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      examRequireProof ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {examRequireProof ? 'ON (필수 제출)' : 'OFF (자율)'}
                    </span>
                  </div>
                </label>
              </div>

              {/* 기본값(디폴트) 유지 체크박스 */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-slate-500 hover:text-slate-800 font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  checked={rememberPreference}
                  onChange={e => {
                    setRememberPreference(e.target.checked);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('eduest_pref_remember', String(e.target.checked));
                    }
                  }}
                  className="w-3.5 h-3.5 text-violet-600 rounded border-slate-300 focus:ring-violet-500 cursor-pointer"
                />
                <span>📌 이 설정을 다음 시험지 생성 기본값으로 계속 유지</span>
              </label>
            </div>
          </div>

          {/* STEP 2: 시험 DB 카테고리에서 문항 선택 (2패널) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-base">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">2</span>
                <span>시험 DB에서 문항 선택</span>
                <span className="text-xs font-normal text-slate-400">
                  ([테스트자료 관리]에서 선별 등록된 카테고리별 시험 문제입니다)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* 학년 필터 */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  {GRADES.map(g => (
                    <button
                      key={g}
                      onClick={() => setBankGradeFilter(g)}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        bankGradeFilter === g ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {g === 'ALL' ? '전체' : g}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-xl shrink-0">
                  선택된 문제: {selectedFiles.length}개
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[450px]">
              
              {/* 좌측: 시험 DB 카테고리별 문항 목록 */}
              <div className="border border-slate-200 rounded-2xl p-4 flex flex-col bg-slate-50/50">
                <div className="flex items-center justify-between mb-2.5 pb-2.5 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <Layers size={16} className="text-indigo-600" />
                    {bankGradeFilter === 'ALL' ? '전체' : bankGradeFilter} 시험 DB 카테고리 ({bankCategories.length}개)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    전체 {bankItems.length}개 시험문제
                  </span>
                </div>

                {/* 🌟 문항 번호 스마트 필터 바 */}
                <div className="bg-white border border-indigo-100 rounded-xl p-2.5 mb-3 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-black text-indigo-950">
                      <Filter size={13} className="text-indigo-600" />
                      <span>번호 스마트 필터</span>
                    </div>

                    {/* 프리셋 버튼들 */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setQNumPreset('all');
                          setQNumStart('');
                          setQNumEnd('');
                          setIsFilterActive(false);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          !isFilterActive && qNumPreset === 'all'
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQNumPreset('1-5');
                          setQNumStart('1');
                          setQNumEnd('5');
                          setIsFilterActive(true);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          isFilterActive && qNumPreset === '1-5'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        1~5번
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQNumPreset('6-10');
                          setQNumStart('6');
                          setQNumEnd('10');
                          setIsFilterActive(true);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          isFilterActive && qNumPreset === '6-10'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        6~10번
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQNumPreset('odd');
                          setQNumStart('');
                          setQNumEnd('');
                          setIsFilterActive(true);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          isFilterActive && qNumPreset === 'odd'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
                      >
                        🔴 홀수번
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQNumPreset('even');
                          setQNumStart('');
                          setQNumEnd('');
                          setIsFilterActive(true);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          isFilterActive && qNumPreset === 'even'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        🔵 짝수번
                      </button>
                    </div>
                  </div>

                  {/* 하단: 구간 직접 입력 + 조건 매칭 쏙 담기 */}
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="text-[11px] font-bold text-slate-500">구간:</span>
                      <input
                        type="number"
                        placeholder="시작"
                        value={qNumStart}
                        onChange={(e) => {
                          setQNumStart(e.target.value);
                          setQNumPreset('all');
                          setIsFilterActive(true);
                        }}
                        className="w-13 px-1.5 py-0.5 text-center text-xs font-bold border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
                        min={1}
                      />
                      <span className="text-slate-400 font-bold">~</span>
                      <input
                        type="number"
                        placeholder="끝"
                        value={qNumEnd}
                        onChange={(e) => {
                          setQNumEnd(e.target.value);
                          setQNumPreset('all');
                          setIsFilterActive(true);
                        }}
                        className="w-13 px-1.5 py-0.5 text-center text-xs font-bold border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
                        min={1}
                      />
                      <span className="text-[11px] text-slate-500 font-bold">번</span>

                      {isFilterActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setQNumPreset('all');
                            setQNumStart('');
                            setQNumEnd('');
                            setIsFilterActive(false);
                          }}
                          className="text-[10px] text-slate-400 hover:text-rose-500 underline ml-1 cursor-pointer"
                        >
                          초기화
                        </button>
                      )}
                    </div>

                    {/* 일괄 담기 버튼 */}
                    {(() => {
                      const matchedItems = bankItems.filter(isItemMatchedFilter);
                      const currentIds = new Set(selectedFiles.map(f => f.drive_id));
                      const unaddedMatchedCount = matchedItems.filter(i => !currentIds.has(i.drive_id)).length;

                      return (
                        <button
                          type="button"
                          onClick={() => handleAddFilteredToBasket(bankItems)}
                          disabled={matchedItems.length === 0}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs ${
                            isFilterActive
                              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-95'
                              : 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                          }`}
                          title="조건에 맞는 모든 문제를 바구니에 담습니다"
                        >
                          <Sparkles size={13} />
                          <span>
                            {isFilterActive ? '조건 매칭 문제 쏙 담기' : '전체 문제 일괄 담기'}
                            {unaddedMatchedCount > 0 ? ` (${unaddedMatchedCount}개)` : ' (담김 완료)'}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[460px] pr-2 scrollbar-thin space-y-2">
                  {loadingBank ? (
                    <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <Loader2 size={24} className="animate-spin text-violet-600" />
                      <span>시험 DB를 불러오는 중입니다...</span>
                    </div>
                  ) : bankCategories.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                      <AlertCircle size={32} className="mx-auto text-amber-500 opacity-50" />
                      <p className="font-bold">{bankGradeFilter === 'ALL' ? '등록된' : `${bankGradeFilter}에 등록된`} 시험자료가 없습니다.</p>
                      <p className="text-[11px] text-slate-400">
                        상단의 <strong>[테스트자료 관리]</strong> 메뉴에서 원천 DB 문제를 카테고리에 먼저 담아주세요!
                      </p>
                    </div>
                  ) : (
                    bankCategories.map(cat => {
                      const isExpanded = expandedCategories.has(cat.id);
                      const itemsInCat = bankItems.filter(i => i.category_id === cat.id);
                      const matchedInCat = isFilterActive ? itemsInCat.filter(isItemMatchedFilter) : itemsInCat;
                      const currentIds = new Set(selectedFiles.map(f => f.drive_id));
                      const catInBasketCount = itemsInCat.filter(i => currentIds.has(i.drive_id)).length;

                      return (
                        <div key={cat.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                          {/* 카테고리 헤더 */}
                          <div
                            onClick={() => toggleCategoryExpand(cat.id)}
                            className="flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                              <Folder size={16} className="text-indigo-600 shrink-0" />
                              <span className="font-black text-xs text-slate-800 truncate">{cat.name}</span>
                              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded font-bold shrink-0">
                                {itemsInCat.length}문제
                              </span>
                              {catInBasketCount > 0 && (
                                <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.2 rounded font-bold shrink-0">
                                  담김 {catInBasketCount}/{itemsInCat.length}
                                </span>
                              )}
                              {isFilterActive && (
                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-bold shrink-0">
                                  매칭 {matchedInCat.length}개
                                </span>
                              )}
                            </div>

                            {itemsInCat.length > 0 && (
                              <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllInCategory(cat.id)}
                                  className="px-2 py-0.5 bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white rounded text-[10px] font-bold transition-all cursor-pointer"
                                  title={isFilterActive ? "이 카테고리에서 필터 매칭된 문제들 담기" : "이 카테고리의 모든 문제 담기"}
                                >
                                  {isFilterActive ? `+ 필터 매칭 담기 (${matchedInCat.length})` : '+ 전체 담기'}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* 카테고리 내부: 소단원 폴더별 그룹 렌더링 */}
                          {isExpanded && itemsInCat.length > 0 && (() => {
                            // 소단원 폴더별 그룹핑
                            const folderMap = new Map<string, TestBankItem[]>();
                            itemsInCat.forEach(item => {
                              const folderKey = item.folder_name || '기본 폴더';
                              if (!folderMap.has(folderKey)) {
                                folderMap.set(folderKey, []);
                              }
                              folderMap.get(folderKey)!.push(item);
                            });

                            // 소단원 폴더 자연어 정렬 (예: 5.1, 5.2, 5.10...)
                            const sortedFolderKeys = Array.from(folderMap.keys()).sort((a, b) => compareNatural(a, b));

                            // 모든 서브 폴더가 펼쳐져 있는지 확인
                            const allSubKeys = sortedFolderKeys.map(k => `${cat.id}__${k}`);
                            const areAllSubExpanded = allSubKeys.length > 0 && allSubKeys.every(k => expandedSubFolders.has(k));

                            return (
                              <div className="p-2 border-t border-slate-100 bg-slate-50/50 space-y-2">
                                {/* 소단원 툴바: 폴더 수 & 전체 펼치기/접기 */}
                                {sortedFolderKeys.length > 1 && (
                                  <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 font-bold">
                                    <span>📁 소단원 {sortedFolderKeys.length}개 단원</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedSubFolders(prev => {
                                          const next = new Set(prev);
                                          if (areAllSubExpanded) {
                                            allSubKeys.forEach(k => next.delete(k));
                                          } else {
                                            allSubKeys.forEach(k => next.add(k));
                                          }
                                          return next;
                                        });
                                      }}
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                    >
                                      {areAllSubExpanded ? '모든 폴더 접기' : '모든 폴더 펼치기'}
                                    </button>
                                  </div>
                                )}

                                {/* 소단원 폴더 카드 리스트 */}
                                {sortedFolderKeys.map(folderName => {
                                  const folderItems = folderMap.get(folderName)!;
                                  // 폴더 내 문항 번호 -> 이름 자연어 정렬
                                  const sortedFolderItems = [...folderItems].sort((a, b) => {
                                    const qA = parseQuestionNumber(a);
                                    const qB = parseQuestionNumber(b);
                                    if (qA !== qB) return qA - qB;
                                    return compareNatural(a.name, b.name);
                                  });

                                  const visibleItems = isFilterActive
                                    ? sortedFolderItems.filter(isItemMatchedFilter)
                                    : sortedFolderItems;

                                  const folderInBasketCount = sortedFolderItems.filter(i => currentIds.has(i.drive_id)).length;
                                  const isFolderAllInBasket = sortedFolderItems.length > 0 && folderInBasketCount === sortedFolderItems.length;

                                  const folderKey = `${cat.id}__${folderName}`;
                                  // 폴더가 1개뿐이거나 사용자가 펼친 경우 열림
                                  const isSubExpanded = expandedSubFolders.has(folderKey) || sortedFolderKeys.length === 1;

                                  return (
                                    <div
                                      key={folderKey}
                                      className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs"
                                    >
                                      {/* 소단원 헤더 */}
                                      <div
                                        onClick={() => toggleSubFolderExpand(folderKey)}
                                        className="flex items-center justify-between p-2 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          {isSubExpanded ? (
                                            <ChevronDown size={13} className="text-slate-400 shrink-0" />
                                          ) : (
                                            <ChevronRight size={13} className="text-slate-400 shrink-0" />
                                          )}
                                          <Folder size={14} className="text-indigo-500 shrink-0" />
                                          <span className="font-bold text-xs text-slate-800 truncate">
                                            {folderName}
                                          </span>
                                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-semibold shrink-0">
                                            {folderItems.length}문제
                                          </span>

                                          {/* 바구니 담김 상태 배지 */}
                                          {folderInBasketCount > 0 && (
                                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                                              isFolderAllInBasket
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-violet-50 text-violet-700 border border-violet-200'
                                            }`}>
                                              담김 {folderInBasketCount}/{folderItems.length}
                                            </span>
                                          )}

                                          {/* 필터 활성 시 매칭 개수 배지 */}
                                          {isFilterActive && (
                                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold shrink-0 bg-amber-50 text-amber-700 border border-amber-200">
                                              매칭 {visibleItems.length}개
                                            </span>
                                          )}
                                        </div>

                                        {/* 폴더 일괄 담기 / 비우기 버튼 */}
                                        <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleFolderToBasket(folderItems)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                              isFolderAllInBasket
                                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200'
                                            }`}
                                            title={isFolderAllInBasket ? '이 폴더의 문제들을 바구니에서 제외' : `이 폴더(${folderName})의 문제들을 바구니에 담기`}
                                          >
                                            {isFolderAllInBasket ? '비우기' : `+ ${folderName} 담기`}
                                          </button>
                                        </div>
                                      </div>

                                      {/* 소단원 내부 문항 목록 */}
                                      {isSubExpanded && (
                                        <div className="p-1.5 border-t border-slate-100 bg-slate-50/40 space-y-1">
                                          {visibleItems.length === 0 ? (
                                            <div className="text-[11px] text-slate-400 py-2 text-center font-medium">
                                              조건에 매칭되는 문제가 없습니다.
                                            </div>
                                          ) : (
                                            visibleItems.map(item => {
                                              const isSelected = selectedFiles.some(f => f.drive_id === item.drive_id);
                                              return (
                                                <div
                                                  key={item.id}
                                                  onClick={() => toggleSelectFile({
                                                    drive_id: item.drive_id,
                                                    name: item.name,
                                                    question_image_drive_id: item.question_image_drive_id,
                                                    folder_name: item.folder_name,
                                                    folder_path: item.folder_path,
                                                    question_number: item.question_number,
                                                    display_name: item.display_name,
                                                  })}
                                                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                                    isSelected
                                                      ? 'bg-violet-50 text-violet-700 font-bold border border-violet-200'
                                                      : 'hover:bg-white text-slate-600'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                                    {isSelected ? (
                                                      <CheckSquare size={14} className="text-violet-600 shrink-0" />
                                                    ) : (
                                                      <Square size={14} className="text-slate-300 shrink-0" />
                                                    )}
                                                    <FileText size={13} className={isSelected ? 'text-violet-600' : 'text-slate-400'} />
                                                    {item.question_number && (
                                                      <span className="px-1.5 py-0.2 bg-violet-100 text-violet-800 rounded text-[10px] font-black shrink-0">
                                                        {item.question_number}번
                                                      </span>
                                                    )}
                                                    <span className="truncate">{item.name}</span>
                                                  </div>
                                                  {isSelected && (
                                                    <span className="text-[10px] text-emerald-600 font-bold shrink-0 ml-1 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-100">
                                                      담김
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 우측: 선택된 시험지 문항 바구니 (순서 변경 / 삭제 / 추출 트리거) */}
              <div className="border border-slate-200 rounded-2xl p-4 flex flex-col bg-white">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <FileCheck size={16} className="text-violet-600" />
                    시험지 문항 구성 바구니 ({selectedFiles.length}개)
                  </span>

                  {selectedFiles.length > 0 && (
                    <button
                      onClick={() => { setSelectedFiles([]); setExtractedQuestions([]); setExtractionDone(false); }}
                      className="text-[11px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
                    >
                      전체 비우기
                    </button>
                  )}
                </div>

                {/* 🌟 바구니 정렬 컨트롤 바: 자동 오름차순, 자동 내림차순, 수동 */}
                {selectedFiles.length > 0 && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px]">
                      <ArrowUpDown size={14} className="text-violet-600" />
                      <span>폴더/회차 정렬:</span>
                    </div>

                    <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleSortBasket('round_asc')}
                        className={`px-2.5 py-1 rounded-md font-black text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                          basketSortMode === 'round_asc'
                            ? 'bg-violet-600 text-white shadow-2xs scale-102'
                            : 'text-slate-600 hover:text-violet-700 hover:bg-slate-50'
                        }`}
                        title="폴더/회차 오름차순 정렬 (5.1 → 5.2 ... 5.10 / 폴더 내 문항 번호 1번→2번)"
                      >
                        <ArrowUp size={12} />
                        자동 오름차순 (5.1→5.10)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSortBasket('round_desc')}
                        className={`px-2.5 py-1 rounded-md font-black text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                          basketSortMode === 'round_desc'
                            ? 'bg-violet-600 text-white shadow-2xs scale-102'
                            : 'text-slate-600 hover:text-violet-700 hover:bg-slate-50'
                        }`}
                        title="폴더/회차 내림차순 정렬 (5.10 → 5.9 ... 5.1 / 폴더 내 문항 번호 1번→2번)"
                      >
                        <ArrowDown size={12} />
                        자동 내림차순
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSortBasket('manual')}
                        className={`px-2.5 py-1 rounded-md font-black text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                          basketSortMode === 'manual'
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                        title="화살표(↑, ↓)를 눌러 사용자가 직접 순서를 변경하는 수동 모드"
                      >
                        수동
                      </button>
                    </div>
                  </div>
                )}

                {selectedFiles.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                    <CheckSquare size={32} className="opacity-30" />
                    <p className="text-xs font-bold">왼쪽 시험 DB 카테고리에서 시험에 넣을 문제를 선택해주세요.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 pr-1 scrollbar-thin">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={file.drive_id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-md bg-violet-600 text-white font-black flex items-center justify-center text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          {file.folder_name && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-black shrink-0">
                              {file.folder_name}
                            </span>
                          )}
                          {file.question_number && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 rounded text-[10px] font-black shrink-0">
                              {file.question_number}번
                            </span>
                          )}
                          <span className="font-bold text-slate-800 truncate">{file.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveFileUp(idx)}
                            disabled={idx === 0}
                            className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-all"
                            title="위로 이동"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFileDown(idx)}
                            disabled={idx === selectedFiles.length - 1}
                            className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-all"
                            title="아래로 이동"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(file.drive_id)}
                            className="p-1 hover:bg-rose-100 rounded text-slate-400 hover:text-rose-600 transition-all ml-1"
                            title="제거"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 문제 추출 버튼 */}
                {selectedFiles.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 mt-auto">
                    <button
                      type="button"
                      onClick={handleExtractQuestions}
                      disabled={isExtracting}
                      className={`w-full py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        extractionDone
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                          : 'bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-200'
                      }`}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>문제 이미지 & 정답 자동 분석 중...</span>
                        </>
                      ) : extractionDone ? (
                        <>
                          <Check size={16} />
                          <span>문제 분석 완료 (다시 분석하려면 클릭)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>선택한 {selectedFiles.length}개 문제 이미지 및 정답 추출하기</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 추출 결과 미리보기 및 정답 확인/수정 패널 */}
            {extractionDone && extractedQuestions.length > 0 && (
              <div className="bg-violet-50/50 border border-violet-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-violet-800 font-black text-sm">
                    <Sparkles size={18} className="text-violet-600" />
                    <span>추출된 문항 정보 & 정답 검토 (직접 수정 가능)</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    * 학생 제출 시 이 정답을 기준으로 자동 채점됩니다.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {extractedQuestions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="bg-white p-3.5 rounded-xl border border-violet-100 shadow-xs space-y-2.5 text-xs"
                    >
                      {/* 문항 헤더: 번호 및 유형 세그먼트 */}
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-violet-700">문항 {idx + 1}</span>
                          {q.is_descriptive ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300 flex items-center gap-0.5">
                              ✍️ 서술형
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold">
                              단답/객관식
                            </span>
                          )}
                        </div>

                        {/* 유형 선택 버튼 세트 */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-black">
                          <button
                            type="button"
                            onClick={() => handleChangeQuestionType(idx, 'MULTIPLE')}
                            className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                              q.question_type === 'MULTIPLE' || (!q.question_type && !q.is_descriptive && /^[1-5]$/.test(q.answer))
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            객관식
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeQuestionType(idx, 'SHORT')}
                            className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                              q.question_type === 'SHORT' || (!q.question_type && !q.is_descriptive && !/^[1-5]$/.test(q.answer))
                                ? 'bg-violet-600 text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            단답형
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeQuestionType(idx, 'DESCRIPTIVE')}
                            className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                              q.question_type === 'DESCRIPTIVE' || q.is_descriptive
                                ? 'bg-amber-500 text-slate-950 font-extrabold shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            서술형
                          </button>
                        </div>
                      </div>

                      {/* 문항 메타 및 액션 버튼들 (재추출, 원본 HTML, 이미지) */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-100">
                        <div className="truncate flex items-center gap-1.5 min-w-0" title={q.name}>
                          {q.folder_name && (
                            <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold shrink-0">
                              {q.folder_name}
                            </span>
                          )}
                          {q.question_number && (
                            <span className="px-1 py-0.2 bg-violet-100 text-violet-800 rounded text-[9px] font-bold shrink-0">
                              {q.question_number}번
                            </span>
                          )}
                          <span className="truncate">{q.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {/* 🌟 원본 HTML 보기 버튼 */}
                          {(q.solution_drive_id || q.drive_id) && (
                            <button
                              type="button"
                              onClick={() => setTeacherSolutionModalDriveId(q.solution_drive_id || q.drive_id)}
                              className="text-[10px] text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                              title="원본 HTML 문제 및 해설을 열람하여 정답을 직접 대조합니다"
                            >
                              <FileText size={10} className="text-emerald-600" />
                              <span>원본 HTML</span>
                            </button>
                          )}

                          {/* 문항별 재추출 버튼 */}
                          <button
                            type="button"
                            onClick={() => handleReExtractSingleQuestion(idx)}
                            disabled={reExtractingIds.has(q.drive_id)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 disabled:opacity-40 flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md hover:bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer"
                            title="이 문항의 정답 및 이미지만 다시 추출합니다"
                          >
                            {reExtractingIds.has(q.drive_id) ? (
                              <Loader2 size={10} className="animate-spin text-indigo-600" />
                            ) : (
                              <RotateCw size={10} />
                            )}
                            <span>재추출</span>
                          </button>

                          {q.image_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewQuestion(q)}
                              className="text-[10px] text-violet-600 hover:underline flex items-center gap-0.5 font-bold"
                              title="문제 이미지 미리보기"
                            >
                              <Eye size={11} />
                              보기
                            </button>
                          ) : (
                            <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.2 rounded font-bold">
                              이미지없음
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 🌟 소문항 목록 및 편집 UI */}
                      {q.sub_questions && q.sub_questions.length > 0 ? (
                        <div className="space-y-1.5 bg-violet-50/60 p-2.5 rounded-xl border border-violet-200/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-violet-800 flex items-center gap-1">
                              <span>소문항 분할 입력 ({q.sub_questions.length}개)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddSubQuestion(idx)}
                              className="text-[10px] font-bold text-violet-700 hover:text-violet-900 bg-white px-1.5 py-0.5 rounded border border-violet-200 flex items-center gap-0.5"
                            >
                              <Plus size={10} /> 추가
                            </button>
                          </div>

                          <div className="space-y-1">
                            {q.sub_questions.map((sq, subIdx) => (
                              <div key={subIdx} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={sq.label}
                                  onChange={e => handleUpdateSubQuestion(idx, subIdx, 'label', e.target.value)}
                                  placeholder="(1)"
                                  className="w-10 px-1.5 py-1 text-center font-black text-[11px] bg-white border border-slate-200 rounded focus:border-violet-500 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={sq.answer}
                                  onChange={e => handleUpdateSubQuestion(idx, subIdx, 'answer', e.target.value)}
                                  placeholder="소문항 정답"
                                  className="flex-1 px-2 py-1 font-black text-[11px] bg-white border border-slate-200 rounded focus:border-violet-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubQuestion(idx, subIdx)}
                                  className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                  title="소문항 삭제"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="text-[9px] text-slate-500 font-bold">
                            * 전체 일치 시 정답 인정 (오답 시 소문항별 결과 피드백)
                          </div>
                        </div>
                      ) : (
                        /* 소문항이 없는 단일 정답 입력란 */
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-500">
                              설정 정답 (채점 기준)
                            </label>
                            <button
                              type="button"
                              onClick={() => handleAddSubQuestion(idx)}
                              className="text-[10px] text-violet-600 hover:text-violet-800 font-bold flex items-center gap-0.5"
                            >
                              <Plus size={10} /> 소문항 분할
                            </button>
                          </div>
                          {q.answer && q.answer.includes('\n') ? (
                            <textarea
                              value={q.answer}
                              onChange={e => handleUpdateQuestionAnswer(idx, e.target.value)}
                              rows={Math.min(3, q.answer.split('\n').length)}
                              placeholder="정답 (줄바꿈 가능)"
                              className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none font-black text-xs resize-y ${
                                q.question_type === 'DESCRIPTIVE' || q.is_descriptive
                                  ? 'border-amber-300 bg-amber-50/40 text-amber-900 focus:border-amber-500'
                                  : 'border-slate-200 text-slate-800 focus:border-violet-500'
                              }`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={q.answer}
                              onChange={e => handleUpdateQuestionAnswer(idx, e.target.value)}
                              placeholder="정답 (예: 5 또는 83)"
                              className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none font-black text-xs ${
                                q.question_type === 'DESCRIPTIVE' || q.is_descriptive
                                  ? 'border-amber-300 bg-amber-50/40 text-amber-900 focus:border-amber-500'
                                  : 'border-slate-200 text-slate-800 focus:border-violet-500'
                              }`}
                            />
                          )}
                          <div className="mt-1 text-[9px] text-slate-400">
                            {q.question_type === 'DESCRIPTIVE' || q.is_descriptive ? (
                              <span className="text-amber-600 font-bold">
                                ⏳ 학생 제출 시 [채점 대기] (종이 직접 제출 지원)
                              </span>
                            ) : (
                              <span>⚡ 학생 제출 시 자동 일치 채점됩니다.</span>
                            )}
                          </div>
                        </div>
                      )}

                      {q.raw_answer && q.raw_answer !== q.answer && (
                        <div className="text-[10px] text-slate-400 truncate" title={q.raw_answer}>
                          원본: {q.raw_answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: 학생 배정 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-base">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">3</span>
                <span>시험지 배정할 학생 선택</span>
                <span className="text-xs font-normal text-slate-400">
                  (배정된 학생의 TEST 메뉴에 나타납니다)
                </span>
              </div>

              {/* 학년 필터 & 전체 선택 */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  {['ALL', '고1', '고2', '고3', '중1', '중2', '중3'].map(g => (
                    <button
                      key={g}
                      onClick={() => setStudentGradeFilter(g)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        studentGradeFilter === g ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      {g === 'ALL' ? '전체' : g}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectAllFilteredStudents(filteredStudents)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  현재 목록 전체 선택
                </button>
              </div>
            </div>

            {/* 학생 카드 그리드 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
              {filteredStudents.map(st => {
                const isChecked = assignedStudentIds.includes(st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => toggleStudentAssign(st.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                      isChecked
                        ? 'bg-violet-50 border-violet-500 shadow-xs'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-black text-slate-400 block">{st.grade}</span>
                      <span className="text-sm font-black text-slate-800">{st.name}</span>
                    </div>

                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isChecked ? 'bg-violet-600 text-white' : 'border border-slate-300 bg-white'}`}>
                      {isChecked && <Check size={14} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs font-bold text-slate-500 text-right">
              총 <span className="text-violet-600 font-black">{assignedStudentIds.length}명</span>의 학생에게 배정됩니다.
            </div>
          </div>

          {/* 발행 버튼 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600 transition-all"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreateExam}
              disabled={loading || selectedFiles.length === 0}
              className="px-8 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-violet-200 flex items-center gap-2"
            >
              <Check size={18} strokeWidth={3} />
              시험지 발행 및 학생 배정 완료
            </button>
          </div>

        </div>
      )}

      {/* 4. 학생 배정 관리 모달 */}
      {assignModalExam && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  '{assignModalExam.title}' 학생 배정 관리
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  시험을 치를 학생을 체크하거나 해제하세요.
                </p>
              </div>
              <button
                onClick={() => setAssignModalExam(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-bold">시험지 기본 설정:</span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  assignModalExam.enable_lockdown ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  🔒 잠금: {assignModalExam.enable_lockdown ? 'ON' : 'OFF'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  assignModalExam.require_proof_image ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  📷 인증샷: {assignModalExam.require_proof_image ? 'ON' : 'OFF'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  (배정 후 학생 옆 아이콘으로 개별 조절 가능)
                </span>
              </div>
            </div>

            {/* 🌟 학년 선택 탭 */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-black text-slate-500 shrink-0 mr-1">학년:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {availableAssignGrades.map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setAssignModalGradeFilter(g)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      assignModalGradeFilter === g
                        ? 'bg-violet-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {g === 'ALL' ? '전체' : g}
                  </button>
                ))}
              </div>
            </div>

            {/* 🌟 자유 검색창 & 빠른 조작 바 */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                <input
                  type="text"
                  value={assignModalSearch}
                  onChange={e => setAssignModalSearch(e.target.value)}
                  placeholder="학생 이름 또는 학년 검색 (예: 김대현, 고1)..."
                  className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white transition-all"
                />
                {assignModalSearch && (
                  <button
                    type="button"
                    onClick={() => setAssignModalSearch('')}
                    className="absolute right-2.5 top-2.5 w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] flex items-center justify-center font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                <div className="flex items-center gap-2">
                  <span>
                    선택: <strong className="text-violet-600 font-black">{modalAssignedIds.length}명</strong>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    검색 결과: <strong className="text-slate-700 font-bold">{filteredModalStudents.length}명</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const visibleIds = filteredModalStudents.map(st => st.id);
                      setModalAssignedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                    }}
                    className="text-violet-600 hover:text-violet-800 hover:underline cursor-pointer"
                  >
                    현재 목록 전체 선택
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      const visibleIdSet = new Set(filteredModalStudents.map(st => st.id));
                      setModalAssignedIds(prev => prev.filter(id => !visibleIdSet.has(id)));
                    }}
                    className="text-slate-500 hover:text-rose-600 hover:underline cursor-pointer"
                  >
                    현재 목록 선택 해제
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[350px] overflow-y-auto p-1 scrollbar-thin">
              {filteredModalStudents.length === 0 ? (
                <div className="col-span-full py-8 text-center text-slate-400 text-xs font-bold space-y-1">
                  <div>검색 조건에 일치하는 학생이 없습니다.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignModalGradeFilter('ALL');
                      setAssignModalSearch('');
                    }}
                    className="text-violet-600 underline text-[11px]"
                  >
                    필터 초기화
                  </button>
                </div>
              ) : filteredModalStudents.map(st => {
                const isChecked = modalAssignedIds.includes(st.id);
                const stOverride = modalStudentOverrides[st.id] || {};
                const stLockdown = stOverride.enable_lockdown !== undefined ? stOverride.enable_lockdown : !!assignModalExam.enable_lockdown;
                const stProof = stOverride.require_proof_image !== undefined ? stOverride.require_proof_image : !!assignModalExam.require_proof_image;

                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      setModalAssignedIds(prev =>
                        prev.includes(st.id) ? prev.filter(id => id !== st.id) : [...prev, st.id]
                      );
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                      isChecked ? 'bg-violet-50/80 border-violet-500 font-bold shadow-2xs' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-slate-400 block">{st.grade}</span>
                      <span className="font-black text-slate-800 truncate block">{st.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {isChecked && (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {/* 개별 잠금 토글 */}
                          <button
                            type="button"
                            onClick={() => {
                              setModalStudentOverrides(prev => {
                                const cur = prev[st.id] || {};
                                return {
                                  ...prev,
                                  [st.id]: { ...cur, enable_lockdown: !stLockdown },
                                };
                              });
                            }}
                            className={`p-1 rounded transition-colors ${
                              stLockdown ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-400 hover:text-slate-700'
                            }`}
                            title={`이 학생 이탈 잠금: ${stLockdown ? 'ON' : 'OFF'} (클릭 시 변경)`}
                          >
                            <Lock size={11} />
                          </button>

                          {/* 개별 인증샷 토글 */}
                          <button
                            type="button"
                            onClick={() => {
                              setModalStudentOverrides(prev => {
                                const cur = prev[st.id] || {};
                                return {
                                  ...prev,
                                  [st.id]: { ...cur, require_proof_image: !stProof },
                                };
                              });
                            }}
                            className={`p-1 rounded transition-colors ${
                              stProof ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-400 hover:text-slate-700'
                            }`}
                            title={`이 학생 풀이 인증샷: ${stProof ? 'ON' : 'OFF'} (클릭 시 변경)`}
                          >
                            <Camera size={11} />
                          </button>
                        </div>
                      )}

                      <div className={`w-4 h-4 rounded flex items-center justify-center ${isChecked ? 'bg-violet-600 text-white' : 'border border-slate-300 bg-white'}`}>
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                선택됨: <strong className="text-violet-600 font-black">{modalAssignedIds.length}명</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAssignModalExam(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={modalSaving}
                  className="px-5 py-2 text-xs font-black text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all shadow-md shadow-violet-200 flex items-center gap-1.5"
                >
                  {modalSaving && <Loader2 size={14} className="animate-spin" />}
                  배정 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 응시 결과 현황 모달 */}
      {resultsModalExam && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  '{resultsModalExam.title}' 학생 응시 현황
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  총 {resultsModalExam.assigned_student_ids?.length || 0}명 배정 • 제출 완료 {examSubmissions.length}명
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintModalExam(resultsModalExam)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-emerald-200 cursor-pointer"
                  title="이 시험지 인쇄 및 출력 미리보기"
                >
                  <Printer size={14} />
                  <span>시험지 인쇄</span>
                </button>
                <button
                  onClick={() => setResultsModalExam(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {loadingResults ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-violet-600 mx-auto" />
                <p className="text-xs text-slate-400 font-bold">응시 데이터를 불러오는 중...</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[400px] border border-slate-200 rounded-2xl scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                    <tr>
                      <th className="p-3">학생</th>
                      <th className="p-3">학년</th>
                      <th className="p-3">상태</th>
                      <th className="p-3">점수</th>
                      <th className="p-3">맞힌 개수</th>
                      <th className="p-3">제출 시각</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(resultsModalExam.assigned_student_ids || []).map(studentId => {
                      const st = students.find(s => s.id === studentId);
                      const sub = examSubmissions.find(s => s.student_id === studentId);
                      return (
                        <tr key={studentId} className="hover:bg-slate-50/80">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{st?.name || '미등록 학생'}</span>
                              {sub && (
                                <div className="flex items-center gap-1.5 ml-1">
                                  <button
                                    onClick={() => handleOpenStudentDetail(st, sub)}
                                    className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1"
                                    title="문항별 맞음/틀림/모름 및 풀이 소요시간 상세 보기"
                                  >
                                    <Search size={12} />
                                    <span>상세보기</span>
                                  </button>
                                  <button
                                    onClick={() => handleCreateWrongExam(st, sub)}
                                    disabled={creatingWrongExamModal}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                                    title="학생이 틀린 문제만 모아 오답 시험지 생성 및 배정"
                                  >
                                    <RotateCcw size={12} className={creatingWrongExamModal ? 'animate-spin' : ''} />
                                    <span>{creatingWrongExamModal ? '생성 중...' : '오답 처리'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-500">{st?.grade || '-'}</td>
                          <td className="p-3">
                            {sub ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold">
                                제출 완료
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-bold">
                                미제출
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-black text-slate-700">
                            {sub ? `${sub.score}점` : '-'}
                          </td>
                          <td className="p-3 text-slate-600">
                            {sub ? `${sub.correct_count} / ${sub.total_questions}개` : '-'}
                          </td>
                          <td className="p-3 text-[11px] text-slate-400">
                            {sub ? new Date(sub.submitted_at).toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResultsModalExam(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-1. 학생별 응시 상세 결과 모달 (맞음/틀림/모름 및 문항별 소요시간) */}
      {detailStudent && resultsModalExam && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 overflow-hidden">
            {/* 헤더 */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-violet-100 text-violet-700 font-black rounded text-xs">
                    {detailStudent.student.grade}
                  </span>
                  <h3 className="text-xl font-black text-slate-800">
                    {detailStudent.student.name} 학생의 응시 상세 결과
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  시험지: <strong className="text-slate-700 font-bold">{resultsModalExam.title}</strong> • 제출 시각: {new Date(detailStudent.submission.submitted_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCreateWrongExam(detailStudent.student, detailStudent.submission)}
                  disabled={creatingWrongExamModal}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw size={14} className={creatingWrongExamModal ? 'animate-spin' : ''} />
                  <span>{creatingWrongExamModal ? '생성 중...' : '오답 시험지 생성'}</span>
                </button>
                <button
                  onClick={() => setDetailStudent(null)}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 요약 바 */}
            <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-center">
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 block">총 문항</span>
                <span className="text-base font-black text-slate-800">{detailStudent.submission.total_questions}문항</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 block">점수</span>
                <span className="text-base font-black text-violet-600">{detailStudent.submission.score}점</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 block">정답 개수</span>
                <span className="text-base font-black text-emerald-600">
                  {detailStudent.submission.correct_count} / {detailStudent.submission.total_questions}
                </span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 block">오답 / 모름</span>
                <span className="text-base font-black text-rose-500">
                  {detailStudent.submission.total_questions - detailStudent.submission.correct_count}문항
                </span>
              </div>
            </div>

            {/* 문항별 상세 그리드 */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(resultsModalExam.questions || []).map((q, idx) => {
                  const ansInfo = detailStudent.submission.answers?.[q.id];
                  const isCorrect = ansInfo?.is_correct ?? false;
                  const userAns = ansInfo?.user_answer || '(미입력)';
                  const isUnknown = userAns === '모름' || userAns === 'unknown';
                  const correctAns = ansInfo?.correct_answer || q.answer || '';
                  const spentSec = ansInfo?.time_spent_sec ?? 0;

                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isCorrect
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : isUnknown
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-rose-50/40 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center text-white ${
                              isCorrect
                                ? 'bg-emerald-500'
                                : isUnknown
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-full ${
                              isCorrect
                                ? 'bg-emerald-100 text-emerald-800'
                                : isUnknown
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isCorrect ? '맞음' : isUnknown ? '모름' : '틀림'}
                          </span>

                          {/* 🌟 채점 결과 수동 수정 (정답 인정 / 오답 변경) 버튼 */}
                          <button
                            type="button"
                            onClick={() => handleOverrideQuestionGrade(q.id, isCorrect)}
                            disabled={overridingQuestionId === q.id}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                              isCorrect
                                ? 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200 hover:border-rose-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                            }`}
                            title={isCorrect ? '이 문항을 [오답]으로 수정합니다' : '이 문항을 [정답]으로 인정합니다'}
                          >
                            {overridingQuestionId === q.id ? (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                <span>반영 중...</span>
                              </>
                            ) : isCorrect ? (
                              <>
                                <span>❌</span>
                                <span>오답으로 변경</span>
                              </>
                            ) : (
                              <>
                                <span>⭕</span>
                                <span>정답 인정</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="font-mono text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            ⏱️ {spentSec}초 소요
                          </span>
                          {q.solution_drive_id && (
                            <button
                              onClick={() => setTeacherSolutionModalDriveId(q.solution_drive_id)}
                              className="px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 font-black text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <BookOpen size={12} />
                              <span>해설</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {q.image_url && (
                        <div
                          className="bg-white p-2 rounded-xl border border-slate-100 mb-3 max-h-36 overflow-hidden flex justify-center cursor-pointer hover:border-violet-300 transition-colors"
                          onClick={() => setPreviewQuestion(q)}
                          title="클릭하여 문제 크게 보기"
                        >
                          <img
                            src={q.image_url}
                            alt={`문제 ${idx + 1}번`}
                            className="max-h-32 object-contain"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <span className="text-slate-400 block text-[10px] font-bold">학생 답안</span>
                          <span
                            className={`font-black text-sm ${
                              isCorrect ? 'text-emerald-600' : isUnknown ? 'text-amber-600' : 'text-rose-600'
                            }`}
                          >
                            {userAns}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <span className="text-slate-400 block text-[10px] font-bold">정답</span>
                          <span className="font-black text-sm text-slate-800">
                            {correctAns}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                onClick={() => setDetailStudent(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-2. 선생님용 해설 iframe 모달 */}
      {teacherSolutionModalDriveId && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-violet-600" />
                <h3 className="text-base font-black text-slate-800">문제 정답 및 상세 해설</h3>
              </div>
              <button
                onClick={() => setTeacherSolutionModalDriveId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-white p-2">
              <iframe
                src={`/api/drive/library/file?fileId=${encodeURIComponent(teacherSolutionModalDriveId)}&type=html&raw=true`}
                className="w-full h-full border-0 rounded-2xl"
                title="문제 해설"
              />
            </div>
          </div>
        </div>
      )}

      {/* 6. 문제 이미지 미리보기 모달 */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-black text-slate-800 text-base">{previewQuestion.name}</h4>
                <p className="text-xs text-slate-400">추출된 정답: <strong className="text-violet-600">{previewQuestion.answer}</strong></p>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto flex items-center justify-center bg-slate-100 rounded-2xl p-4">
              {previewQuestion.image_url ? (
                <img
                  src={previewQuestion.image_url}
                  alt={previewQuestion.name}
                  className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-md"
                />
              ) : (
                <div className="text-slate-400 text-xs font-bold">이미지가 없습니다.</div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 👯 맞춤 오답 시험지 생성 모달 (쌍둥이 변형 vs 원본 선택) */}
      {wrongExamModal && (
        <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-black rounded-lg text-xs">
                    오답 클리닉
                  </span>
                  <h3 className="text-lg font-black text-slate-800">
                    맞춤 오답 시험지 생성 & 배정
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  대상 학생: <strong className="text-slate-700 font-bold">{wrongExamModal.student.name}</strong> ({wrongExamModal.student.grade}) • 
                  원본 시험: <strong className="text-slate-700 font-bold">{wrongExamModal.exam.title}</strong>
                </p>
              </div>
              <button
                onClick={() => setWrongExamModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            {/* 본문 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* 1. 시험지 출제 방식 선택 라디오 카드 */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700 block">
                  출제 방식 선택
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 옵션 1: 쌍둥이 변형 문제 */}
                  <div
                    onClick={() => setWrongExamMode('twin')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all space-y-1.5 select-none ${
                      wrongExamMode === 'twin'
                        ? 'border-purple-600 bg-purple-50/60 shadow-sm shadow-purple-200'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">👯</span>
                        <strong className="text-xs font-black text-purple-950">
                          쌍둥이(변형) 문제로 출제
                        </strong>
                      </div>
                      <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-black">
                        추천
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      학생이 답과 풀이를 단순 암기하는 것을 방지하고, 개념 이해를 확인하도록 <strong>숫자/조건이 변형된 쌍둥이 문제</strong>로 교체 출제합니다.
                    </p>
                    <div className="text-[10px] text-purple-700 font-bold pt-0.5">
                      ✨ 이전 풀이 이력 확인 후 다음 회차 쌍둥이 자동 승급
                    </div>
                  </div>

                  {/* 옵션 2: 원본 문제 그대로 */}
                  <div
                    onClick={() => setWrongExamMode('original')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all space-y-1.5 select-none ${
                      wrongExamMode === 'original'
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-sm shadow-indigo-200'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">📄</span>
                      <strong className="text-xs font-black text-slate-800">
                        원본 문제 그대로 출제
                      </strong>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      학생이 시험에서 틀렸던 원래 문제 그대로 다시 복습 시험지를 생성하여 배정합니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. C안 안내 배너: 쌍둥이 없는 문항 Fallback 알림 */}
              {wrongExamMode === 'twin' && (() => {
                const total = wrongExamModal.wrongQuestions.length;
                const twinCount = wrongExamModal.wrongQuestions.filter(q => !!getNextAvailableTwinForStudent(q, wrongExamModal.student.id)).length;
                const noTwinCount = total - twinCount;

                if (noTwinCount > 0) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-black text-amber-800">
                          쌍둥이 미등록 문항 자동 원본 대체 안내
                        </p>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          틀린 {total}문항 중 <strong>{noTwinCount}개 문항</strong>은 아직 쌍둥이 문제가 등록되지 않아 <strong>원본 문제로 대체 출제</strong>됩니다. (쌍둥이 {twinCount}문항 + 원본 {noTwinCount}문항)
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2 text-xs text-emerald-800">
                    <Check size={15} className="text-emerald-600 shrink-0" />
                    <span>모든 틀린 문항({total}문항)에 대한 쌍둥이 문제가 완벽하게 준비되어 있습니다! 🎯</span>
                  </div>
                );
              })()}

              {/* 3. 출제 대상 문항 상세 리스트 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-0.5">
                  <span>출제될 문항 목록 (총 {wrongExamModal.wrongQuestions.length}문항)</span>
                  <span className="text-[11px] text-slate-400">
                    시험 시간: {Math.max(10, wrongExamModal.wrongQuestions.length * 3)}분 자동 설정
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                  {wrongExamModal.wrongQuestions.map((q, idx) => {
                    const assignedTwin = wrongExamMode === 'twin' ? getNextAvailableTwinForStudent(q, wrongExamModal.student.id) : null;
                    const qNum = q.question_number ?? parseQuestionNumber(q);

                    return (
                      <div key={q.id || idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          {qNum && (
                            <span className="px-1.5 py-0.2 bg-violet-100 text-violet-700 font-bold rounded text-[10px] shrink-0">
                              {qNum}번
                            </span>
                          )}
                          <span className="font-bold text-slate-700 truncate max-w-[200px]">
                            {q.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {wrongExamMode === 'twin' ? (
                            assignedTwin ? (
                              <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-md text-[10px] font-black shadow-2xs flex items-center gap-1">
                                <span>👯 [{assignedTwin.roundName} 쌍둥이]</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-md text-[10px] font-bold">
                                원본 문제로 대체
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold">
                              원본 문제
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 하단 액션 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWrongExamModal(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateWrongExam}
                disabled={creatingWrongExamModal}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-200 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {creatingWrongExamModal ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>생성 및 배정 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>{wrongExamMode === 'twin' ? '쌍둥이 오답 시험지 생성 및 배정' : '원본 오답 시험지 생성 및 배정'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 서술형 문항 채점 검토 모달 */}
      <DescriptiveGradingModal
        isOpen={isGradingModalOpen}
        onClose={() => setIsGradingModalOpen(false)}
        onGradedChange={() => loadInitialData()}
      />

      {/* 🌟 문항 단독 재추출 전/후 비교 검토 및 디버그 모달 */}
      {diffModalInfo && (
        <QuestionDiffModal
          isOpen={!!diffModalInfo}
          questionIndex={diffModalInfo.questionIndex}
          currentData={diffModalInfo.currentData}
          newData={diffModalInfo.newData}
          onApply={handleApplyExtractedDiff}
          onClose={() => setDiffModalInfo(null)}
        />
      )}

      {/* 🖨️ 시험지 인쇄 & 레이아웃 설정 모달 */}
      <ExamPrintModal
        isOpen={!!printModalExam}
        onClose={() => setPrintModalExam(null)}
        exam={printModalExam}
      />

    </div>
  );
}
