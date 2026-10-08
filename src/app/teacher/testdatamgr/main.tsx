'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckSquare, 
  Square, 
  ArrowRight, 
  ArrowUp,
  ArrowDown,
  Sparkles, 
  Loader2, 
  Check, 
  Eye, 
  AlertCircle, 
  Search, 
  BookOpen,
  Filter,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { ExamLibraryNode } from '@/lib/examLibraryTree';
import { TestCategory, TestBankItem } from '@/app/api/test2/bank/route';
import { TwinStoreData, DetectedTwinFolder, TwinQuestionItem } from '@/lib/twinTypes';

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];

export interface NumberRange {
  id: string;
  start: string;
  end: string;
}

export interface RawFileSelection {
  drive_id: string;
  name: string;
  grade?: string;
  question_image_drive_id?: string | null;
  folder_name?: string;
  folder_path?: string;
  question_number?: number | null;
  display_name?: string;
}

// 자연어 및 소수점/숫자 스마트 정렬 헬퍼 (5.1 vs 5.2 vs 5.10 완벽 지원)
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export type GroupLevel = 'leaf' | 'parent1' | 'parent2';
export type SortOption = 'folder_asc' | 'folder_desc' | 'custom';

export interface BankItemGroup {
  key: string;
  title: string;
  fullPath: string;
  items: TestBankItem[];
}

// 다단계 폴더(최하위, 상위 1단계, 상위 2단계) 그룹 정보 파싱
export function getItemGroupInfo(
  item: TestBankItem,
  level: GroupLevel
): { groupKey: string; groupTitle: string; fullPath: string } {
  const rawPath = item.folder_path || item.folder_name || '기타';
  const segments = rawPath.split(/\s*>\s*/).filter(Boolean);

  if (segments.length === 0) {
    const name = item.folder_name || '기타';
    return { groupKey: name, groupTitle: name, fullPath: name };
  }

  if (level === 'parent2' && segments.length >= 3) {
    const title = segments[segments.length - 3];
    const key = segments.slice(0, segments.length - 2).join(' > ');
    return { groupKey: key, groupTitle: title, fullPath: rawPath };
  } else if ((level === 'parent1' || level === 'parent2') && segments.length >= 2) {
    const title = segments[segments.length - 2];
    const key = segments.slice(0, segments.length - 1).join(' > ');
    return { groupKey: key, groupTitle: title, fullPath: rawPath };
  } else {
    const title = segments[segments.length - 1];
    return { groupKey: rawPath, groupTitle: title, fullPath: rawPath };
  }
}

