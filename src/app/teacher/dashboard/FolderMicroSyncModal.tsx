'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  CloudDownload,
  Trash2,
  CheckSquare,
  Square,
  FolderSync,
  PlusCircle,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { ExamLibraryNode } from '@/lib/examLibraryTree';

const GRADES = ['고1', '고2', '고3', '중1', '중2', '중3', 'ALL'];
const ORPHAN_MODE_STORAGE_KEY = 'eduest_micro_sync_orphan_mode';

type OrphanMode = 'auto' | 'manual';

type ExtendedFolderNode = ExamLibraryNode & {
  isNewInDb?: boolean;
  subFolders: ExtendedFolderNode[];
};

type PreviewResponse = {
  success: boolean;
  folderId: string;
  folderName: string;
  resolvedGrade: string | null;
  elapsedMs: number;
  driveCallCount: number;
  scannedCount: number;
  scannedFoldersCount: number;
  scannedFilesCount: number;
  stats: {
    addTotal: number;
    addFolders: number;
    addFiles: number;
    updateTotal: number;
    unchangedTotal: number;
    orphanTotal: number;
  };
  preview: {
    addedFolders: Array<{ drive_id: string; name: string; path: string }>;
    addedFiles: Array<{ drive_id: string; name: string; path: string }>;
    updatedItems: Array<{ drive_id: string; name: string; type: string; path: string }>;
    orphans: Array<{ drive_id: string; name: string; type: 'folder' | 'file'; path: string }>;
  };
};

type ExecuteResponse = {
  success: boolean;
  folderId: string;
  folderName: string;
  resolvedGrade: string | null;
  elapsedMs: number;
  driveCallCount: number;
  scannedCount: number;
  scannedFoldersCount: number;
  scannedFilesCount: number;
  addedCount: number;
  addedFoldersCount: number;
  addedFilesCount: number;
  updatedCount: number;
  unchangedCount: number;
  deletedOrphansCount: number;
  skippedOrphansCount: number;
  message: string;
};

interface FolderMicroSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

function parseRoundNumber(name: string): number {
  const m = name.match(/(\d+)\s*차/);
  return m ? parseInt(m[1], 10) : 999999;
}

function sortFolderTree(nodes: ExtendedFolderNode[]): ExtendedFolderNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const rA = parseRoundNumber(a.name);
    const rB = parseRoundNumber(b.name);
    if (rA !== rB) return rA - rB;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return sorted.map((n) => ({
    ...n,
    subFolders: n.subFolders?.length ? sortFolderTree(n.subFolders) : [],
  }));
}

function countTotalFilesInNode(node: ExtendedFolderNode): number {
  return node.files?.length || 0;
}

function filterTreeByKeyword(
  nodes: ExtendedFolderNode[],
  kw: string
): { filtered: ExtendedFolderNode[]; autoExpandIds: string[] } {
  const lower = kw.toLowerCase().trim();
  if (!lower) return { filtered: nodes, autoExpandIds: [] };

  const expandIds: string[] = [];

  const filterNode = (node: ExtendedFolderNode): ExtendedFolderNode | null => {
    if (node.type !== 'folder') return null;
    const selfMatch = node.name.toLowerCase().includes(lower);
    const matchedSubs = (node.subFolders || [])
      .map(filterNode)
      .filter((x): x is ExtendedFolderNode => x !== null);

    if (selfMatch || matchedSubs.length > 0) {
      if (matchedSubs.length > 0) expandIds.push(node.drive_id);
      return {
        ...node,
        subFolders: selfMatch && matchedSubs.length === 0 ? node.subFolders : matchedSubs,
      };
    }
    return null;
  };

  const filtered = nodes
    .map(filterNode)
    .filter((x): x is ExtendedFolderNode => x !== null);

  return { filtered, autoExpandIds: expandIds };
}

