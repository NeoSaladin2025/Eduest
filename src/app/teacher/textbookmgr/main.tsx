'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Layers,
  FolderTree,
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
  Filter,
  CheckCircle2,
  RefreshCw,
  Copy,
  ExternalLink,
  BookMarked,
  ListPlus,
  MoveVertical
} from 'lucide-react';
import { ExamLibraryNode } from '@/lib/examLibraryTree';
import { Textbook, MajorUnit, MinorUnit, TextbookItem } from '@/lib/textbookTypes';

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
  folder_id?: string;
  folder_name?: string;
  folder_path?: string;
  question_number?: number | null;
  display_name?: string;
}

// 파일명에서 가장 마지막 연속된 숫자를 문항 번호로 파싱 (예: "0001.html" -> 1, "10차_05.html" -> 5)
function parseQuestionNum(fileName: string): number | null {
  const match = fileName.match(/(\d+)(?:\.[^.]+)?$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

export default function TextbookDataManagerMain() {
  // 1. 학년 상태
  const [selectedGrade, setSelectedGrade] = useState<string>('중2');

  // 2. 원천 라이브러리 상태
  const [rawTree, setRawTree] = useState<ExamLibraryNode[]>([]);
  const [loadingRaw, setLoadingRaw] = useState<boolean>(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 3. 문항 구간 추출기 상태
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [numberRanges, setNumberRanges] = useState<NumberRange[]>([
    { id: 'default', start: '1', end: '15' }
  ]);
  const [selectedRawFiles, setSelectedRawFiles] = useState<RawFileSelection[]>([]);

  // 4. 교재 DB 상태
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [allItems, setAllItems] = useState<TextbookItem[]>([]);
  const [loadingTextbooks, setLoadingTextbooks] = useState<boolean>(true);
  const [selectedTextbookId, setSelectedTextbookId] = useState<string | null>(null);

  // 5. 현재 매핑 타깃 소단원 상태 (우측에서 선택된 소단원)
  const [activeTargetMinorId, setActiveTargetMinorId] = useState<string | null>(null);
  const [activeTargetMajorId, setActiveTargetMajorId] = useState<string | null>(null);

  // 6. 대단원 접기/펼치기 상태
  const [collapsedMajorUnits, setCollapsedMajorUnits] = useState<Set<string>>(new Set());

  // 7. 진행 상태 플래그
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // 8. 모달 상태
  const [isBookModalOpen, setIsBookModalOpen] = useState<boolean>(false);
  const [bookModalMode, setBookModalMode] = useState<'create' | 'edit'>('create');
  const [bookModalName, setBookModalName] = useState<string>('');
  const [bookModalGrade, setBookModalGrade] = useState<string>('중2');
  const [bookModalDesc, setBookModalDesc] = useState<string>('');

  const [isMajorModalOpen, setIsMajorModalOpen] = useState<boolean>(false);
  const [majorModalMode, setMajorModalMode] = useState<'create' | 'edit'>('create');
  const [majorModalName, setMajorModalName] = useState<string>('');
  const [targetMajorForEdit, setTargetMajorForEdit] = useState<MajorUnit | null>(null);

  const [isMinorModalOpen, setIsMinorModalOpen] = useState<boolean>(false);
  const [minorModalMode, setMinorModalMode] = useState<'create' | 'edit'>('create');
  const [minorModalName, setMinorModalName] = useState<string>('');
  const [targetMinorForEdit, setTargetMinorForEdit] = useState<MinorUnit | null>(null);
  const [parentMajorForMinor, setParentMajorForMinor] = useState<string | null>(null);

  const [isBatchOutlineOpen, setIsBatchOutlineOpen] = useState<boolean>(false);
  const [batchOutlineText, setBatchOutlineText] = useState<string>('');

  // 9. 미리보기 상태
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // ── 데이터 로드 함수들 ──
  const fetchRawLibrary = async (grade: string) => {
    setLoadingRaw(true);
    try {
      const res = await fetch(`/api/test2/raw-library?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tree)) {
        setRawTree(data.tree);
        // 기본 1단계 폴더 자동 펼침
        const initialExpanded = new Set<string>();
        data.tree.slice(0, 5).forEach((n: ExamLibraryNode) => initialExpanded.add(n.drive_id));
        setExpandedFolders(initialExpanded);
      } else {
        setRawTree([]);
      }
    } catch (e) {
      console.error('원천 라이브러리 로드 실패:', e);
      setRawTree([]);
    } finally {
      setLoadingRaw(false);
    }
  };

  const fetchTextbookData = async (grade: string) => {
    setLoadingTextbooks(true);
    try {
      const res = await fetch(`/api/textbook/bank?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.textbooks)) {
        setTextbooks(data.textbooks);
        setAllItems(data.items || []);

        // 현재 선택된 교재 유지 또는 첫 번째 교재 자동 선택
        if (data.textbooks.length > 0) {
          const matched = data.textbooks.find((t: Textbook) => t.id === selectedTextbookId);
          const currentBook = matched || data.textbooks[0];
          setSelectedTextbookId(currentBook.id);

          // 첫 번째 소단원 자동 타깃 선택
          if (currentBook.major_units?.length > 0) {
            const firstMaj = currentBook.major_units[0];
            if (firstMaj.minor_units?.length > 0) {
              setActiveTargetMajorId(firstMaj.id);
              setActiveTargetMinorId(firstMaj.minor_units[0].id);
            }
          }
        } else {
          setSelectedTextbookId(null);
          setActiveTargetMajorId(null);
          setActiveTargetMinorId(null);
        }
      }
    } catch (e) {
      console.error('교재 데이터 로드 실패:', e);
    } finally {
      setLoadingTextbooks(false);
    }
  };

  useEffect(() => {
    fetchRawLibrary(selectedGrade);
    fetchTextbookData(selectedGrade);
    setSelectedFolderIds(new Set());
    setSelectedRawFiles([]);
  }, [selectedGrade]);

  // 현재 활성 교재
  const currentTextbook = useMemo(() => {
    return textbooks.find((t) => t.id === selectedTextbookId) || null;
  }, [textbooks, selectedTextbookId]);

  // 현재 활성 교재에 수록된 문항들
  const currentTextbookItems = useMemo(() => {
    if (!selectedTextbookId) return [];
    return allItems.filter((i) => i.textbook_id === selectedTextbookId);
  }, [allItems, selectedTextbookId]);

  // 현재 활성 타깃 소단원 정보
  const activeTargetInfo = useMemo(() => {
    if (!currentTextbook || !activeTargetMinorId) return null;
    for (const maj of currentTextbook.major_units || []) {
      const min = (maj.minor_units || []).find((m) => m.id === activeTargetMinorId);
      if (min) {
        return {
          bookName: currentTextbook.name,
          majorId: maj.id,
          majorName: maj.name,
          minorId: min.id,
          minorName: min.name,
        };
      }
    }
    return null;
  }, [currentTextbook, activeTargetMinorId]);

  // 원천 트리에서 폴더 맵 구축
  const rawFolderMap = useMemo(() => {
    const map = new Map<string, ExamLibraryNode>();
    function traverse(nodes: ExamLibraryNode[]) {
      nodes.forEach((n) => {
        if (n.type === 'folder') {
          map.set(n.drive_id, n);
          if (n.subFolders) traverse(n.subFolders);
        }
      });
    }
    traverse(rawTree);
    return map;
  }, [rawTree]);

  // 폴더별 전체 파일 목록 재귀 수집
  function getAllFilesInFolder(folderNode: ExamLibraryNode, currentPath: string = ''): RawFileSelection[] {
    const list: RawFileSelection[] = [];
    const thisPath = currentPath ? `${currentPath} > ${folderNode.name}` : folderNode.name;

    if (folderNode.files) {
      folderNode.files.forEach((f) => {
        list.push({
          drive_id: f.drive_id,
          name: f.name,
          grade: f.grade || selectedGrade,
          question_image_drive_id: f.question_image_drive_id,
          folder_id: folderNode.drive_id,
          folder_name: folderNode.name,
          folder_path: thisPath,
          question_number: parseQuestionNum(f.name),
        });
      });
    }

    if (folderNode.subFolders) {
      folderNode.subFolders.forEach((sub) => {
        list.push(...getAllFilesInFolder(sub, thisPath));
      });
    }
    return list;
  }

  // 구간 일괄 추출기에 의해 매칭된 문항 목록
  const matchedItemsFromRanges = useMemo(() => {
    if (selectedFolderIds.size === 0) return [];

    const candidateFiles: RawFileSelection[] = [];
    selectedFolderIds.forEach((fId) => {
      const folder = rawFolderMap.get(fId);
      if (folder) {
        candidateFiles.push(...getAllFilesInFolder(folder, folder.name));
      }
    });

    const parsedRanges = numberRanges
      .map((r) => ({
        start: parseInt(r.start, 10),
        end: parseInt(r.end, 10),
      }))
      .filter((r) => !isNaN(r.start) && !isNaN(r.end) && r.start <= r.end);

    if (parsedRanges.length === 0) {
      return candidateFiles;
    }

    return candidateFiles.filter((file) => {
      const num = file.question_number;
      if (num === null || num === undefined) return true;
      return parsedRanges.some((rng) => num >= rng.start && num <= rng.end);
    });
  }, [selectedFolderIds, numberRanges, rawFolderMap]);

  // ── 구간 추가 및 수정 ──
  const addNumberRange = () => {
    setNumberRanges((prev) => [
      ...prev,
      { id: `range_${Date.now()}`, start: '', end: '' }
    ]);
  };

  const updateNumberRange = (id: string, field: 'start' | 'end', value: string) => {
    setNumberRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const removeNumberRange = (id: string) => {
    setNumberRanges((prev) => prev.filter((r) => r.id !== id));
  };

  // ── 폴더 체크 토글 ──
  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSelectAllFolders = () => {
    const allIds = new Set<string>();
    rawFolderMap.forEach((_, id) => allIds.add(id));
    setSelectedFolderIds(allIds);
  };

  const handleDeselectAllFolders = () => {
    setSelectedFolderIds(new Set());
  };

  // ── 원천 수동 문항 체크 ──
  const toggleRawFileSelection = (fileNode: ExamLibraryNode, folderNode: ExamLibraryNode, folderPath: string) => {
    setSelectedRawFiles((prev) => {
      const exists = prev.some((f) => f.drive_id === fileNode.drive_id);
      if (exists) {
        return prev.filter((f) => f.drive_id !== fileNode.drive_id);
      } else {
        return [
          ...prev,
          {
            drive_id: fileNode.drive_id,
            name: fileNode.name,
            grade: fileNode.grade || selectedGrade,
            question_image_drive_id: fileNode.question_image_drive_id,
            folder_id: folderNode.drive_id,
            folder_name: folderNode.name,
            folder_path: folderPath,
            question_number: parseQuestionNum(fileNode.name),
          },
        ];
      }
    });
  };

  // ── 문항 미리보기 ──
  const handlePreviewFile = async (driveId: string) => {
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

  // ── 일괄 추출기 문항 타깃 소단원에 담기 ──
  const handleExtractToActiveMinor = async () => {
    if (!currentTextbook || !activeTargetMajorId || !activeTargetMinorId) {
      alert('문제를 담을 타깃 소단원을 먼저 선택해주세요!');
      return;
    }
    if (matchedItemsFromRanges.length === 0) {
      alert('추출할 문항이 없습니다. 좌측 폴더 체크 및 번호 구간을 확인해주세요.');
      return;
    }

    setIsExtracting(true);
    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textbookId: currentTextbook.id,
          majorUnitId: activeTargetMajorId,
          minorUnitId: activeTargetMinorId,
          items: matchedItemsFromRanges,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`성공! [${activeTargetInfo?.minorName}]에 ${data.addedCount}개 문항이 담겼습니다.`);
        await fetchTextbookData(selectedGrade);
        setSelectedFolderIds(new Set());
      } else {
        alert(data.error || '문항 담기에 실패했습니다.');
      }
    } catch (e: any) {
      console.error('담기 실패:', e);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── 수동 선택 문항 타깃 소단원에 담기 ──
  const handleAddManualSelectedToMinor = async () => {
    if (!currentTextbook || !activeTargetMajorId || !activeTargetMinorId) {
      alert('문제를 담을 타깃 소단원을 먼저 선택해주세요!');
      return;
    }
    if (selectedRawFiles.length === 0) return;

    setIsExtracting(true);
    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textbookId: currentTextbook.id,
          majorUnitId: activeTargetMajorId,
          minorUnitId: activeTargetMinorId,
          items: selectedRawFiles,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`선택된 ${data.addedCount}개 문항이 [${activeTargetInfo?.minorName}]에 담겼습니다.`);
        await fetchTextbookData(selectedGrade);
        setSelectedRawFiles([]);
      } else {
        alert(data.error || '문항 담기 실패');
      }
    } catch (e) {
      console.error('수동 담기 오류:', e);
      alert('문항 담기 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── 교재 생성 / 수정 모달 핸들러 ──
  const handleSaveBookModal = async () => {
    if (!bookModalName.trim()) {
      alert('교재명을 입력해주세요.');
      return;
    }

    setActionLoading(true);
    try {
      if (bookModalMode === 'create') {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_textbook',
            name: bookModalName.trim(),
            grade: bookModalGrade,
            description: bookModalDesc.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsBookModalOpen(false);
          await fetchTextbookData(selectedGrade);
          setSelectedTextbookId(data.textbook.id);
        } else {
          alert(data.error || '교재 생성 실패');
        }
      } else if (bookModalMode === 'edit' && currentTextbook) {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_textbook',
            textbookId: currentTextbook.id,
            name: bookModalName.trim(),
            grade: bookModalGrade,
            description: bookModalDesc.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsBookModalOpen(false);
          await fetchTextbookData(selectedGrade);
        } else {
          alert(data.error || '교재 수정 실패');
        }
      }
    } catch (e) {
      console.error('교재 저장 실패:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── 교재 삭제 ──
  const handleDeleteTextbook = async () => {
    if (!currentTextbook) return;
    if (!confirm(`정말 '${currentTextbook.name}' 교재를 삭제하시겠습니까?\n수록된 모든 단원과 배치 문항도 함께 삭제됩니다.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_textbook',
          textbookId: currentTextbook.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('교재가 삭제되었습니다.');
        await fetchTextbookData(selectedGrade);
      }
    } catch (e) {
      console.error('교재 삭제 실패:', e);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 대단원 추가 / 수정 ──
  const handleSaveMajorModal = async () => {
    if (!currentTextbook || !majorModalName.trim()) return;

    setActionLoading(true);
    try {
      if (majorModalMode === 'create') {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_major_unit',
            textbookId: currentTextbook.id,
            name: majorModalName.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsMajorModalOpen(false);
          await fetchTextbookData(selectedGrade);
        }
      } else if (majorModalMode === 'edit' && targetMajorForEdit) {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_major_unit',
            textbookId: currentTextbook.id,
            majorUnitId: targetMajorForEdit.id,
            name: majorModalName.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsMajorModalOpen(false);
          await fetchTextbookData(selectedGrade);
        }
      }
    } catch (e) {
      console.error('대단원 저장 실패:', e);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 대단원 삭제 ──
  const handleDeleteMajorUnit = async (maj: MajorUnit) => {
    if (!currentTextbook) return;
    if (!confirm(`'${maj.name}' 대단원을 삭제하시겠습니까?\n하위 소단원 및 배정된 문항이 모두 삭제됩니다.`)) return;

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_major_unit',
          textbookId: currentTextbook.id,
          majorUnitId: maj.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchTextbookData(selectedGrade);
      }
    } catch (e) {
      console.error('대단원 삭제 실패:', e);
    }
  };

  // ── 대단원 순서 변경 ──
  const handleMoveMajorUnit = async (majId: string, direction: 'up' | 'down') => {
    if (!currentTextbook) return;
    const units = [...(currentTextbook.major_units || [])];
    const idx = units.findIndex((m) => m.id === majId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= units.length) return;

    const temp = units[idx];
    units[idx] = units[targetIdx];
    units[targetIdx] = temp;

    const orderedIds = units.map((u) => u.id);

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder_major_units',
          textbookId: currentTextbook.id,
          orderedMajorUnitIds: orderedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchTextbookData(selectedGrade);
      }
    } catch (e) {
      console.error('대단원 이동 실패:', e);
    }
  };

  // ── 소단원 추가 / 수정 ──
  const handleSaveMinorModal = async () => {
    if (!currentTextbook || !minorModalName.trim()) return;

    setActionLoading(true);
    try {
      if (minorModalMode === 'create' && parentMajorForMinor) {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_minor_unit',
            textbookId: currentTextbook.id,
            majorUnitId: parentMajorForMinor,
            name: minorModalName.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsMinorModalOpen(false);
          await fetchTextbookData(selectedGrade);
          setActiveTargetMajorId(parentMajorForMinor);
          setActiveTargetMinorId(data.minorUnit.id);
        }
      } else if (minorModalMode === 'edit' && targetMinorForEdit && parentMajorForMinor) {
        const res = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_minor_unit',
            textbookId: currentTextbook.id,
            majorUnitId: parentMajorForMinor,
            minorUnitId: targetMinorForEdit.id,
            name: minorModalName.trim(),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsMinorModalOpen(false);
          await fetchTextbookData(selectedGrade);
        }
      }
    } catch (e) {
      console.error('소단원 저장 실패:', e);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 소단원 삭제 ──
  const handleDeleteMinorUnit = async (majorId: string, min: MinorUnit) => {
    if (!currentTextbook) return;
    if (!confirm(`'${min.name}' 소단원을 삭제하시겠습니까?\n수록된 문항도 함께 삭제됩니다.`)) return;

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_minor_unit',
          textbookId: currentTextbook.id,
          majorUnitId: majorId,
          minorUnitId: min.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (activeTargetMinorId === min.id) {
          setActiveTargetMinorId(null);
        }
        await fetchTextbookData(selectedGrade);
      }
    } catch (e) {
      console.error('소단원 삭제 실패:', e);
    }
  };

  // ── 소단원 순서 변경 ──
  const handleMoveMinorUnit = async (majorId: string, minorId: string, direction: 'up' | 'down') => {
    if (!currentTextbook) return;
    const maj = (currentTextbook.major_units || []).find((m) => m.id === majorId);
    if (!maj) return;

    const minors = [...(maj.minor_units || [])];
    const idx = minors.findIndex((m) => m.id === minorId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= minors.length) return;

    const temp = minors[idx];
    minors[idx] = minors[targetIdx];
    minors[targetIdx] = temp;

    const orderedIds = minors.map((m) => m.id);

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder_minor_units',
          textbookId: currentTextbook.id,
          majorUnitId: majorId,
          orderedMinorUnitIds: orderedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchTextbookData(selectedGrade);
      }
    } catch (e) {
      console.error('소단원 이동 실패:', e);
    }
  };

  // ── 소단원 내 문항 순서 변경 (위/아래) ──
  const handleMoveItemInMinor = async (minorId: string, itemId: string, direction: 'up' | 'down') => {
    if (!currentTextbook) return;
    const minorItems = currentTextbookItems
      .filter((i) => i.minor_unit_id === minorId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const idx = minorItems.findIndex((i) => i.id === itemId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= minorItems.length) return;

    const temp = minorItems[idx];
    minorItems[idx] = minorItems[targetIdx];
    minorItems[targetIdx] = temp;

    const orderedIds = minorItems.map((i) => i.id);

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder_items',
          textbookId: currentTextbook.id,
          minorUnitId: minorId,
          orderedItemIds: orderedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAllItems(data.items);
      }
    } catch (e) {
      console.error('문항 순서 이동 실패:', e);
    }
  };

  // ── 소단원 내 개별 문항 삭제 ──
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('이 문항을 교재에서 제외하시겠습니까?')) return;

    try {
      const res = await fetch('/api/textbook/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_item',
          itemId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAllItems(data.items);
      }
    } catch (e) {
      console.error('문항 삭제 실패:', e);
    }
  };

  // ── 텍스트 목차 일괄 파싱 생성 ──
  const handleParseAndApplyOutline = async () => {
    if (!currentTextbook || !batchOutlineText.trim()) return;

    // 간단하고 직관적인 목차 파서:
    // "1. 대단원명" 또는 "Ⅰ. 대단원명" -> 대단원
    // "  - 01. 소단원" 또는 "  1) 소단원" -> 소단원
    const lines = batchOutlineText.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    const parsedUnits: { name: string; minor_units: { name: string }[] }[] = [];

    let currentMajor: { name: string; minor_units: { name: string }[] } | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      const isIndented = line.startsWith(' ') || line.startsWith('\t') || line.startsWith('-') || line.startsWith('・');

      if (!isIndented && (trimmed.startsWith('Ⅰ') || trimmed.startsWith('Ⅱ') || trimmed.startsWith('Ⅲ') || trimmed.startsWith('Ⅳ') || trimmed.match(/^[0-9]+단원/) || trimmed.match(/^[0-9]+\./))) {
        currentMajor = { name: trimmed, minor_units: [] };
        parsedUnits.push(currentMajor);
      } else if (currentMajor) {
        const cleanName = trimmed.replace(/^[-・*]\s*/, '');
        currentMajor.minor_units.push({ name: cleanName });
      } else {
        // 대단원 없이 나온 경우 자동 대단원 생성
        currentMajor = { name: 'Ⅰ. 기본 단원', minor_units: [{ name: trimmed }] };
        parsedUnits.push(currentMajor);
      }
    });

    if (parsedUnits.length === 0) {
      alert('목차 파싱 결과가 없습니다. 양식을 확인해주세요.');
      return;
    }

    setActionLoading(true);
    try {
      // 순차적으로 대단원 & 소단원 생성
      for (const maj of parsedUnits) {
        const majRes = await fetch('/api/textbook/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_major_unit',
            textbookId: currentTextbook.id,
            name: maj.name,
          }),
        });
        const majData = await majRes.json();
        if (majData.success && majData.majorUnit) {
          const newMajId = majData.majorUnit.id;
          for (const min of maj.minor_units) {
            await fetch('/api/textbook/bank', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'add_minor_unit',
                textbookId: currentTextbook.id,
                majorUnitId: newMajId,
                name: min.name,
              }),
            });
          }
        }
      }

      alert('목차가 성공적으로 생성되었습니다!');
      setIsBatchOutlineOpen(false);
      setBatchOutlineText('');
      await fetchTextbookData(selectedGrade);
    } catch (e) {
      console.error('목차 일괄 생성 실패:', e);
      alert('목차 생성 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── 좌측 원천 라이브러리 재귀 렌더러 ──
  const renderRawTree = (nodes: ExamLibraryNode[], depth: number = 0, parentPath: string = '') => {
    return (
      <div className={`space-y-1 ${depth > 0 ? 'ml-3 pl-2.5 border-l border-slate-200' : ''}`}>
        {nodes.map((node) => {
          const isFolder = node.type === 'folder';
          const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

          if (isFolder) {
            const isExpanded = expandedFolders.has(node.drive_id);
            const isFolderChecked = selectedFolderIds.has(node.drive_id);
            const hasChildren = (node.subFolders && node.subFolders.length > 0) || (node.files && node.files.length > 0);

            // 검색 필터링
            if (searchKeyword.trim()) {
              const kw = searchKeyword.toLowerCase();
              const hasMatchingFile = node.files?.some((f) => f.name.toLowerCase().includes(kw));
              const matchFolderName = node.name.toLowerCase().includes(kw);
              if (!hasMatchingFile && !matchFolderName) return null;
            }

            return (
              <div key={node.drive_id} className="text-xs">
                {/* 폴더 행 */}
                <div
                  className={`flex items-center justify-between p-1.5 rounded-xl transition-all cursor-pointer select-none group ${
                    isFolderChecked
                      ? 'bg-indigo-50/90 text-indigo-900 font-black border border-indigo-200 shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-700 font-bold border border-transparent'
                  }`}
                  onClick={() => {
                    setExpandedFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(node.drive_id)) next.delete(node.drive_id);
                      else next.add(node.drive_id);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* 펼침 토글 */}
                    {hasChildren ? (
                      <span className="w-4 h-4 rounded flex items-center justify-center text-slate-400 group-hover:text-slate-700">
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                    ) : (
                      <div className="w-4 shrink-0" />
                    )}

                    {/* 폴더 체크박스 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderSelection(node.drive_id);
                      }}
                      className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                    >
                      {isFolderChecked ? (
                        <CheckSquare size={15} className="text-indigo-600 fill-indigo-100" />
                      ) : (
                        <Square size={15} className="text-slate-400" />
                      )}
                    </button>

                    {isExpanded ? (
                      <FolderOpen size={15} className="text-amber-500 shrink-0" />
                    ) : (
                      <Folder size={15} className="text-amber-500 shrink-0" />
                    )}

                    <span className="truncate text-xs">{node.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({node.files?.length || 0})
                    </span>
                  </div>

                  {isFolderChecked && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md font-extrabold shrink-0">
                      구간 추출 대상
                    </span>
                  )}
                </div>

                {/* 하위 노드 렌더링 */}
                {isExpanded && (
                  <div className="mt-1">
                    {node.subFolders && node.subFolders.length > 0 && renderRawTree(node.subFolders, depth + 1, currentPath)}
                    
                    {node.files && node.files.length > 0 && (
                      <div className="ml-5 pl-2 border-l border-slate-200 space-y-1 mt-1">
                        {node.files.map((fileNode) => {
                          const isSelected = selectedRawFiles.some((f) => f.drive_id === fileNode.drive_id);
                          const fallbackNum = parseQuestionNum(fileNode.name);

                          if (searchKeyword.trim() && !fileNode.name.toLowerCase().includes(searchKeyword.toLowerCase())) {
                            return null;
                          }

                          return (
                            <div
                              key={fileNode.drive_id}
                              className={`flex items-center justify-between p-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50/80 text-indigo-900 font-bold border border-indigo-200'
                                  : 'hover:bg-slate-100 text-slate-600'
                              }`}
                              onClick={() => toggleRawFileSelection(fileNode, node, currentPath)}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <button type="button" className="p-0.5">
                                  {isSelected ? (
                                    <CheckSquare size={13} className="text-indigo-600" />
                                  ) : (
                                    <Square size={13} className="text-slate-300" />
                                  )}
                                </button>
                                {fallbackNum !== null && (
                                  <span className="w-5 h-4 rounded bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0">
                                    {fallbackNum}번
                                  </span>
                                )}
                                <span className="truncate">{fileNode.name}</span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewFile(fileNode.drive_id);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors"
                                title="문제 미리보기"
                              >
                                <Eye size={12} />
                              </button>
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
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* ── 1. 상단 타이틀 헤더 & 학년 선택 탭 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-indigo-200">
              <BookOpen size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              교재자료 DB 구축
            </h1>
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full font-bold">
              원천 라이브러리 기반 단원별 교재 빌딩 센터
            </span>
          </div>
          <p className="text-xs md:text-sm font-medium text-slate-500">
            구글 드라이브에서 동기화된 원천 DB에서 문항들을 선별하여 <strong>[교재명 &gt; 대단원 &gt; 소단원]</strong> 계층 구조에 체계적으로 배치합니다.
          </p>
        </div>

        {/* 학년 선택 탭 */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl shrink-0">
          {GRADES.map((g) => (
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

      {/* ── 2. 스마트 문항 구간 일괄 추출기 & 타깃 소단원 매핑 바 ── */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 border-2 border-indigo-200/90 rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <span>문항 번호 구간 일괄 추출기</span>
                <span className="text-[11px] px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                  단원 자동 매핑 지원
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                좌측에서 회차/유형 폴더들을 체크하고 <strong>추출할 번호 구간</strong>을 입력하면, 우측에서 <strong>선택된 타깃 소단원</strong>에 즉시 담깁니다!
              </p>
            </div>
          </div>

          {/* 선택 현황 요약 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-2xs flex items-center gap-1.5">
              <Folder size={14} className="text-indigo-600" />
              <span>선택된 폴더:</span>
              <strong className="text-indigo-600 font-black">{selectedFolderIds.size}개</strong>
            </span>
            <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-2xs flex items-center gap-1.5">
              <Sparkles size={14} className="text-purple-600" />
              <span>추출 예상 문항:</span>
              <strong className="text-purple-600 font-black">{matchedItemsFromRanges.length}문제</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          {/* 번호 구간 설정 컨트롤 */}
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
              <Filter size={14} className="text-indigo-600" />
              <span>추출 번호 구간:</span>
            </div>

            {numberRanges.map((range, idx) => (
              <div
                key={range.id}
                className="flex items-center gap-1.5 bg-white border border-indigo-200 px-3 py-1.5 rounded-2xl shadow-2xs"
              >
                <input
                  type="number"
                  min="1"
                  placeholder="시작"
                  value={range.start}
                  onChange={(e) => updateNumberRange(range.id, 'start', e.target.value)}
                  className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-indigo-700 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
                />
                <span className="text-xs font-black text-slate-400">~</span>
                <input
                  type="number"
                  min="1"
                  placeholder="종료"
                  value={range.end}
                  onChange={(e) => updateNumberRange(range.id, 'end', e.target.value)}
                  className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-indigo-700 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
                />
                <span className="text-xs font-bold text-slate-600">번</span>

                {numberRanges.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNumberRange(range.id)}
                    className="ml-1 text-slate-300 hover:text-rose-500 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addNumberRange}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-dashed border-indigo-300 rounded-xl text-xs font-bold text-indigo-600 transition-colors cursor-pointer"
            >
              + 구간 추가
            </button>
          </div>

          {/* 타깃 소단원 배지 & 담기 버튼 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-3.5 py-2 bg-white border-2 border-indigo-300 rounded-2xl shadow-2xs flex items-center gap-2">
              <span className="text-[10px] bg-indigo-600 text-white font-black px-2 py-0.5 rounded-md">
                🎯 매핑 대상 단원
              </span>
              <span className="text-xs font-black text-slate-800">
                {activeTargetInfo ? (
                  <>
                    <span className="text-slate-400">{activeTargetInfo.majorName} &gt; </span>
                    <span className="text-indigo-600">{activeTargetInfo.minorName}</span>
                  </>
                ) : (
                  <span className="text-rose-500 font-bold">(우측에서 소단원을 먼저 선택하세요)</span>
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExtractToActiveMinor}
              disabled={isExtracting || !activeTargetInfo || selectedFolderIds.size === 0 || matchedItemsFromRanges.length === 0}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:hover:from-indigo-600 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isExtracting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>단원으로 문항 담는 중...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>
                    {selectedFolderIds.size > 0
                      ? `선택한 소단원에 ${matchedItemsFromRanges.length}개 문항 일괄 담기`
                      : '왼쪽 폴더를 체크해주세요'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. 메인 2분할 레이아웃: 좌측(원천 DB) vs 우측(3단 교재 빌더) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── 좌측: 원천 DB 라이브러리 (5 / 12) ── */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 min-h-[680px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <FolderOpen size={18} className="text-amber-500" />
                <span>{selectedGrade} 원천 DB 라이브러리</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                폴더 체크박스를 선택하면 상단 구간 추출기로 원하는 소단원에 한번에 담을 수 있습니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllFolders}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
              >
                전체 폴더 선택
              </button>
              {selectedFolderIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAllFolders}
                  className="px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-50 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  선택 해제 ({selectedFolderIds.size})
                </button>
              )}
            </div>
          </div>

          {/* 검색 바 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="원천 폴더 또는 문항 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-600 transition-colors"
            />
          </div>

          {/* 트리 영역 */}
          <div className="flex-1 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
            {loadingRaw ? (
              <div className="py-24 text-center space-y-3">
                <Loader2 size={30} className="animate-spin text-indigo-600 mx-auto" />
                <p className="text-xs text-slate-400 font-bold">{selectedGrade} 원천 라이브러리를 동기화 중...</p>
              </div>
            ) : rawTree.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-slate-400">
                <Folder size={32} className="mx-auto opacity-30" />
                <p className="text-xs">{selectedGrade}에 등록된 원천 라이브러리가 없습니다.</p>
              </div>
            ) : (
              renderRawTree(rawTree)
            )}
          </div>

          {/* 수동 선택 바닥 액션 */}
          {selectedRawFiles.length > 0 && (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-indigo-50/50 p-3 rounded-2xl">
              <span className="text-xs font-bold text-slate-600">
                수동 선택: <strong className="text-indigo-600 font-black">{selectedRawFiles.length}개</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRawFiles([])}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  비우기
                </button>
                <button
                  type="button"
                  onClick={handleAddManualSelectedToMinor}
                  disabled={!activeTargetInfo || isExtracting}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <span>타깃 단원에 담기</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 우측: 교재 목차 & 단원별 빌더 (7 / 12) ── */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5 min-h-[680px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BookMarked size={18} className="text-indigo-600" />
                <h3 className="font-black text-slate-800 text-base">
                  교재 목차 &amp; 단원별 빌더
                </h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-extrabold">
                  3단계 계층 구조
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                교재명 &gt; 대단원명 &gt; 소단원명 순으로 기입하고, 원하는 소단원을 선택하여 문제를 담습니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBookModalMode('create');
                  setBookModalName('');
                  setBookModalGrade(selectedGrade);
                  setBookModalDesc('');
                  setIsBookModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ 새 교재 추가</span>
              </button>
            </div>
          </div>

          {/* 1계층: 교재명 선택 & 통계 바 */}
          {textbooks.length === 0 ? (
            <div className="bg-indigo-50/50 border border-dashed border-indigo-200 rounded-2xl p-8 text-center space-y-3">
              <BookOpen size={36} className="mx-auto text-indigo-400" />
              <p className="text-sm font-black text-indigo-900">{selectedGrade}에 등록된 교재가 없습니다.</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                상단의 <strong>[+ 새 교재 추가]</strong> 버튼을 눌러 교재(예: '2026 내신대비 마스터 수학(상)')를 먼저 만들어주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBookModalMode('create');
                  setBookModalName('');
                  setBookModalGrade(selectedGrade);
                  setBookModalDesc('');
                  setIsBookModalOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                <span>첫 번째 교재 등록하기</span>
              </button>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                  <BookOpen size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTextbookId || ''}
                      onChange={(e) => setSelectedTextbookId(e.target.value)}
                      className="bg-white border border-slate-200 px-3 py-1 rounded-xl text-sm font-black text-slate-800 focus:outline-none cursor-pointer max-w-[280px] truncate shadow-2xs"
                    >
                      {textbooks.map((tb) => (
                        <option key={tb.id} value={tb.id}>
                          {tb.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-extrabold shrink-0">
                      편집 중
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1">
                    총 <strong>{currentTextbook?.major_units?.length || 0}개</strong> 대단원 ·{' '}
                    <strong>
                      {currentTextbook?.major_units?.reduce((acc, m) => acc + (m.minor_units?.length || 0), 0) || 0}개
                    </strong>{' '}
                    소단원 · 총 <strong className="text-indigo-600">{currentTextbookItems.length}문항</strong> 수록됨
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBatchOutlineOpen(true)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  title="목차 텍스트 일괄 붙여넣기"
                >
                  <ListPlus size={13} className="text-purple-600" />
                  <span>목차 일괄생성</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentTextbook) return;
                    setBookModalMode('edit');
                    setBookModalName(currentTextbook.name);
                    setBookModalGrade(currentTextbook.grade);
                    setBookModalDesc(currentTextbook.description || '');
                    setIsBookModalOpen(true);
                  }}
                  className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 shadow-2xs transition-colors cursor-pointer"
                  title="교재명 및 정보 수정"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTextbook}
                  className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 rounded-xl text-slate-400 hover:text-rose-600 shadow-2xs transition-colors cursor-pointer"
                  title="교재 삭제"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}

          {/* 2 & 3 계층: 대단원 & 소단원 계층 트리 */}
          {currentTextbook && (
            <div className="flex-1 overflow-y-auto max-h-[520px] space-y-4 pr-1 scrollbar-thin">
              {(!currentTextbook.major_units || currentTextbook.major_units.length === 0) ? (
                <div className="py-16 text-center text-xs text-slate-400 space-y-3">
                  <Layers size={30} className="mx-auto opacity-30" />
                  <p>등록된 대단원이 없습니다.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMajorModalMode('create');
                      setMajorModalName('');
                      setIsMajorModalOpen(true);
                    }}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl font-black text-xs hover:bg-indigo-100 transition-colors"
                  >
                    + 첫 번째 대단원 추가하기
                  </button>
                </div>
              ) : (
                currentTextbook.major_units.map((maj, majIdx) => {
                  const isMajorCollapsed = collapsedMajorUnits.has(maj.id);
                  const majItemsCount = currentTextbookItems.filter((i) => i.major_unit_id === maj.id).length;

                  return (
                    <div
                      key={maj.id}
                      className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs transition-all"
                    >
                      {/* 대단원 헤더 바 */}
                      <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                        <div
                          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none"
                          onClick={() => {
                            setCollapsedMajorUnits((prev) => {
                              const next = new Set(prev);
                              if (next.has(maj.id)) next.delete(maj.id);
                              else next.add(maj.id);
                              return next;
                            });
                          }}
                        >
                          <span className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs shrink-0">
                            {isMajorCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </span>
                          <span className="text-[11px] font-black bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md shrink-0">
                            대단원 {majIdx + 1}
                          </span>
                          <span className="font-black text-slate-800 text-sm truncate">
                            {maj.name}
                          </span>
                          <span className="text-xs text-indigo-600 font-bold shrink-0">
                            (총 {majItemsCount}문항)
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setMinorModalMode('create');
                              setMinorModalName('');
                              setParentMajorForMinor(maj.id);
                              setIsMinorModalOpen(true);
                            }}
                            className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-600 rounded-lg text-[11px] font-black transition-colors"
                          >
                            + 소단원 추가
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveMajorUnit(maj.id, 'up')}
                            disabled={majIdx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="위로 이동"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveMajorUnit(maj.id, 'down')}
                            disabled={majIdx === currentTextbook.major_units.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="아래로 이동"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMajorModalMode('edit');
                              setMajorModalName(maj.name);
                              setTargetMajorForEdit(maj);
                              setIsMajorModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700"
                            title="대단원명 수정"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMajorUnit(maj)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="대단원 삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* 하위 소단원 목록 */}
                      {!isMajorCollapsed && (
                        <div className="p-3 space-y-3 bg-slate-50/30">
                          {(!maj.minor_units || maj.minor_units.length === 0) ? (
                            <div className="text-center py-4 text-xs text-slate-400">
                              등록된 소단원이 없습니다. [+ 소단원 추가] 버튼을 눌러주세요.
                            </div>
                          ) : (
                            maj.minor_units.map((min, minIdx) => {
                              const isTargetActive = activeTargetMinorId === min.id;
                              const mappedQuestions = currentTextbookItems
                                .filter((i) => i.minor_unit_id === min.id)
                                .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

                              return (
                                <div
                                  key={min.id}
                                  className={`rounded-xl border transition-all p-3 space-y-2 ${
                                    isTargetActive
                                      ? 'border-2 border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-100/50'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  {/* 소단원 헤더 바 */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none"
                                      onClick={() => {
                                        setActiveTargetMajorId(maj.id);
                                        setActiveTargetMinorId(min.id);
                                      }}
                                    >
                                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                                        소단원 {minIdx + 1}
                                      </span>
                                      <span className="font-black text-slate-800 text-xs truncate">
                                        {min.name}
                                      </span>

                                      {isTargetActive ? (
                                        <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs shrink-0">
                                          <Sparkles size={10} />
                                          <span>매핑 타깃 선택됨</span>
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 hover:text-indigo-600 underline font-bold shrink-0">
                                          (클릭하여 타깃 지정)
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                        {mappedQuestions.length}문항
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveMinorUnit(maj.id, min.id, 'up')}
                                        disabled={minIdx === 0}
                                        className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                                      >
                                        <ArrowUp size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveMinorUnit(maj.id, min.id, 'down')}
                                        disabled={minIdx === maj.minor_units.length - 1}
                                        className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                                      >
                                        <ArrowDown size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setMinorModalMode('edit');
                                          setMinorModalName(min.name);
                                          setTargetMinorForEdit(min);
                                          setParentMajorForMinor(maj.id);
                                          setIsMinorModalOpen(true);
                                        }}
                                        className="p-1 text-slate-400 hover:text-slate-700"
                                        title="소단원명 수정"
                                      >
                                        <Edit3 size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMinorUnit(maj.id, min)}
                                        className="p-1 text-slate-400 hover:text-rose-600"
                                        title="소단원 삭제"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* 소단원에 담긴 문제 리스트 */}
                                  {mappedQuestions.length > 0 ? (
                                    <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                                      {mappedQuestions.map((q, qIdx) => (
                                        <div
                                          key={q.id}
                                          className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-xs transition-colors"
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0 border border-indigo-100">
                                              {qIdx + 1}
                                            </span>
                                            <span className="font-bold text-slate-800 truncate">
                                              {q.name}
                                            </span>
                                            {q.folder_name && (
                                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                                {q.folder_name}
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => handlePreviewFile(q.drive_id)}
                                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded"
                                              title="미리보기"
                                            >
                                              <Eye size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveItemInMinor(min.id, q.id, 'up')}
                                              disabled={qIdx === 0}
                                              className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                                              title="순서 위로"
                                            >
                                              <ArrowUp size={11} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveItemInMinor(min.id, q.id, 'down')}
                                              disabled={qIdx === mappedQuestions.length - 1}
                                              className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                                              title="순서 아래로"
                                            >
                                              <ArrowDown size={11} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteItem(q.id)}
                                              className="p-1 text-slate-400 hover:text-rose-600"
                                              title="교재에서 제외"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400 text-center py-3 bg-slate-50/80 rounded-lg border border-dashed border-slate-200">
                                      {isTargetActive ? (
                                        <span className="text-indigo-600 font-bold">
                                          👈 좌측 원천 라이브러리에서 문제를 체크하고 추출 버튼을 누르면 이곳에 담깁니다.
                                        </span>
                                      ) : (
                                        <span>수록된 문항이 없습니다. (단원을 클릭하여 타깃으로 지정하세요)</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* 대단원 추가 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setMajorModalMode('create');
                  setMajorModalName('');
                  setIsMajorModalOpen(true);
                }}
                className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-600 hover:text-indigo-600 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>+ 새 대단원 추가하기</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 교재 생성 / 수정 모달 ── */}
      {isBookModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <BookOpen size={20} className="text-indigo-600" />
                <span>{bookModalMode === 'create' ? '새 교재 등록' : '교재 정보 수정'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBookModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 mb-1 block">
                  교재명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: [중2] 2026 내신대비 마스터 수학(상)"
                  value={bookModalName}
                  onChange={(e) => setBookModalName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 mb-1 block">
                  대상 학년 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={bookModalGrade}
                  onChange={(e) => setBookModalGrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 bg-white cursor-pointer"
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 mb-1 block">
                  교재 설명 / 부제 (선택)
                </label>
                <textarea
                  rows={3}
                  placeholder="예: 1학기 중간고사 대비 완성형 단원별 교재"
                  value={bookModalDesc}
                  onChange={(e) => setBookModalDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBookModalOpen(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveBookModal}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                <span>{bookModalMode === 'create' ? '교재 생성하기' : '수정 완료'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 대단원 모달 ── */}
      {isMajorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-800">
                {majorModalMode === 'create' ? '새 대단원 추가' : '대단원명 수정'}
              </h3>
              <button
                type="button"
                onClick={() => setIsMajorModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 mb-1 block">
                대단원명
              </label>
              <input
                type="text"
                placeholder="예: Ⅰ. 유리수와 순환소수"
                value={majorModalName}
                onChange={(e) => setMajorModalName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMajorModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMajorModal}
                disabled={actionLoading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer"
              >
                {actionLoading && <Loader2 size={13} className="animate-spin" />}
                <span>저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 소단원 모달 ── */}
      {isMinorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-800">
                {minorModalMode === 'create' ? '새 소단원 추가' : '소단원명 수정'}
              </h3>
              <button
                type="button"
                onClick={() => setIsMinorModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 mb-1 block">
                소단원명
              </label>
              <input
                type="text"
                placeholder="예: 01. 유리수와 소수"
                value={minorModalName}
                onChange={(e) => setMinorModalName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMinorModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMinorModal}
                disabled={actionLoading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer"
              >
                {actionLoading && <Loader2 size={13} className="animate-spin" />}
                <span>저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 텍스트 목차 일괄 생성 모달 ── */}
      {isBatchOutlineOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <ListPlus size={18} className="text-purple-600" />
                  <span>목차 텍스트 일괄 붙여넣기 생성</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  한글(HWP)이나 엑셀의 목차 텍스트를 복사해 붙여넣으면 대단원과 소단원을 한번에 생성합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchOutlineOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] bg-slate-50 border border-slate-200 p-3 rounded-xl text-slate-600 space-y-1 font-mono">
                <div className="font-bold text-slate-700">💡 입력 예시:</div>
                <div>Ⅰ. 유리수와 순환소수</div>
                <div>  - 01. 유리수와 소수</div>
                <div>  - 02. 순환소수의 분수 표현</div>
                <div>Ⅱ. 식의 계산</div>
                <div>  - 01. 지수법칙</div>
              </div>

              <textarea
                rows={10}
                placeholder="목차 텍스트를 이곳에 붙여넣으세요..."
                value={batchOutlineText}
                onChange={(e) => setBatchOutlineText(e.target.value)}
                className="w-full p-3.5 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBatchOutlineOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleParseAndApplyOutline}
                disabled={actionLoading || !batchOutlineText.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                <span>목차 자동 생성하기 ➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 문항 미리보기 모달 ── */}
      {previewFileId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-4xl h-[85vh] flex flex-col shadow-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <span className="text-sm font-black text-white flex items-center gap-2">
                <Eye size={16} className="text-indigo-400" />
                <span>문항 미리보기</span>
              </span>
              <button
                onClick={() => {
                  setPreviewFileId(null);
                  setPreviewHtml(null);
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500 text-slate-300 hover:text-white flex items-center justify-center font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-white p-4 overflow-hidden relative">
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