// 파일명에서 가장 마지막 연속된 숫자를 문항 번호로 파싱 (예: "0001.html" -> 1, "10차_05.html" -> 5)
export function parseQuestionNum(fileName: string): number | null {
  const clean = fileName.replace(/\.[^/.]+$/, "");
  const match = clean.match(/(\d+)(?!.*\d)/);
  if (match) {
    const n = parseInt(match[1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
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

// 문항 번호가 설정된 범위들 중 하나에 해당하는지 검사
function isNumInRange(num: number, ranges: NumberRange[]): boolean {
  const activeRanges = ranges.filter(r => r.start.trim() !== '' || r.end.trim() !== '');
  if (activeRanges.length === 0) return true; // 범위 미지정 시 전체 허용

  return activeRanges.some(r => {
    const s = r.start.trim() !== '' ? parseInt(r.start.trim(), 10) : null;
    const e = r.end.trim() !== '' ? parseInt(r.end.trim(), 10) : null;

    if (s !== null && e !== null) {
      return num >= Math.min(s, e) && num <= Math.max(s, e);
    }
    if (s !== null) return num === s;
    if (e !== null) return num <= e;
    return false;
  });
}

export default function TestDataManagerMain() {
  const [selectedGrade, setSelectedGrade] = useState('고1');

  // 원천 DB 상태
  const [rawTree, setRawTree] = useState<ExamLibraryNode[]>([]);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // 🌟 폴더 체크박스 다중 선택 상태 (회차 폴더들 다중 선택용)
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  // 🌟 추출 번호 범위 리스트 상태 (시작번호 ~ 종료번호, +로 추가. 기본값은 비어있음 -> 전체 문항 추출)
  const [numberRanges, setNumberRanges] = useState<NumberRange[]>([]);

  // 🌟 시험 DB 정렬 및 묶음 상태
  const [sortOption, setSortOption] = useState<SortOption>('folder_asc');
  const [groupLevel, setGroupLevel] = useState<GroupLevel>('leaf');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isReordering, setIsReordering] = useState(false);

  // 개별 파일 직접 체크 선택 상태 (기존 방식 지원)
  const [selectedRawFiles, setSelectedRawFiles] = useState<RawFileSelection[]>([]);

  // 시험 DB 상태 (카테고리 & 아이템)
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [bankItems, setBankItems] = useState<TestBankItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // 추출 진행 중 상태
  const [isExtractingToBank, setIsExtractingToBank] = useState(false);

  // 카테고리 모달 상태 (추가 / 수정)
  const [categoryModalMode, setCategoryModalMode] = useState<'create' | 'edit' | null>(null);
  const [categoryModalName, setCategoryModalName] = useState('');
  const [editingCategory, setEditingCategory] = useState<TestCategory | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // 미리보기 모달
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 👯 쌍둥이 문제 상태
  const [twinStore, setTwinStore] = useState<TwinStoreData | null>(null);
  const [detectedTwinFolders, setDetectedTwinFolders] = useState<DetectedTwinFolder[]>([]);
  const [isScanningTwins, setIsScanningTwins] = useState(false);
  const [isSyncingTwins, setIsSyncingTwins] = useState(false);
  const [activeTwinDropdown, setActiveTwinDropdown] = useState<{ folderId: string; qNum: number } | null>(null);

  // 쌍둥이 저장소 로드
  const loadTwinStore = async (grade: string) => {
    try {
      const res = await fetch(`/api/test2/twins?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success && data.store) {
        setTwinStore(data.store);
      }
    } catch (e) {
      console.error('Failed to load twin store:', e);
    }
  };

  // 👯 구글 드라이브 쌍둥이 전체 스캔 (신규 감지)
  const handleScanTwins = async () => {
    try {
      setIsScanningTwins(true);
      const res = await fetch(`/api/test2/twins?grade=${encodeURIComponent(selectedGrade)}&scan=true`);
      const data = await res.json();
      if (data.success) {
        if (data.store) setTwinStore(data.store);
        const detected: DetectedTwinFolder[] = data.detected || [];
        setDetectedTwinFolders(detected);
        const newCount = detected.filter(d => d.has_new).length;
        if (newCount > 0) {
          alert(`✨ ${newCount}개 폴더에서 새로운 쌍둥이 문제 회차가 감지되었습니다!\n좌측 트리의 하이라이트된 폴더를 확인하고 [쌍둥이 동기화]를 진행해주세요.`);
        } else {
          alert(`🔎 감지된 신규 쌍둥이가 없습니다. (총 ${detected.length}개 폴더에 쌍둥이 폴더 연결됨)`);
        }
      } else {
        alert(`쌍둥이 스캔 실패: ${data.error}`);
      }
    } catch (e: any) {
      alert(`쌍둥이 스캔 중 오류 발생: ${e.message}`);
    } finally {
      setIsScanningTwins(false);
    }
  };

  // 👯 쌍둥이 동기화 (특정 폴더 또는 선택된 폴더들)
  const handleSyncTwins = async (targetParentFolderIds?: string[]) => {
    try {
      setIsSyncingTwins(true);
      const res = await fetch('/api/test2/twins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_twins',
          grade: selectedGrade,
          parentFolderIds: targetParentFolderIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 ${data.message || '쌍둥이 문제가 성공적으로 동기화되었습니다!'}`);
        if (data.store) setTwinStore(data.store);
        setDetectedTwinFolders(prev => prev.map(d => {
          if (!targetParentFolderIds || targetParentFolderIds.includes(d.parent_folder_id)) {
            return { ...d, has_new: false };
          }
          return d;
        }));
      } else {
        alert(`쌍둥이 동기화 실패: ${data.error}`);
      }
    } catch (e: any) {
      alert(`쌍둥이 동기화 중 오류 발생: ${e.message}`);
    } finally {
      setIsSyncingTwins(false);
    }
  };

  // 특정 원본 회차 폴더의 특정 문항 번호에 연결된 쌍둥이 목록 조회
  const getQuestionTwins = (folderDriveId: string, qNum: number | null): Array<{ roundName: string; item: TwinQuestionItem }> => {
    if (!twinStore || !folderDriveId || qNum === null) return [];
    const folderData = twinStore.folders[folderDriveId];
    if (!folderData || !folderData.rounds) return [];

    const results: Array<{ roundName: string; item: TwinQuestionItem }> = [];
    Object.entries(folderData.rounds).forEach(([rName, rData]) => {
      const matched = rData.items?.find(it => it.question_number === qNum);
      if (matched) {
        results.push({ roundName: rName, item: matched });
      }
    });

    return results.sort((a, b) => {
      const numA = parseRoundNumber(a.roundName);
      const numB = parseRoundNumber(b.roundName);
      return numA - numB;
    });
  };

  // 시험 DB 카테고리 아이템의 쌍둥이 목록 조회
  const getBankItemTwins = (item: TestBankItem): Array<{ roundName: string; item: TwinQuestionItem }> => {
    if (!twinStore) return [];
    const qNum = item.question_number ?? parseQuestionNum(item.name);
    if (qNum === null) return [];

    for (const fData of Object.values(twinStore.folders || {})) {
      if (
        fData.parent_folder_name === item.folder_name ||
        (item.folder_path && item.folder_path.includes(fData.parent_folder_name))
      ) {
        const results: Array<{ roundName: string; item: TwinQuestionItem }> = [];
        Object.entries(fData.rounds || {}).forEach(([rName, rData]) => {
          const matched = rData.items?.find(it => it.question_number === qNum);
          if (matched) results.push({ roundName: rName, item: matched });
        });
        if (results.length > 0) {
          return results.sort((a, b) => parseRoundNumber(a.roundName) - parseRoundNumber(b.roundName));
        }
      }
    }
    return [];
  };

  // 1. 특정 학년의 원천 DB 로드
  const loadRawLibrary = async (grade: string) => {
    try {
      setLoadingRaw(true);
      setSelectedRawFiles([]);
      setSelectedFolderIds(new Set());
      const res = await fetch(`/api/test2/raw-library?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tree)) {
        // 폴더 및 파일 트리 자연 정렬 (1차 -> 2차 -> ... -> 10차, 1번 -> 2번 ...)
        const sortNodes = (nodes: ExamLibraryNode[]) => {
          nodes.sort((a, b) => {
            const rA = parseRoundNumber(a.name);
            const rB = parseRoundNumber(b.name);
            if (rA !== rB) return rA - rB;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
          });
          nodes.forEach(n => {
            if (n.subFolders?.length > 0) sortNodes(n.subFolders);
            if (n.files?.length > 0) {
              n.files.sort((fa, fb) => {
                const qa = parseQuestionNum(fa.name) ?? 999999;
                const qb = parseQuestionNum(fb.name) ?? 999999;
                if (qa !== qb) return qa - qb;
                return fa.name.localeCompare(fb.name, undefined, { numeric: true });
              });
            }
          });
        };
        sortNodes(data.tree);
        setRawTree(data.tree);
        // 최상위 1~2 레벨 폴더들은 기본 펼치기
        const initialExpanded = new Set<string>();
        data.tree.forEach((node: ExamLibraryNode) => {
          initialExpanded.add(node.drive_id);
          node.subFolders?.forEach(sf => initialExpanded.add(sf.drive_id));
        });
        setExpandedFolders(initialExpanded);
      } else {
        setRawTree([]);
      }
    } catch (e) {
      console.error('Failed to load raw library:', e);
      setRawTree([]);
    } finally {
      setLoadingRaw(false);
    }
  };

  // 2. 특정 학년의 시험 DB (카테고리 & 문항) 로드
  const loadTestBank = async (grade: string) => {
    try {
      setLoadingBank(true);
      const res = await fetch(`/api/test2/bank?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success) {
        const catList = data.categories || [];
        setCategories(catList);
        setBankItems(data.items || []);

        if (catList.length > 0) {
          setSelectedCategoryId((prev) => (catList.some((c: any) => c.id === prev) ? prev : catList[0].id));
        } else {
          setSelectedCategoryId(null);
        }
      }
    } catch (e) {
      console.error('Failed to load test bank:', e);
    } finally {
      setLoadingBank(false);
    }
  };

  // 학년 변경 시 원천 DB & 시험 DB & 쌍둥이 데이터 동시 로드
  useEffect(() => {
    loadRawLibrary(selectedGrade);
    loadTestBank(selectedGrade);
    loadTwinStore(selectedGrade);
  }, [selectedGrade]);

  // 폴더 접기/펼치기
  const toggleFolder = (driveId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  // 🌟 폴더 체크박스 토글 (재귀적으로 하위 폴더도 포함하여 일괄 선택/해제)
  const toggleFolderSelect = (node: ExamLibraryNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const collectFolderIds = (n: ExamLibraryNode): string[] => {
      let ids = [n.drive_id];
      n.subFolders.forEach(sf => {
        ids = [...ids, ...collectFolderIds(sf)];
      });
      return ids;
    };

    const targetIds = collectFolderIds(node);
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(node.drive_id);
      if (isCurrentlySelected) {
        targetIds.forEach(id => next.delete(id));
      } else {
        targetIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 전체 폴더 선택
  const handleSelectAllFolders = () => {
    const allIds: string[] = [];
    const collect = (nodes: ExamLibraryNode[]) => {
      nodes.forEach(n => {
        allIds.push(n.drive_id);
        collect(n.subFolders);
      });
    };
    collect(rawTree);
    setSelectedFolderIds(new Set(allIds));
  };

  // 전체 폴더 선택 해제
  const handleDeselectAllFolders = () => {
    setSelectedFolderIds(new Set());
  };

  // 🌟 추출 번호 범위 관리 함수들 (비어있으면 전체 문제 추출)
  const addNumberRange = () => {
    setNumberRanges(prev => {
      const nextStart = prev.length === 0 ? '1' : '';
      const nextEnd = prev.length === 0 ? '10' : '';
      return [...prev, { id: String(Date.now()), start: nextStart, end: nextEnd }];
    });
  };

  const updateNumberRange = (id: string, field: 'start' | 'end', val: string) => {
    setNumberRanges(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const removeNumberRange = (id: string) => {
    setNumberRanges(prev => prev.filter(r => r.id !== id));
  };

  // 🌟 실시간 매칭 문항 수집 (선택된 폴더 + 번호 범위에 매칭되는 문제들)
  const matchedItemsFromRanges = useMemo(() => {
    if (selectedFolderIds.size === 0) return [];

    const results: Array<{
      drive_id: string;
      name: string;
      grade: string;
      question_image_drive_id?: string | null;
      folder_name: string;
      folder_path: string;
      question_number: number;
      display_name: string;
    }> = [];

    const seenDriveIds = new Set<string>();

    const traverse = (nodes: ExamLibraryNode[], pathAncestors: string[]) => {
      for (const node of nodes) {
        const currentPath = [...pathAncestors, node.name];
        const isThisFolderSelected = selectedFolderIds.has(node.drive_id);

        // 만약 이 폴더가 체크되어 있다면 직속 파일들 검사
        if (isThisFolderSelected && node.files && node.files.length > 0) {
          for (const file of node.files) {
            if (seenDriveIds.has(file.drive_id)) continue;

            const qNum = parseQuestionNum(file.name);
            if (qNum !== null && isNumInRange(qNum, numberRanges)) {
              seenDriveIds.add(file.drive_id);
              results.push({
                drive_id: file.drive_id,
                name: file.name,
                grade: selectedGrade,
                question_image_drive_id: file.question_image_drive_id || null,
                folder_name: node.name,
                folder_path: currentPath.join(" > "),
                question_number: qNum,
                display_name: `[${node.name}] ${qNum}번`,
              });
            }
          }
        }

        // 하위 폴더 재귀 탐색
        if (node.subFolders && node.subFolders.length > 0) {
          traverse(node.subFolders, currentPath);
        }
      }
    };

    traverse(rawTree, []);
    // 🌟 폴더 경로 우선 자연어 정렬 후, 동일 폴더 내에서는 문항 번호 오름차순으로 안정 정렬
    results.sort((a, b) => {
      const pathA = a.folder_path || a.folder_name || '';
      const pathB = b.folder_path || b.folder_name || '';
      if (pathA !== pathB) {
        return compareNatural(pathA, pathB);
      }
      const qA = a.question_number ?? 999999;
      const qB = b.question_number ?? 999999;
      if (qA !== qB) return qA - qB;
      return compareNatural(a.name, b.name);
    });
    return results;
  }, [rawTree, selectedFolderIds, numberRanges, selectedGrade]);

  // 🌟 추출 실행: 선택된 폴더에서 설정한 번호 범위의 문제를 시험 DB 카테고리에 담기
  const handleExtractAndSaveToBank = async () => {
    if (!selectedCategoryId) {
      alert('문제를 담을 시험자료 카테고리를 먼저 선택하거나 생성해주세요.');
      return;
    }
    if (selectedFolderIds.size === 0) {
      alert('문제를 추출할 폴더(회차)를 왼쪽 트리에서 먼저 체크해주세요.');
      return;
    }
    if (matchedItemsFromRanges.length === 0) {
      alert('설정한 번호 범위에 매칭되는 문제 파일이 선택된 폴더에 없습니다. 시작/종료 번호를 확인해주세요.');
      return;
    }

    try {
      setIsExtractingToBank(true);
      const res = await fetch('/api/test2/bank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          items: matchedItemsFromRanges,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 ${data.message || `${matchedItemsFromRanges.length}개 문제가 성공적으로 등록되었습니다.`}`);
        await loadTestBank(selectedGrade);
      } else {
        alert(data.error || '등록 실패');
      }
    } catch (e) {
      alert('시험자료 등록 중 오류가 발생했습니다.');
    } finally {
      setIsExtractingToBank(false);
    }
  };

  // 원천 DB 개별 파일 선택 토글 (수동 개별 선택용)
  const toggleRawFile = (file: RawFileSelection) => {
    setSelectedRawFiles(prev => {
      const exists = prev.some(f => f.drive_id === file.drive_id);
      if (exists) return prev.filter(f => f.drive_id !== file.drive_id);
      return [...prev, file];
    });
  };

  // 폴더 내 모든 파일 일괄 선택 (수동 바구니 담기용)
  const handleSelectAllInFolder = (node: ExamLibraryNode, pathAncestors: string[]) => {
    const collectFiles = (n: ExamLibraryNode, currentP: string[]): RawFileSelection[] => {
      let list: RawFileSelection[] = n.files.map(f => {
        const qNum = parseQuestionNum(f.name);
        return {
          drive_id: f.drive_id,
          name: f.name,
          grade: selectedGrade,
          question_image_drive_id: f.question_image_drive_id ?? null,
          folder_name: n.name,
          folder_path: currentP.join(" > "),
          question_number: qNum,
          display_name: `[${n.name}] ${qNum ? `${qNum}번` : f.name}`,
        };
      });
      n.subFolders.forEach(sf => {
        list = [...list, ...collectFiles(sf, [...currentP, sf.name])];
      });
      return list;
    };

    const folderFiles = collectFiles(node, pathAncestors);
    setSelectedRawFiles(prev => {
      const set = new Set(prev.map(f => f.drive_id));
      const toAdd = folderFiles.filter(f => !set.has(f.drive_id));
      return [...prev, ...toAdd];
    });
  };

  // 카테고리 생성 / 수정 저장
  const handleSaveCategory = async () => {
    if (!categoryModalName.trim()) {
      alert('카테고리 이름을 입력해주세요.');
      return;
    }

    try {
      setIsSavingCategory(true);
      if (categoryModalMode === 'create') {
        const res = await fetch('/api/test2/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_category',
            name: categoryModalName.trim(),
            grade: selectedGrade,
          }),
        });
        const data = await res.json();
        if (data.success) {
          await loadTestBank(selectedGrade);
          setSelectedCategoryId(data.category.id);
          setCategoryModalMode(null);
          setCategoryModalName('');
        } else {
          alert(data.error || '카테고리 생성에 실패했습니다.');
        }
      } else if (categoryModalMode === 'edit' && editingCategory) {
        const res = await fetch('/api/test2/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_category',
            categoryId: editingCategory.id,
            name: categoryModalName.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          await loadTestBank(selectedGrade);
          setCategoryModalMode(null);
          setCategoryModalName('');
          setEditingCategory(null);
        } else {
          alert(data.error || '카테고리 수정에 실패했습니다.');
        }
      }
    } catch (e) {
      alert('카테고리 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = async (cat: TestCategory) => {
    if (!confirm(`'${cat.name}' 카테고리를 정말 삭제하시겠습니까? 등록된 문제 데이터도 함께 정리됩니다.`)) return;

    try {
      const res = await fetch('/api/test2/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_category',
          categoryId: cat.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadTestBank(selectedGrade);
      } else {
        alert(data.error || '삭제 실패');
      }
    } catch (e) {
      alert('카테고리 삭제 중 오류가 발생했습니다.');
    }
  };

  // 개별 체크 선택된 문제들을 시험 DB 카테고리에 담기
  const handleAddSelectedToCategory = async () => {
    if (!selectedCategoryId) {
      alert('문제를 담을 시험자료 카테고리를 먼저 선택하거나 생성해주세요.');
      return;
    }
    if (selectedRawFiles.length === 0) {
      alert('원천 DB에서 카테고리에 담을 문제를 선택해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/test2/bank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          items: selectedRawFiles.map(f => ({
            drive_id: f.drive_id,
            name: f.name,
            grade: selectedGrade,
            question_image_drive_id: f.question_image_drive_id,
            folder_name: f.folder_name,
            folder_path: f.folder_path,
            question_number: f.question_number,
            display_name: f.display_name,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 ${data.message || '시험자료로 등록되었습니다.'}`);
        setSelectedRawFiles([]);
        await loadTestBank(selectedGrade);
      } else {
        alert(data.error || '등록 실패');
      }
    } catch (e) {
      alert('시험자료 등록 중 오류가 발생했습니다.');
    }
  };

  // 시험자료 문항 개별 삭제
  const handleDeleteBankItem = async (item: TestBankItem) => {
    if (!confirm(`'${item.display_name || item.name}' 문제를 이 카테고리에서 제거하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/test2/bank?itemId=${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBankItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        alert(data.error || '제거 실패');
      }
    } catch (e) {
      alert('문제 제거 중 오류가 발생했습니다.');
    }
  };

  // 원본 문제/해설 미리보기
  const handleOpenPreview = async (driveId: string) => {
    setPreviewFileId(driveId);
    setPreviewLoading(true);
    setPreviewHtml(null);

    try {
      const res = await fetch(`/api/drive/library/file?fileId=${encodeURIComponent(driveId)}&type=html`);
      const data = await res.json();
      if (data.success && data.data) {
        setPreviewHtml(data.data);
      }
    } catch (e) {
      console.error('Preview error:', e);
    } finally {
      setPreviewLoading(false);
    }
  };

  // 현재 선택된 카테고리의 아이템 목록
  const currentCategoryItems = useMemo(() => {
    if (!selectedCategoryId) return [];
    return bankItems.filter(item => item.category_id === selectedCategoryId);
  }, [bankItems, selectedCategoryId]);

  // 🌟 폴더별 다단계 묶음 및 정렬된 그룹 목록
  const groupedCategoryItems = useMemo(() => {
    let items = [...currentCategoryItems];

    if (sortOption === 'folder_asc') {
      items.sort((a, b) => {
        const pathA = a.folder_path || a.folder_name || '';
        const pathB = b.folder_path || b.folder_name || '';
        if (pathA !== pathB) {
          return compareNatural(pathA, pathB);
        }
        const qA = a.question_number ?? parseQuestionNum(a.name) ?? 999999;
        const qB = b.question_number ?? parseQuestionNum(b.name) ?? 999999;
        if (qA !== qB) return qA - qB;
        return compareNatural(a.name, b.name);
      });
    } else if (sortOption === 'folder_desc') {
      items.sort((a, b) => {
        const pathA = a.folder_path || a.folder_name || '';
        const pathB = b.folder_path || b.folder_name || '';
        if (pathA !== pathB) {
          return compareNatural(pathB, pathA);
        }
        const qA = a.question_number ?? parseQuestionNum(a.name) ?? 999999;
        const qB = b.question_number ?? parseQuestionNum(b.name) ?? 999999;
        if (qA !== qB) return qA - qB;
        return compareNatural(a.name, b.name);
      });
    }
    // sortOption === 'custom'인 경우 기존 배열 순서 그대로 유지!

    const groups: BankItemGroup[] = [];
    const groupMap = new Map<string, BankItemGroup>();

    items.forEach(item => {
      const { groupKey, groupTitle, fullPath } = getItemGroupInfo(item, groupLevel);
      let g = groupMap.get(groupKey);
      if (!g) {
        g = {
          key: groupKey,
          title: groupTitle,
          fullPath,
          items: [],
        };
        groupMap.set(groupKey, g);
        groups.push(g);
      }
      g.items.push(item);
    });

    return groups;
  }, [currentCategoryItems, sortOption, groupLevel]);

  // 🌟 폴더 블록 단위 위/아래 이동
  const handleMoveGroup = async (groupIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1;
    if (targetIndex < 0 || targetIndex >= groupedCategoryItems.length) return;

    const newGroups = [...groupedCategoryItems];
    const temp = newGroups[groupIndex];
    newGroups[groupIndex] = newGroups[targetIndex];
    newGroups[targetIndex] = temp;

    const reorderedCatItems = newGroups.flatMap(g => g.items);

    // 로컬 상태 즉시 반영 & 정렬 옵션을 'custom'으로 전환
    setBankItems(prev => {
      const others = prev.filter(i => i.category_id !== selectedCategoryId);
      return [...others, ...reorderedCatItems];
    });
    setSortOption('custom');

    // Supabase 영구 저장
    if (selectedCategoryId) {
      try {
        setIsReordering(true);
        await fetch('/api/test2/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reorder_items',
            categoryId: selectedCategoryId,
            orderedItemIds: reorderedCatItems.map(i => i.id),
          }),
        });
      } catch (e) {
        console.error('Failed to save reordered items:', e);
      } finally {
        setIsReordering(false);
      }
    }
  };

  // 🌟 그룹 아코디언 토글
  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const handleToggleAllGroups = () => {
    if (collapsedGroups.size > 0) {
      setCollapsedGroups(new Set()); // 모두 펼치기
    } else {
      setCollapsedGroups(new Set(groupedCategoryItems.map(g => g.key))); // 모두 접기
    }
  };

  // 🌟 폴더 그룹 내 전체 문제 일괄 삭제
  const handleDeleteGroupItems = async (group: BankItemGroup) => {
    if (!confirm(`'${group.title}' 폴더의 모든 문제 (${group.items.length}개)를 카테고리에서 삭제하시겠습니까?`)) {
      return;
    }

    const idsToDelete = new Set(group.items.map(i => i.id));
    setBankItems(prev => prev.filter(i => !idsToDelete.has(i.id)));

    if (selectedCategoryId) {
      try {
        await fetch('/api/test2/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_batch',
            itemIds: group.items.map(i => i.id),
          }),
        });
      } catch (e) {
        console.error('Failed to delete group items:', e);
      }
    }
  };

  const activeCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  // 🌟 원천 DB 트리 렌더러 (폴더 체크박스 + 회차 정보 연동)
  const renderRawTree = (nodes: ExamLibraryNode[], depth = 0, parentPath: string[] = []) => {
    return (
      <div className={`space-y-1 ${depth > 0 ? 'ml-3 pl-2.5 border-l border-slate-200' : ''}`}>
        {nodes.map(node => {
          const isFolder = node.type === 'folder';
          const isExpanded = expandedFolders.has(node.drive_id);
          const isFolderSelected = selectedFolderIds.has(node.drive_id);
          const hasChildren = (node.subFolders && node.subFolders.length > 0) || (node.files && node.files.length > 0);
          const currentPath = [...parentPath, node.name];

          if (isFolder) {
            return (
              <div key={node.drive_id} className="text-xs">
                {/* 폴더 행 */}
                {/* 폴더 행 */}
                {(() => {
                  const detected = detectedTwinFolders.find(d => d.parent_folder_id === node.drive_id);
                  const existingFolderData = twinStore?.folders?.[node.drive_id];
                  const syncedRounds = existingFolderData ? Object.keys(existingFolderData.rounds || {}) : [];
                  const hasNewTwin = !!detected?.has_new;

                  return (
                    <div
                      className={`flex items-center justify-between p-1.5 rounded-xl transition-all cursor-pointer select-none group ${
                        isFolderSelected 
                          ? 'bg-indigo-50/90 border border-indigo-200/90 shadow-2xs' 
                          : hasNewTwin
                          ? 'bg-purple-50/60 border border-purple-300 shadow-2xs'
                          : 'hover:bg-slate-100 border border-transparent'
                      }`}
                      onClick={() => toggleFolder(node.drive_id)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* 펼침 토글 버튼 */}
                        {hasChildren ? (
                          isExpanded ? (
                            <ChevronDown size={14} className="text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-slate-400 shrink-0" />
                          )
                        ) : (
                          <div className="w-3.5 shrink-0" />
                        )}

                        {/* 🌟 폴더 체크박스: 클릭 시 구간 추출 대상에 포함 */}
                        <div
                          onClick={(e) => toggleFolderSelect(node, e)}
                          className="p-1 hover:bg-white/80 rounded-md cursor-pointer transition-colors shrink-0"
                          title={isFolderSelected ? "폴더 선택 해제" : "폴더 선택 (구간 추출 대상)"}
                        >
                          {isFolderSelected ? (
                            <CheckSquare size={16} className="text-indigo-600 shrink-0" />
                          ) : (
                            <Square size={16} className="text-slate-300 hover:text-indigo-500 shrink-0" />
                          )}
                        </div>

                        {/* 폴더 아이콘 */}
                        {isExpanded ? (
                          <FolderOpen size={16} className={hasNewTwin ? "text-purple-600 shrink-0" : "text-amber-500 shrink-0"} />
                        ) : (
                          <Folder size={16} className={hasNewTwin ? "text-purple-600 shrink-0" : "text-amber-500 shrink-0"} />
                        )}

                        {/* 폴더 이름 */}
                        <span className={`font-bold truncate ${isFolderSelected ? 'text-indigo-950 font-black' : hasNewTwin ? 'text-purple-950 font-black' : 'text-slate-700'}`}>
                          {node.name}
                        </span>

                        {/* 카운트 배지 */}
                        <span className="text-[10px] text-slate-400 font-normal shrink-0">
                          ({node.subFolders?.length > 0 ? `${node.subFolders.length}폴더 ` : ''}{node.files?.length || 0}문제)
                        </span>

                        {/* 신규 쌍둥이 감지 뱃지 */}
                        {hasNewTwin && (
                          <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-md text-[9px] font-black shrink-0 animate-pulse flex items-center gap-0.5 shadow-2xs">
                            <Sparkles size={10} />
                            NEW 쌍둥이 {detected?.detected_rounds?.length || 1}회차 감지
                          </span>
                        )}

                        {/* 이미 동기화된 쌍둥이 뱃지 */}
                        {!hasNewTwin && syncedRounds.length > 0 && (
                          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-700 border border-purple-200 rounded text-[9px] font-bold shrink-0">
                            👯 쌍둥이 {syncedRounds.length}회차
                          </span>
                        )}

                        {isFolderSelected && (
                          <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[9px] font-black shrink-0 ml-1">
                            추출선택
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* 쌍둥이 빠른 동기화 버튼 (감지되었거나 이미 쌍둥이가 있는 경우) */}
                        {(hasNewTwin || syncedRounds.length > 0) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncTwins([node.drive_id]);
                            }}
                            disabled={isSyncingTwins}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                              hasNewTwin
                                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-2xs'
                                : 'opacity-0 group-hover:opacity-100 bg-purple-50 hover:bg-purple-100 text-purple-700'
                            }`}
                            title="이 폴더의 쌍둥이 문제 동기화"
                          >
                            <RefreshCw size={10} className={isSyncingTwins ? "animate-spin" : ""} />
                            <span>{hasNewTwin ? '쌍둥이 동기화' : '재동기화'}</span>
                          </button>
                        )}

                        {/* 폴더 파일 일괄 담기 버튼 */}
                        {node.files && node.files.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSelectAllInFolder(node, currentPath); }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded text-[10px] font-bold transition-all shrink-0 ml-1"
                            title="이 폴더의 모든 문제를 수동 선택 바구니에 담기"
                          >
                            + 수동 담기
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 하위 폴더 및 파일 목록 */}
                {isExpanded && (
                  <div className="mt-1">
                    {node.subFolders && node.subFolders.length > 0 && renderRawTree(node.subFolders, depth + 1, currentPath)}
                    
                    {node.files && node.files.length > 0 && (
                      <div className="ml-5 pl-2 border-l border-slate-200 space-y-1 mt-1">
                        {node.files.map(fileNode => {
                          const isSelected = selectedRawFiles.some(f => f.drive_id === fileNode.drive_id);
                          const qNum = parseQuestionNum(fileNode.name);
                          const twins = getQuestionTwins(node.drive_id, qNum);
                          const isDropdownOpen = activeTwinDropdown?.folderId === node.drive_id && activeTwinDropdown?.qNum === qNum;

                          return (
                            <div
                              key={fileNode.drive_id}
                              onClick={() => toggleRawFile({
                                drive_id: fileNode.drive_id,
                                name: fileNode.name,
                                grade: selectedGrade,
                                question_image_drive_id: fileNode.question_image_drive_id,
                                folder_name: node.name,
                                folder_path: currentPath.join(" > "),
                                question_number: qNum,
                                display_name: `[${node.name}] ${qNum ? `${qNum}번` : fileNode.name}`,
                              })}
                              className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                isSelected ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200' : 'hover:bg-slate-100 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                {isSelected ? (
                                  <CheckSquare size={15} className="text-indigo-600 shrink-0" />
                                ) : (
                                  <Square size={15} className="text-slate-300 shrink-0" />
                                )}
                                <FileText size={14} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                                
                                {qNum && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[10px] font-black shrink-0">
                                    {qNum}번
                                  </span>
                                )}
                                
                                <span className="truncate">{fileNode.name}</span>

                                {/* 👯 쌍둥이 보유 뱃지 및 드롭다운 (스샷 1번 영역) */}
                                {twins.length > 0 && (
                                  <div className="relative shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => setActiveTwinDropdown(isDropdownOpen ? null : { folderId: node.drive_id, qNum: qNum! })}
                                      className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-md text-[10px] font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                      title="클릭하여 쌍둥이 문제 회차별 미리보기"
                                    >
                                      <span>👯 쌍둥이 {twins.length}개</span>
                                      <ChevronDown size={10} className={isDropdownOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                                    </button>

                                    {/* 회차별 쌍둥이 팝업 드롭다운 */}
                                    {isDropdownOpen && (
                                      <div className="absolute left-0 top-full mt-1.5 z-40 bg-white border border-purple-200 rounded-xl shadow-xl p-2 w-48 space-y-1 animate-in fade-in zoom-in-95">
                                        <div className="text-[10px] font-bold text-slate-400 px-1 pb-1 border-b border-slate-100 flex items-center justify-between">
                                          <span>쌍둥이 문제 회차</span>
                                          <span className="text-purple-600">{twins.length}개 보유</span>
                                        </div>
                                        {twins.map(tw => (
                                          <button
                                            key={tw.roundName}
                                            type="button"
                                            onClick={() => {
                                              setActiveTwinDropdown(null);
                                              handleOpenPreview(tw.item.drive_id);
                                            }}
                                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-purple-50 text-slate-700 hover:text-purple-700 text-xs font-bold transition-colors flex items-center justify-between group"
                                          >
                                            <span>[{tw.roundName} 쌍둥이]</span>
                                            <span className="text-[10px] text-slate-400 group-hover:text-purple-600 flex items-center gap-0.5">
                                              <Eye size={11} /> 열기
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleOpenPreview(fileNode.drive_id); }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors shrink-0"
                                  title="원본 문제/해설 미리보기"
                                >
                                  <Eye size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 헤더 & 학년 선택 탭 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-indigo-200">
              <Layers size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              테스트자료 관리
            </h1>
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full font-bold">
              원천 DB 선별 & 시험 DB 구축 센터
            </span>
          </div>
          <p className="text-xs md:text-sm font-medium text-slate-500">
            구글 드라이브에서 동기화된 우리 DB 전체(원천 DB)에서 <strong>실제 시험에 사용할 문제들만 선별</strong>하여 카테고리별 시험 DB로 구축합니다.
          </p>
        </div>

        {/* 학년 선택 탭 */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
          {GRADES.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                selectedGrade === g
                  ? 'bg-white text-indigo-600 shadow-sm scale-105'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* 🌟 2. [신규 핵심 기능] 문항 번호 구간 일괄 추출기 바 */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 border-2 border-indigo-200/80 rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <span>문항 번호 구간 일괄 추출기</span>
                <span className="text-[11px] px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                  회차 메타데이터 자동 연동
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                좌측에서 회차 폴더(예: <strong>1차~11차</strong>)들을 체크하고, <strong>추출할 번호 구간</strong>을 설정한 뒤 추출 버튼을 누르면 시험 DB에 회차 정보와 함께 쏙 들어갑니다!
              </p>
            </div>
          </div>

          {/* 선택 현황 요약 배지들 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-2xs flex items-center gap-1.5">
              <Folder size={14} className="text-indigo-600" />
              <span>체크된 폴더:</span>
              <strong className="text-indigo-600 font-black">{selectedFolderIds.size}개</strong>
            </span>
            <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-2xs flex items-center gap-1.5">
              <FileCheckIcon size={14} className="text-violet-600" />
              <span>추출 예상 문항:</span>
              <strong className="text-violet-600 font-black">{matchedItemsFromRanges.length}문제</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          {/* 번호 구간 설정 컨트롤 */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Filter size={14} className="text-indigo-600" />
                <span>추출 번호 리스트 (시작번호 ~ 종료번호)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                * 구간을 여러 개 추가하여 불연속 번호(예: 1~5번, 10~15번)도 일괄 추출 가능합니다.
              </span>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {numberRanges.length === 0 ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-700 shadow-2xs">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>전체 문항 추출 모드 (선택된 폴더의 모든 번호가 일괄 추출됩니다)</span>
                </div>
              ) : (
                numberRanges.map((range, idx) => (
                  <div
                    key={range.id}
                    className="flex items-center gap-1.5 bg-white border border-indigo-200 px-3 py-1.5 rounded-2xl shadow-2xs group"
                  >
                    <span className="text-[11px] font-bold text-slate-400">구간 {idx + 1}:</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="시작"
                      value={range.start}
                      onChange={e => updateNumberRange(range.id, 'start', e.target.value)}
                      className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-indigo-700 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
                    />
                    <span className="text-xs font-black text-slate-400">~</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="종료"
                      value={range.end}
                      onChange={e => updateNumberRange(range.id, 'end', e.target.value)}
                      className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-indigo-700 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
                    />
                    <span className="text-xs font-bold text-slate-600">번</span>

                    <button
                      type="button"
                      onClick={() => removeNumberRange(range.id)}
                      className="ml-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition-colors cursor-pointer"
                      title="이 구간 삭제 (전체 추출 모드로 복귀)"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={addNumberRange}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-dashed border-indigo-300 rounded-2xl text-xs font-black transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus size={14} strokeWidth={3} />
                <span>{numberRanges.length === 0 ? '번호 구간 설정' : '구간 추가'}</span>
              </button>
            </div>
          </div>

          {/* 대상 카테고리 정보 및 추출 실행 버튼 */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="text-xs text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-2xs">
              <div className="text-[10px] text-slate-400 font-bold">대상 시험 DB 카테고리</div>
              <div className="font-black text-indigo-600 truncate max-w-[220px]">
                {activeCategory ? activeCategory.name : '(우측에서 카테고리 선택 필요)'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExtractAndSaveToBank}
              disabled={isExtractingToBank || !activeCategory || selectedFolderIds.size === 0 || matchedItemsFromRanges.length === 0}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:hover:from-indigo-600 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isExtractingToBank ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>시험 DB로 추출 등록 중...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>
                    {selectedFolderIds.size > 0
                      ? `${selectedFolderIds.size}개 폴더에서 ${matchedItemsFromRanges.length}개 문제 추출 담기`
                      : '왼쪽 폴더를 체크해주세요'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. 메인 2분할 레이아웃: 좌측(원천 DB) + 중앙 액션 + 우측(시험 DB) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── 좌측: 원천 DB 탐색기 (우리 DB 전체) ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 min-h-[650px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <FolderOpen size={18} className="text-amber-500" />
                <span>{selectedGrade} 원천 DB 라이브러리</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                폴더 체크박스를 선택하면 상단의 [구간 일괄 추출기]로 한번에 담을 수 있습니다.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* 👯 쌍둥이 스캔 버튼 */}
              <button
                type="button"
                onClick={handleScanTwins}
                disabled={isScanningTwins}
                className="px-3 py-1.5 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="구글 드라이브에서 새로운 쌍둥이 문제 폴더가 있는지 감지합니다"
              >
                {isScanningTwins ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>스캔 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>👯 쌍둥이 스캔</span>
                  </>
                )}
              </button>

              {/* 선택된 폴더 쌍둥이 동기화 버튼 */}
              {selectedFolderIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleSyncTwins(Array.from(selectedFolderIds))}
                  disabled={isSyncingTwins}
                  className="px-3 py-1.5 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-black rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="선택한 회차 폴더의 쌍둥이 문제를 동기화합니다"
                >
                  {isSyncingTwins ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>동기화 중...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} />
                      <span>선택 폴더 쌍둥이 동기화</span>
                    </>
                  )}
                </button>
              )}

              {/* 폴더 전체 선택/해제 */}
              <button
                type="button"
                onClick={handleSelectAllFolders}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                title="모든 폴더 체크"
              >
                전체 폴더 선택
              </button>

              {selectedFolderIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAllFolders}
                  className="px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-50 font-bold rounded-xl transition-colors"
                >
                  선택 해제 ({selectedFolderIds.size})
                </button>
              )}

              {selectedRawFiles.length > 0 && (
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                  수동 선택: {selectedRawFiles.length}개
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[550px] pr-2 scrollbar-thin">
            {loadingRaw ? (
              <div className="py-24 text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto" />
                <p className="text-xs text-slate-400 font-bold">{selectedGrade} 원천 라이브러리를 동기화 중...</p>
              </div>
            ) : rawTree.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-slate-400">
                <AlertCircle size={32} className="mx-auto opacity-40 text-amber-500" />
                <p className="text-xs font-bold">{selectedGrade}에 등록된 원천 DB 파일이 없습니다.</p>
                <p className="text-[11px]">대시보드의 라이브러리 동기화에서 {selectedGrade}를 동기화해주세요.</p>
              </div>
            ) : (
              renderRawTree(rawTree)
            )}
          </div>
        </div>

        {/* ── 우측: 시험 DB 카테고리 & 등록된 시험자료 관리 ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5 min-h-[650px] flex flex-col">
          
          {/* 상단 카테고리 헤더 & 카테고리 추가 버튼 */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                <span>{selectedGrade} 시험 DB (카테고리별 구축)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                실제 시험지 제작에 노출될 선별된 문제 저장소입니다.
              </p>
            </div>

            <button
              onClick={() => {
                setCategoryModalMode('create');
                setCategoryModalName('');
                setEditingCategory(null);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-200"
            >
              <Plus size={15} strokeWidth={3} />
              카테고리 추가
            </button>
          </div>

          {/* 카테고리 칩 목록 */}
          {categories.length === 0 ? (
            <div className="bg-indigo-50/50 border border-dashed border-indigo-200 rounded-2xl p-6 text-center space-y-2">
              <p className="text-xs font-black text-indigo-700">생성된 시험 카테고리가 없습니다.</p>
              <p className="text-[11px] text-slate-500">
                [+ 카테고리 추가] 버튼을 눌러 카테고리(예: '공수2A - 중간대비 모음')를 먼저 만들어주세요.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map(cat => {
                const isSelected = selectedCategoryId === cat.id;
                const count = bankItems.filter(i => i.category_id === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer select-none shrink-0 border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 scale-102'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {count}
                    </span>

                    {/* 카테고리 수정 & 삭제 */}
                    <div className="flex items-center ml-1 gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setEditingCategory(cat);
                          setCategoryModalName(cat.name);
                          setCategoryModalMode('edit');
                        }}
                        className={`p-0.5 rounded hover:bg-white/20 transition-colors ${isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-700'}`}
                        title="카테고리 이름 수정"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className={`p-0.5 rounded hover:bg-rose-500 hover:text-white transition-colors ${isSelected ? 'text-white' : 'text-slate-400 hover:text-rose-600'}`}
                        title="카테고리 삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 중앙 담기 액션 바 (수동으로 개별 선택한 문제 담기) */}
          {selectedRawFiles.length > 0 && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
              <div className="text-xs text-indigo-900">
                수동 선택된 문제: <strong className="font-black text-indigo-700">{selectedRawFiles.length}개</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedRawFiles([])}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600"
                >
                  비우기
                </button>
                <button
                  onClick={handleAddSelectedToCategory}
                  disabled={!activeCategory}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>수동 선택 문제 담기</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* 🌟 선택된 카테고리에 등록된 시험 문제 리스트 (회차 정보 및 문항 번호 강조 표시) */}
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 font-bold px-1">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>등록된 문제 ({currentCategoryItems.length}개)</span>
                {activeCategory && <span className="text-indigo-600 font-black">[{activeCategory.name}]</span>}
                {isReordering && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                    <Loader2 size={10} className="animate-spin" /> 순서 저장 중...
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400">* [테스트 관리] 시험지 제작 시 라이브러리에 연동됩니다</span>
            </div>

            {/* 🌟 신규 컨트롤 툴바: 정렬 기준 / 묶음 단위 / 모두 접기&펼치기 */}
            {currentCategoryItems.length > 0 && (
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 정렬 셀렉트 */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-bold">정렬:</span>
                    <select
                      value={sortOption}
                      onChange={e => setSortOption(e.target.value as SortOption)}
                      className="bg-transparent font-black text-slate-700 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="folder_asc">📁 폴더명 오름차순 (5.1 → 5.10)</option>
                      <option value="folder_desc">📁 폴더명 내림차순 (5.10 → 5.1)</option>
                      <option value="custom">✋ 사용자 직접 배치 순서</option>
                    </select>
                  </div>

                  {/* 묶음 단위 셀렉트 (얼터너티브 다단계) */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-bold">묶음 기준:</span>
                    <select
                      value={groupLevel}
                      onChange={e => setGroupLevel(e.target.value as GroupLevel)}
                      className="bg-transparent font-black text-indigo-700 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="leaf">📂 최하위 폴더 (소단원 / 회차)</option>
                      <option value="parent1">📁 바로 위 1단계 (단원)</option>
                      <option value="parent2">🏢 그 위 2단계 (교재 / 출판사)</option>
                    </select>
                  </div>
                </div>

                {/* 모두 접기 / 펼치기 버튼 */}
                <button
                  type="button"
                  onClick={handleToggleAllGroups}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  {collapsedGroups.size > 0 ? (
                    <>
                      <FolderOpen size={12} className="text-indigo-600" />
                      <span>모두 펼치기</span>
                    </>
                  ) : (
                    <>
                      <Folder size={12} className="text-slate-500" />
                      <span>모두 접기</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto max-h-[440px] space-y-3 pr-1 scrollbar-thin">
              {currentCategoryItems.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 space-y-2">
                  <CheckSquare size={28} className="mx-auto opacity-30" />
                  <p>이 카테고리에 등록된 시험 문제가 없습니다.</p>
                  <p className="text-[11px] text-slate-400">
                    상단의 <strong>[문항 번호 구간 일괄 추출기]</strong>를 사용하여 문제를 채워주세요.
                  </p>
                </div>
              ) : (
                groupedCategoryItems.map((group, groupIdx) => {
                  const isCollapsed = collapsedGroups.has(group.key);

                  return (
                    <div
                      key={group.key}
                      className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs transition-all"
                    >
                      {/* 🗂️ 폴더 그룹 헤더 카드 (순서 이동 버튼 포함) */}
                      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gradient-to-r from-slate-50/90 via-indigo-50/30 to-slate-50/90 border-b border-slate-100">
                        <div
                          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none"
                          onClick={() => toggleGroupCollapse(group.key)}
                        >
                          <div className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs shrink-0">
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </div>

                          <div className="flex items-center gap-1.5 min-w-0">
                            {isCollapsed ? (
                              <Folder size={15} className="text-slate-400 shrink-0" />
                            ) : (
                              <FolderOpen size={15} className="text-indigo-600 shrink-0" />
                            )}
                            <span className="font-black text-slate-800 text-xs truncate">
                              {group.title}
                            </span>
                            {group.fullPath && group.fullPath !== group.title && (
                              <span className="text-[10px] text-slate-400 truncate hidden md:inline" title={group.fullPath}>
                                ({group.fullPath})
                              </span>
                            )}
                          </div>

                          <span className="px-2 py-0.5 bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-full text-[10px] font-black shrink-0">
                            {group.items.length}문제
                          </span>
                        </div>

                        {/* 🌟 폴더 블록 단위 위/아래 이동 및 일괄 삭제 */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleMoveGroup(groupIdx, 'up')}
                            disabled={groupIdx === 0}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                            title="폴더 블록을 위로 이동"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveGroup(groupIdx, 'down')}
                            disabled={groupIdx === groupedCategoryItems.length - 1}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                            title="폴더 블록을 아래로 이동"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroupItems(group)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer"
                            title="이 폴더의 문제 일괄 제거"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* 📄 폴더 내 문제 아이템 목록 */}
                      {!isCollapsed && (
                        <div className="p-2 space-y-1.5 bg-white">
                          {group.items.map((item, itemIdx) => {
                            const fallbackNum = parseQuestionNum(item.name);
                            const displayNum = item.question_number ?? fallbackNum;

                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-indigo-50/50 hover:border-indigo-100 transition-colors text-xs group"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {/* 번호 인덱스 */}
                                  <span className="w-5 h-5 rounded-md bg-white text-slate-500 font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-200">
                                    {itemIdx + 1}
                                  </span>

                                  {/* 회차 정보 배지 */}
                                  {item.folder_name && item.folder_name !== group.title ? (
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[10px] font-black shrink-0 flex items-center gap-0.5">
                                      <Folder size={10} className="text-indigo-600" />
                                      <span>{item.folder_name}</span>
                                    </span>
                                  ) : null}

                                  {/* 문제 번호 배지 */}
                                  {displayNum ? (
                                    <span className="px-2 py-0.5 bg-violet-100 text-violet-800 border border-violet-200 rounded-md text-xs font-black shrink-0">
                                      {displayNum}번
                                    </span>
                                  ) : null}

                                  {/* 파일명 */}
                                  <span className="font-bold text-slate-700 truncate">
                                    {item.name}
                                  </span>

                                  {/* 쌍둥이 배지 & 미리보기 드롭다운 */}
                                  {(() => {
                                    const bankTwins = getBankItemTwins(item);
                                    const isDropdownOpen = activeTwinDropdown?.folderId === `bank_${item.id}` && activeTwinDropdown?.qNum === (displayNum || 0);

                                    if (bankTwins.length === 0) return null;
                                    return (
                                      <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => setActiveTwinDropdown(isDropdownOpen ? null : { folderId: `bank_${item.id}`, qNum: displayNum || 0 })}
                                          className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-md text-[10px] font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                          title="클릭하여 쌍둥이 문제 회차별 미리보기"
                                        >
                                          <span>👯 쌍둥이 {bankTwins.length}개</span>
                                          <ChevronDown size={10} className={isDropdownOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                                        </button>

                                        {isDropdownOpen && (
                                          <div className="absolute left-0 top-full mt-1.5 z-40 bg-white border border-purple-200 rounded-xl shadow-xl p-2 w-48 space-y-1 animate-in fade-in zoom-in-95">
                                            <div className="text-[10px] font-bold text-slate-400 px-1 pb-1 border-b border-slate-100 flex items-center justify-between">
                                              <span>쌍둥이 문제 회차</span>
                                              <span className="text-purple-600">{bankTwins.length}개 보유</span>
                                            </div>
                                            {bankTwins.map(tw => (
                                              <button
                                                key={tw.roundName}
                                                type="button"
                                                onClick={() => {
                                                  setActiveTwinDropdown(null);
                                                  handleOpenPreview(tw.item.drive_id);
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-purple-50 text-slate-700 hover:text-purple-700 text-xs font-bold transition-colors flex items-center justify-between group cursor-pointer"
                                              >
                                                <span>[{tw.roundName} 쌍둥이]</span>
                                                <span className="text-[10px] text-slate-400 group-hover:text-purple-600 flex items-center gap-0.5">
                                                  <Eye size={11} /> 열기
                                                </span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>

                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                  <button
                                    onClick={() => handleOpenPreview(item.drive_id)}
                                    className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                                  >
                                    <Eye size={11} />
                                    보기
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBankItem(item)}
                                    className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                    title="카테고리에서 제거"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* 4. 카테고리 추가 / 수정 모달 */}
      {categoryModalMode && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-800 text-base">
                {categoryModalMode === 'create' ? '새 시험 카테고리 추가' : '카테고리 이름 수정'}
              </h3>
              <button
                onClick={() => setCategoryModalMode(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  대상 학년
                </label>
                <input
                  type="text"
                  value={selectedGrade}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 font-bold text-slate-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  카테고리 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={categoryModalName}
                  onChange={e => setCategoryModalName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                  placeholder="예: 공수2A - 중간대비 모음, 단원평가 등"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 font-bold text-slate-800 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCategoryModalMode(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={isSavingCategory}
                className="px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-1.5"
              >
                {isSavingCategory && <Loader2 size={13} className="animate-spin" />}
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 문제 미리보기 모달 */}
      {previewFileId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-4xl h-[85vh] flex flex-col shadow-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <span className="text-sm font-black text-white">문제/해설 미리보기</span>
              <button
                onClick={() => { setPreviewFileId(null); setPreviewHtml(null); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500 text-slate-300 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-white p-2 overflow-hidden relative">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                  <Loader2 size={36} className="animate-spin text-indigo-600" />
                </div>
              )}
              {previewHtml && (
                <iframe srcDoc={previewHtml} className="w-full h-full border-0 rounded-2xl" title="Preview" />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// 아이콘 헬퍼
function FileCheckIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="m9 15 2 2 4-4"/>
    </svg>
  );
}