function mergeDiscoveredSubfolders(
  nodes: ExtendedFolderNode[],
  parentId: string,
  discovered: Array<{ drive_id: string; parent_id: string | null; name: string; isNewInDb: boolean }>,
  grade: string
): ExtendedFolderNode[] {
  const toChildNodes = (existingSubs: ExtendedFolderNode[]) => {
    const existingIds = new Set(existingSubs.map((s) => s.drive_id));
    const additions: ExtendedFolderNode[] = discovered
      .filter((d) => d.isNewInDb && !existingIds.has(d.drive_id))
      .map((d) => ({
        id: d.drive_id,
        drive_id: d.drive_id,
        parent_id: d.parent_id,
        name: d.name,
        type: 'folder' as const,
        grade,
        subFolders: [],
        files: [],
        isNewInDb: true,
      }));
    return sortFolderTree([...existingSubs, ...additions]);
  };

  if (parentId === '1W1s2wPQnwXQI-i3Cwc8g1RfsajEGW-UC') {
    return toChildNodes(nodes);
  }

  return nodes.map((node) => {
    if (node.drive_id === parentId) {
      return {
        ...node,
        subFolders: toChildNodes(node.subFolders || []),
      };
    }
    if (node.subFolders?.length) {
      return {
        ...node,
        subFolders: mergeDiscoveredSubfolders(node.subFolders, parentId, discovered, grade),
      };
    }
    return node;
  });
}

export default function FolderMicroSyncModal({
  isOpen,
  onClose,
  onSuccess,
}: FolderMicroSyncModalProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>('고1');
  const [treeData, setTreeData] = useState<ExtendedFolderNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');

  // 선택된 대상 폴더 & 경로
  const [selectedFolder, setSelectedFolder] = useState<ExtendedFolderNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  // 드라이브 신규 폴더 탐색 상태
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverNotice, setDiscoverNotice] = useState<string | null>(null);

  // 고아 삭제 옵션 (localStorage 영구 저장)
  const [orphanMode, setOrphanMode] = useState<OrphanMode>('auto');
  const [selectedOrphanIds, setSelectedOrphanIds] = useState<Set<string>>(new Set());

  // Dry-Run 미리보기 & 실행 상태
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecuteResponse | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // 마운트 시 localStorage에서 고아 삭제 옵션 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORPHAN_MODE_STORAGE_KEY);
      if (saved === 'auto' || saved === 'manual') {
        setOrphanMode(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleChangeOrphanMode = (mode: OrphanMode) => {
    setOrphanMode(mode);
    try {
      localStorage.setItem(ORPHAN_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedFolder(null);
    setSelectedPath([]);
    setPreviewData(null);
    setPreviewError(null);
    setExecuteResult(null);
    setExecuteError(null);
    setDiscoverNotice(null);
    setSelectedOrphanIds(new Set());
    loadTree(selectedGrade);
  }, [isOpen, selectedGrade]);

  const loadTree = async (grade: string, preserveExpand = false) => {
    try {
      setLoadingTree(true);
      const res = await fetch(
        `/api/test2/raw-library?grade=${encodeURIComponent(grade)}&includeGradeRoot=1`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.tree)) {
        const sorted = sortFolderTree(data.tree as ExtendedFolderNode[]);
        setTreeData(sorted);

        if (!preserveExpand) {
          const initialExpanded = new Set<string>();
          sorted.forEach((node) => {
            if (node.type === 'folder') {
              initialExpanded.add(node.drive_id);
              node.subFolders?.forEach((sf) => initialExpanded.add(sf.drive_id));
            }
          });
          setExpandedFolders(initialExpanded);
        }
      } else {
        setTreeData([]);
      }
    } catch (e) {
      console.error('Failed to load folder tree:', e);
      setTreeData([]);
    } finally {
      setLoadingTree(false);
    }
  };

  const { filtered: displayTree, autoExpandIds } = useMemo(
    () => filterTreeByKeyword(treeData, searchKeyword),
    [treeData, searchKeyword]
  );

  const effectiveExpanded = useMemo(() => {
    if (!searchKeyword.trim()) return expandedFolders;
    return new Set([...expandedFolders, ...autoExpandIds]);
  }, [expandedFolders, autoExpandIds, searchKeyword]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const runPreview = async (folder: ExtendedFolderNode) => {
    setIsPreviewing(true);
    setPreviewData(null);
    setPreviewError(null);
    setExecuteResult(null);
    setExecuteError(null);
    setSelectedOrphanIds(new Set());

    try {
      const res = await fetch('/api/drive/library/folder-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          folderId: folder.drive_id,
          grade: folder.grade || selectedGrade,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `미리보기 스캔 실패 (HTTP ${res.status})`);
      }
      setPreviewData(data as PreviewResponse);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : '폴더 스캔 중 오류가 발생했습니다.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSelectFolder = (folder: ExtendedFolderNode, path: string[]) => {
    setSelectedFolder(folder);
    setSelectedPath(path);
    setDiscoverNotice(null);
    runPreview(folder);
  };

  // 드라이브에서 아직 DB에 없는 신규 하위 폴더 실시간 탐색
  const handleDiscoverNewFolders = async () => {
    const targetParentId =
      selectedFolder?.drive_id ||
      (selectedGrade !== 'ALL' && treeData.length === 1 ? treeData[0].drive_id : undefined);

    setIsDiscovering(true);
    setDiscoverNotice(null);

    try {
      const res = await fetch('/api/drive/library/folder-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discover_children',
          folderId: targetParentId,
          grade: selectedGrade,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || '드라이브 하위 폴더 조회 실패');
      }

      if (data.newCount > 0) {
        setTreeData((prev) =>
          mergeDiscoveredSubfolders(prev, data.parentId, data.folders, selectedGrade)
        );
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          if (targetParentId) next.add(targetParentId);
          return next;
        });
        setDiscoverNotice(`✨ DB에 없던 드라이브 신규 폴더 ${data.newCount}개를 발견해 트리에 추가했습니다!`);
      } else {
        setDiscoverNotice('조회한 위치에 DB 미등록 신규 폴더가 없습니다. (이미 최신 목록)');
      }
    } catch (err: unknown) {
      setDiscoverNotice(`⚠️ ${err instanceof Error ? err.message : '신규 폴더 탐색 실패'}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleOrphanCheck = (driveId: string) => {
    setSelectedOrphanIds((prev) => {
      const next = new Set(prev);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  const toggleAllOrphans = () => {
    const orphans = previewData?.preview?.orphans || [];
    if (orphans.length === 0) return;
    if (selectedOrphanIds.size === orphans.length) {
      setSelectedOrphanIds(new Set());
    } else {
      setSelectedOrphanIds(new Set(orphans.map((o) => o.drive_id)));
    }
  };

  const handleExecuteSync = async () => {
    if (!selectedFolder) return;
    setIsExecuting(true);
    setExecuteError(null);

    try {
      const res = await fetch('/api/drive/library/folder-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          folderId: selectedFolder.drive_id,
          grade: selectedFolder.grade || selectedGrade,
          orphanMode,
          deleteOrphanIds: orphanMode === 'manual' ? Array.from(selectedOrphanIds) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `동기화 실행 실패 (HTTP ${res.status})`);
      }
      const result = data as ExecuteResponse;
      setExecuteResult(result);
      await loadTree(selectedGrade, true);
      onSuccess?.(result.message);
    } catch (err: unknown) {
      setExecuteError(err instanceof Error ? err.message : '폴더 미세 동기화 실행 중 오류가 발생했습니다.');
    } finally {
      setIsExecuting(false);
    }
  };

  const renderTree = (nodes: ExtendedFolderNode[], depth = 0, parentPath: string[] = []) => {
    return (
      <div className={depth > 0 ? 'ml-3.5 pl-2.5 border-l border-slate-200 space-y-0.5 mt-0.5' : 'space-y-0.5'}>
        {nodes
          .filter((n) => n.type === 'folder')
          .map((node) => {
            const isExpanded = effectiveExpanded.has(node.drive_id);
            const isSelected = selectedFolder?.drive_id === node.drive_id;
            const currentPath = [...parentPath, node.name];
            const hasSubFolders = node.subFolders && node.subFolders.length > 0;
            const fileCount = countTotalFilesInNode(node);

            return (
              <div key={node.drive_id}>
                <div
                  onClick={() => handleSelectFolder(node, currentPath)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'bg-sky-50 border border-sky-400 text-sky-950 shadow-2xs'
                      : node.isNewInDb
                      ? 'bg-emerald-50/70 border border-dashed border-emerald-300 text-emerald-900 hover:bg-emerald-100/70'
                      : 'hover:bg-slate-100 border border-transparent text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(node.drive_id, e)}
                      className={`p-0.5 rounded hover:bg-white/80 shrink-0 ${
                        hasSubFolders ? 'text-slate-400' : 'text-transparent pointer-events-none'
                      }`}
                      tabIndex={-1}
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>

                    {isSelected || isExpanded ? (
                      <FolderOpen
                        size={15}
                        className={
                          isSelected
                            ? 'text-sky-600 shrink-0'
                            : node.isNewInDb
                            ? 'text-emerald-600 shrink-0'
                            : 'text-amber-500 shrink-0'
                        }
                      />
                    ) : (
                      <Folder
                        size={15}
                        className={node.isNewInDb ? 'text-emerald-600 shrink-0' : 'text-amber-500 shrink-0'}
                      />
                    )}

                    <span className={`truncate ${isSelected ? 'font-black' : 'font-bold'}`}>
                      {node.name}
                    </span>

                    {node.isNewInDb && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black shrink-0">
                        NEW 드라이브
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {hasSubFolders ? `${node.subFolders.length}폴더` : ''}
                      {hasSubFolders && fileCount > 0 ? ' · ' : ''}
                      {fileCount > 0 ? `${fileCount}문제` : !hasSubFolders && !node.isNewInDb ? '0문제' : ''}
                    </span>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[9px] font-black">
                        선택됨
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && hasSubFolders && renderTree(node.subFolders, depth + 1, currentPath)}
              </div>
            );
          })}
      </div>
    );
  };

  if (!isOpen) return null;

  const orphans = previewData?.preview?.orphans || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl bg-white rounded-[28px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-7 py-5 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-sky-200 shrink-0">
              <FolderSync size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">폴더 미세 동기화</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-black uppercase tracking-wider">
                  Subtree Direct Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                선택한 폴더와 그 하위 몇 겹이든(신규 폴더·파일 포함) 구글 드라이브에서 직접 스캔해 1초 만에 반영합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 2단 레이아웃 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* 좌측: 학년 탭 + 검색 + 폴더 트리 */}
          <div className="lg:col-span-6 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/60 p-5 flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGrade(g)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                      selectedGrade === g
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="폴더명 검색 (예: 원곡, 모의평가...)"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="button"
                onClick={handleDiscoverNewFolders}
                disabled={isDiscovering || loadingTree}
                title={
                  selectedFolder
                    ? `[${selectedFolder.name}] 바로 아래에 새로 만든 드라이브 폴더 탐색`
                    : '현재 학년 루트 바로 아래 새 드라이브 폴더 탐색'
                }
                className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[11px] font-black flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
              >
                <CloudDownload size={14} className={isDiscovering ? 'animate-bounce' : ''} />
                <span>{isDiscovering ? '탐색 중...' : '드라이브 새 폴더 불러오기'}</span>
              </button>
            </div>

            {discoverNotice && (
              <div className="px-3 py-2 rounded-xl bg-white border border-sky-200 text-[11px] font-bold text-slate-700">
                {discoverNotice}
              </div>
            )}

            <div className="flex-1 min-h-[260px] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-3">
              {loadingTree ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-12">
                  <RefreshCw size={22} className="animate-spin text-sky-500" />
                  <span className="text-xs font-bold">폴더 구조를 불러오는 중...</span>
                </div>
              ) : displayTree.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-1 py-12">
                  <Folder size={26} />
                  <span className="text-xs font-bold">표시할 폴더가 없습니다.</span>
                </div>
              ) : (
                renderTree(displayTree)
              )}
            </div>
          </div>

          {/* 우측: 고아 삭제 옵션 + Dry-Run 미리보기 & 결과 */}
          <div className="lg:col-span-6 p-5 flex flex-col gap-3.5 min-h-0 overflow-y-auto bg-white">
            {/* 고아(삭제) 처리 옵션 (localStorage 저장) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                  <Trash2 size={13} className="text-rose-500" />
                  <span>드라이브에서 삭제된 항목(고아) 처리 방식</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                  <HardDrive size={11} className="text-slate-400" />
                  <span>선택한 옵션은 브라우저 로컬에 저장되어 재부팅 후에도 유지됩니다.</span>
                </p>
              </div>

              <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => handleChangeOrphanMode('auto')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                    orphanMode === 'auto'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  즉시 삭제 (기본)
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeOrphanMode('manual')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                    orphanMode === 'manual'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  확인 후 삭제
                </button>
              </div>
            </div>

            {!selectedFolder ? (
              <div className="flex-1 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 flex flex-col items-center justify-center text-center p-8 gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <FolderSync size={24} />
                </div>
                <p className="text-sm font-black text-slate-700">왼쪽 트리에서 동기화할 폴더를 선택하세요</p>
                <p className="text-xs text-slate-400 font-medium max-w-sm leading-relaxed">
                  폴더를 클릭하면 그 폴더와 하위의 모든 층을 드라이브에서 즉시 스캔해{' '}
                  <b className="text-slate-600">추가/갱신/삭제 예정 내역</b>을 먼저 보여드립니다.
                </p>
              </div>
            ) : (
              <>
                {/* 선택 대상 요약 */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-sky-600 truncate">
                      {selectedPath.join(' > ')}
                    </div>
                    <div className="text-sm font-black text-slate-900 mt-0.5 flex items-center gap-2">
                      <span>선택 대상: {selectedFolder.name}</span>
                      {previewData?.resolvedGrade && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-black">
                          {previewData.resolvedGrade}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => runPreview(selectedFolder)}
                    disabled={isPreviewing || isExecuting}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-black text-slate-700 flex items-center gap-1 shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isPreviewing ? 'animate-spin' : ''} />
                    <span>다시 스캔</span>
                  </button>
                </div>

                {/* 실행 완료 리포트 */}
                {executeResult && (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-sky-50 border border-emerald-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>{executeResult.message}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
                        타 폴더 영향 0건
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 text-center">
                        <div className="text-sm font-black text-blue-600">
                          {(executeResult.elapsedMs / 1000).toFixed(2)}초
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">소요 시간</div>
                      </div>
                      <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 text-center">
                        <div className="text-sm font-black text-slate-800">
                          {executeResult.driveCallCount}회
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">Drive 호출</div>
                      </div>
                      <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 text-center">
                        <div className="text-sm font-black text-emerald-600">
                          +{executeResult.addedCount} / ↻{executeResult.updatedCount}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">추가 · 갱신</div>
                      </div>
                      <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 text-center">
                        <div className="text-sm font-black text-rose-600">
                          -{executeResult.deletedOrphansCount}
                          {executeResult.skippedOrphansCount > 0
                            ? ` (보류 ${executeResult.skippedOrphansCount})`
                            : ''}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">고아 정리</div>
                      </div>
                    </div>
                  </div>
                )}

                {executeError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{executeError}</span>
                  </div>
                )}

                {/* 스캔 중 / 스캔 오류 / Dry-Run 결과 */}
                {isPreviewing ? (
                  <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/40 flex flex-col items-center justify-center p-10 gap-2.5">
                    <RefreshCw size={24} className="animate-spin text-sky-600" />
                    <span className="text-xs font-black text-slate-700">
                      [{selectedFolder.name}] 하위 전체 드라이브 스캔 중...
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      몇 겹이든 끝층까지 빠짐없이 확인하고 있습니다.
                    </span>
                  </div>
                ) : previewError ? (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{previewError}</span>
                  </div>
                ) : previewData ? (
                  <div className="flex-1 flex flex-col gap-3 min-h-0">
                    {/* 통계 3칸 */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                        <div className="text-lg font-black text-emerald-600">
                          +{previewData.stats.addTotal}
                        </div>
                        <div className="text-[11px] font-bold text-emerald-800">
                          신규 ({previewData.stats.addFolders}폴더 · {previewData.stats.addFiles}문제)
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-center">
                        <div className="text-lg font-black text-blue-600">
                          {previewData.stats.updateTotal}
                        </div>
                        <div className="text-[11px] font-bold text-blue-800">정보/이미지 갱신</div>
                      </div>
                      <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-center">
                        <div className="text-lg font-black text-rose-600">
                          {previewData.stats.orphanTotal}
                        </div>
                        <div className="text-[11px] font-bold text-rose-800">삭제(고아) 감지</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between px-1">
                      <span>
                        스캔 완료 ({(previewData.elapsedMs / 1000).toFixed(2)}초 ·{' '}
                        {previewData.scannedFoldersCount}폴더 / {previewData.scannedFilesCount}문제 · Drive 호출{' '}
                        {previewData.driveCallCount}회)
                      </span>
                      <span>변경 없음 {previewData.stats.unchangedTotal}건</span>
                    </div>

                    {/* 변경 상세 리스트 */}
                    <div className="flex-1 min-h-[160px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                      {previewData.stats.addTotal === 0 &&
                      previewData.stats.updateTotal === 0 &&
                      previewData.stats.orphanTotal === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-6 text-slate-400 gap-1">
                          <CheckCircle2 size={22} className="text-emerald-500" />
                          <span className="text-xs font-bold text-slate-600">
                            구글 드라이브와 DB가 이미 100% 일치합니다!
                          </span>
                        </div>
                      ) : (
                        <>
                          {previewData.preview.addedFolders.map((f) => (
                            <div
                              key={f.drive_id}
                              className="px-3 py-2 rounded-xl bg-white border border-emerald-200 flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate font-bold text-slate-700">
                                <span className="text-emerald-600 font-black mr-1.5">[+ 신규 폴더]</span>
                                {f.path}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-black shrink-0">
                                추가
                              </span>
                            </div>
                          ))}

                          {previewData.preview.addedFiles.map((f) => (
                            <div
                              key={f.drive_id}
                              className="px-3 py-2 rounded-xl bg-white border border-emerald-100 flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate font-semibold text-slate-700">
                                <span className="text-emerald-600 font-black mr-1.5">[+ 신규 문항]</span>
                                {f.path}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black shrink-0">
                                추가
                              </span>
                            </div>
                          ))}
                          {previewData.stats.addFiles > previewData.preview.addedFiles.length && (
                            <div className="text-[11px] text-emerald-700 font-bold px-2">
                              ... 외 신규 문항 {previewData.stats.addFiles - previewData.preview.addedFiles.length}건 더 있음
                            </div>
                          )}

                          {previewData.preview.updatedItems.map((u) => (
                            <div
                              key={u.drive_id}
                              className="px-3 py-2 rounded-xl bg-white border border-blue-200 flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate font-semibold text-slate-700">
                                <span className="text-blue-600 font-black mr-1.5">[↻ 갱신]</span>
                                {u.path}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-black shrink-0">
                                업데이트
                              </span>
                            </div>
                          ))}
                          {previewData.stats.updateTotal > previewData.preview.updatedItems.length && (
                            <div className="text-[11px] text-blue-700 font-bold px-2">
                              ... 외 갱신 {previewData.stats.updateTotal - previewData.preview.updatedItems.length}건 더 있음
                            </div>
                          )}

                          {/* 고아 항목 목록 */}
                          {orphans.length > 0 && (
                            <div className="pt-1 space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[11px] font-black text-rose-700">
                                  {orphanMode === 'manual'
                                    ? `삭제할 고아 항목 선택 (${selectedOrphanIds.size}/${orphans.length}건 선택됨)`
                                    : `실행 시 자동 정리될 고아 항목 (${orphans.length}건)`}
                                </span>
                                {orphanMode === 'manual' && (
                                  <button
                                    type="button"
                                    onClick={toggleAllOrphans}
                                    className="text-[11px] font-black text-rose-600 hover:underline"
                                  >
                                    {selectedOrphanIds.size === orphans.length ? '전체 해제' : '전체 선택'}
                                  </button>
                                )}
                              </div>

                              {orphans.map((o) => {
                                const isChecked = selectedOrphanIds.has(o.drive_id);
                                return (
                                  <div
                                    key={o.drive_id}
                                    onClick={() => orphanMode === 'manual' && toggleOrphanCheck(o.drive_id)}
                                    className={`px-3 py-2 rounded-xl bg-white border flex items-center justify-between gap-2 text-xs ${
                                      orphanMode === 'manual'
                                        ? 'cursor-pointer hover:bg-rose-50/50 border-rose-200'
                                        : 'border-rose-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {orphanMode === 'manual' && (
                                        <span className="text-rose-600 shrink-0">
                                          {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                                        </span>
                                      )}
                                      <span className="truncate font-semibold text-slate-700">
                                        <span className="text-rose-600 font-black mr-1.5">
                                          [- 삭제({o.type === 'folder' ? '폴더' : '문항'})]
                                        </span>
                                        {o.path}
                                      </span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-black shrink-0">
                                      {orphanMode === 'auto' ? '즉시 삭제' : isChecked ? '삭제 확정' : '보류'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* 안전 범위 안내 */}
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 flex items-start gap-2">
                      <ShieldCheck size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        안전 범위 잠금: 업서트 및 고아 삭제는 <b>[{selectedFolder.name}] 하위 트리 내부에만</b> 적용되며, 다른 폴더·학년은 건드리지 않습니다. (&lsquo;쌍둥이&rsquo; 폴더 자동 제외)
                      </span>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-7 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <Sparkles size={14} className="text-sky-500 shrink-0" />
            <span>
              이미 출제된 문항의 정답 수정·재채점은 대시보드의 <b>특정 파일 세밀수정</b>을 이용해 주세요.
            </span>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
            >
              닫기
            </button>
            <button
              type="button"
              disabled={!selectedFolder || isPreviewing || isExecuting}
              onClick={handleExecuteSync}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-sky-200 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95"
            >
              {isExecuting ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>미세 동기화 실행 중...</span>
                </>
              ) : (
                <>
                  <PlusCircle size={15} />
                  <span>
                    {selectedFolder
                      ? `[${selectedFolder.name}] 미세 동기화 실행`
                      : '폴더 미세 동기화 실행'}
                  </span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
