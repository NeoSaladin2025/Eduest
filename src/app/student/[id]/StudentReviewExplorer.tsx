'use client';

import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FolderPlus, 
  FileText, 
  Trash2, 
  Edit3, 
  ArrowLeft, 
  Search, 
  Play, 
  MoveRight, 
  Check, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Sparkles,
  BookOpen,
  Database,
  GripVertical,
  Layers
} from 'lucide-react';
import { ReviewFolder, ReviewItem, StudentReviewData } from './types';

interface StudentReviewExplorerProps {
  studentId: string;
  reviewData: StudentReviewData;
  onUpdateReviewData: (newData: StudentReviewData) => void;
  onOpenFileForReview: (file: ReviewItem, fileList: ReviewItem[]) => void;
  gasRecords?: any[];
  gasCartridges?: string[];
  onOpenGasCartridge?: (cartridgeName: string) => void;
}

export default function StudentReviewExplorer({
  studentId,
  reviewData,
  onUpdateReviewData,
  onOpenFileForReview,
  gasRecords = [],
  gasCartridges = [],
  onOpenGasCartridge,
}: StudentReviewExplorerProps) {
  // Current active folder in right pane: null means Root (내 복습 홈)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Expanded folders in left tree
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Drag and Drop state
  const [draggedItem, setDraggedItem] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
    sourceFolderId?: string | null;
  } | null>(null);

  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null); // 'root' or folderId

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<ReviewFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [moveTargetItem, setMoveTargetItem] = useState<ReviewItem | null>(null);
  const [selectedDestFolderId, setSelectedDestFolderId] = useState<string>('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle tree expand/collapse
  const toggleExpand = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // 1. Current active folder object
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return reviewData.folders.find(f => f.id === currentFolderId) || null;
  }, [currentFolderId, reviewData.folders]);

  // 2. Breadcrumb trail from root to current folder
  const breadcrumbTrail = useMemo(() => {
    if (!currentFolderId) return [];
    const trail: ReviewFolder[] = [];
    let curr = reviewData.folders.find(f => f.id === currentFolderId);
    while (curr) {
      trail.unshift(curr);
      curr = curr.parentId ? reviewData.folders.find(f => f.id === curr!.parentId) : undefined;
    }
    return trail;
  }, [currentFolderId, reviewData.folders]);

  // 3. Subfolders in current folder
  const currentSubfolders = useMemo(() => {
    return reviewData.folders.filter(f => {
      if (currentFolderId === null) {
        return !f.parentId;
      }
      return f.parentId === currentFolderId;
    });
  }, [currentFolderId, reviewData.folders]);

  // 4. Files directly inside current folder
  const currentFiles = useMemo(() => {
    if (!currentFolderId) return [];
    return reviewData.items.filter(item => item.folderId === currentFolderId);
  }, [currentFolderId, reviewData.items]);

  // 5. Filtered subfolders & files by search
  const filteredSubfolders = useMemo(() => {
    if (!searchTerm.trim()) return currentSubfolders;
    return currentSubfolders.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentSubfolders, searchTerm]);

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) return currentFiles;
    return currentFiles.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentFiles, searchTerm]);

  // Helper: check if candidateDescendantId is in the subtree of folderId
  const isDescendantOf = (candidateDescendantId: string, folderId: string): boolean => {
    if (candidateDescendantId === folderId) return true;
    let curr = reviewData.folders.find(f => f.id === candidateDescendantId);
    while (curr && curr.parentId) {
      if (curr.parentId === folderId) return true;
      curr = reviewData.folders.find(f => f.id === curr!.parentId);
    }
    return false;
  };

  // ── Drag & Drop Handlers ─────────────────────────────────────
  const handleDragStart = (
    e: React.DragEvent,
    type: 'folder' | 'file',
    id: string,
    name: string,
    sourceFolderId?: string | null
  ) => {
    e.stopPropagation();
    const itemData = { type, id, name, sourceFolderId };
    setDraggedItem(itemData);
    e.dataTransfer.setData('application/json', JSON.stringify(itemData));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTargetId !== targetId) {
      setDragOverTargetId(targetId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTargetId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, destFolderId: string | 'root') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTargetId(null);

    if (!draggedItem) return;

    // Case A: Dropping a FOLDER
    if (draggedItem.type === 'folder') {
      const sourceFolder = reviewData.folders.find(f => f.id === draggedItem.id);
      if (!sourceFolder) return;

      if (destFolderId === 'root') {
        // Move to root
        if (!sourceFolder.parentId) {
          setDraggedItem(null);
          return; // Already at root
        }
        const nextFolders = reviewData.folders.map(f =>
          f.id === sourceFolder.id ? { ...f, parentId: null } : f
        );
        onUpdateReviewData({ ...reviewData, folders: nextFolders });
        showToast(`'${sourceFolder.name}' 폴더가 최상위(내 복습 홈)로 이동되었습니다. 📁`);
      } else {
        // Move into another folder
        if (destFolderId === sourceFolder.id) return;
        if (isDescendantOf(destFolderId, sourceFolder.id)) {
          alert('하위 폴더를 자기 자신 또는 자신의 하위 폴더 안으로 넣을 수 없습니다.');
          setDraggedItem(null);
          return;
        }
        if (sourceFolder.parentId === destFolderId) {
          setDraggedItem(null);
          return; // Already in that folder
        }

        const destFolder = reviewData.folders.find(f => f.id === destFolderId);
        if (!destFolder) return;

        const nextFolders = reviewData.folders.map(f =>
          f.id === sourceFolder.id ? { ...f, parentId: destFolder.id } : f
        );
        onUpdateReviewData({ ...reviewData, folders: nextFolders });
        // Expand the target folder so the user sees the dropped item
        setExpandedFolderIds(prev => new Set([...prev, destFolder.id]));
        showToast(`'${sourceFolder.name}' 폴더가 '${destFolder.name}' 안으로 이동되었습니다! 📂`);
      }
    }

    // Case B: Dropping a FILE
    if (draggedItem.type === 'file') {
      if (destFolderId === 'root') {
        alert('문제 파일은 특정 폴더 안에 보관해야 합니다. 대상 폴더를 선택해주세요.');
        setDraggedItem(null);
        return;
      }
      if (draggedItem.sourceFolderId === destFolderId) {
        setDraggedItem(null);
        return; // Already in this folder
      }

      const destFolder = reviewData.folders.find(f => f.id === destFolderId);
      if (!destFolder) return;

      const nextItems = reviewData.items.map(item =>
        item.id === draggedItem.id
          ? { ...item, folderId: destFolder.id, folderName: destFolder.name }
          : item
      );

      onUpdateReviewData({ ...reviewData, items: nextItems });
      showToast(`'${draggedItem.name}' 문제가 '${destFolder.name}' 폴더로 이동되었습니다! 📄`);
    }

    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverTargetId(null);
  };

  // ── Folder CRUD ──────────────────────────────────────────────
  const handleOpenCreateFolder = (parentId: string | null = currentFolderId) => {
    setNewFolderParentId(parentId);
    setNewFolderName('');
    setIsNewFolderOpen(true);
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      alert('폴더 이름을 입력해주세요.');
      return;
    }
    if (reviewData.folders.some(f => f.name === trimmed && f.parentId === newFolderParentId)) {
      alert('이 위치에 동일한 이름의 폴더가 이미 존재합니다.');
      return;
    }

    const newFolder: ReviewFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      parentId: newFolderParentId,
    };

    const nextData: StudentReviewData = {
      ...reviewData,
      folders: [...reviewData.folders, newFolder],
    };

    if (newFolderParentId) {
      setExpandedFolderIds(prev => new Set([...prev, newFolderParentId]));
    }

    onUpdateReviewData(nextData);
    setNewFolderName('');
    setIsNewFolderOpen(false);
    showToast(`'${trimmed}' 폴더가 생성되었습니다. 📁`);
  };

  const handleRenameFolder = () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      alert('새 폴더 이름을 입력해주세요.');
      return;
    }

    const nextFolders = reviewData.folders.map(f =>
      f.id === renameTarget.id ? { ...f, name: trimmed } : f
    );

    const nextItems = reviewData.items.map(item =>
      item.folderId === renameTarget.id ? { ...item, folderName: trimmed } : item
    );

    onUpdateReviewData({
      folders: nextFolders,
      items: nextItems,
    });

    setRenameTarget(null);
    showToast(`폴더 이름이 '${trimmed}'(으)로 변경되었습니다.`);
  };

  const handleDeleteFolder = (folder: ReviewFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    // Gather all descendant folder IDs
    const toDeleteIds = new Set<string>([folder.id]);
    const queue = [folder.id];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      reviewData.folders
        .filter(f => f.parentId === parent)
        .forEach(child => {
          toDeleteIds.add(child.id);
          queue.push(child.id);
        });
    }

    const fileCount = reviewData.items.filter(i => toDeleteIds.has(i.folderId)).length;
    const msg = fileCount > 0
      ? `'${folder.name}' 폴더와 하위 폴더/문제 ${fileCount}개를 모두 삭제하시겠습니까?`
      : `'${folder.name}' 폴더를 삭제하시겠습니까?`;

    if (!confirm(msg)) return;

    const nextFolders = reviewData.folders.filter(f => !toDeleteIds.has(f.id));
    const nextItems = reviewData.items.filter(i => !toDeleteIds.has(i.folderId));

    onUpdateReviewData({
      folders: nextFolders,
      items: nextItems,
    });

    if (currentFolderId && toDeleteIds.has(currentFolderId)) {
      setCurrentFolderId(folder.parentId || null);
    }
    showToast(`'${folder.name}' 폴더가 삭제되었습니다.`);
  };

  const handleDeleteFile = (file: ReviewItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`'${file.name}' 문제를 복습 목록에서 제거하시겠습니까?`)) return;

    const nextItems = reviewData.items.filter(i => i.id !== file.id);
    onUpdateReviewData({
      ...reviewData,
      items: nextItems,
    });
    showToast(`'${file.name}' 문제가 제거되었습니다.`);
  };

  const handleMoveFile = () => {
    if (!moveTargetItem || !selectedDestFolderId) return;

    const destFolder = reviewData.folders.find(f => f.id === selectedDestFolderId);
    if (!destFolder) return;

    const nextItems = reviewData.items.map(item =>
      item.id === moveTargetItem.id
        ? { ...item, folderId: destFolder.id, folderName: destFolder.name }
        : item
    );

    onUpdateReviewData({
      ...reviewData,
      items: nextItems,
    });

    setMoveTargetItem(null);
    showToast(`'${moveTargetItem.name}' 문제가 '${destFolder.name}' 폴더로 이동되었습니다.`);
  };

  // ── Recursive Left Tree Node ─────────────────────────────────
  const renderFolderTreeNode = (folder: ReviewFolder, depth: number = 0) => {
    const childFolders = reviewData.folders.filter(f => f.parentId === folder.id);
    const hasChildren = childFolders.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isSelected = currentFolderId === folder.id;
    const isDragOver = dragOverTargetId === folder.id;
    const isBeingDragged = draggedItem?.type === 'folder' && draggedItem.id === folder.id;
    const itemCount = reviewData.items.filter(i => i.folderId === folder.id).length;

    return (
      <div key={folder.id} className="space-y-0.5">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id, folder.name, folder.parentId)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          onClick={() => setCurrentFolderId(folder.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between py-2 pr-2.5 rounded-xl cursor-pointer text-xs font-bold transition-all select-none border ${
            isBeingDragged
              ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-950/20'
              : isDragOver
              ? 'bg-indigo-600/40 border-indigo-400 text-white ring-2 ring-indigo-400 scale-[1.02]'
              : isSelected
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
              : 'text-slate-300 hover:text-white hover:bg-white/10 border-transparent'
          }`}
          title="클릭하여 열기 | 다른 폴더나 파일로 드래그앤드롭 가능"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(folder.id);
                }}
                className="p-0.5 text-slate-400 hover:text-white rounded"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-3.5 inline-block" />
            )}

            {isSelected || isExpanded ? (
              <FolderOpen size={16} className={isSelected ? 'text-white' : 'text-amber-400'} />
            ) : (
              <Folder size={16} className={isSelected ? 'text-white' : 'text-amber-400'} />
            )}

            <span className="truncate">{folder.name}</span>
          </div>

          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              isSelected ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
            }`}
          >
            {itemCount}
          </span>
        </div>

        {/* Recursive Children Folders */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {childFolders.map(child => renderFolderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Top level folders for left tree
  const rootLevelFolders = useMemo(() => {
    return reviewData.folders.filter(f => !f.parentId);
  }, [reviewData.folders]);

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-500 max-w-7xl mx-auto">
      
      {/* 🌟 윈도우 탐색기 2컬럼 레이아웃: [왼쪽 폴더 트리] + [오른쪽 폴더 내용] */}
      <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl backdrop-blur-3xl flex flex-col md:flex-row min-h-[680px]">
        
        {/* ── [왼쪽 패널] 폴더 구조 트리 (Windows Explorer Left Navigation Pane) ── */}
        <div className="w-full md:w-72 lg:w-80 bg-black/40 border-b md:border-b-0 md:border-r border-white/10 p-4 flex flex-col flex-shrink-0">
          
          {/* 트리 패널 헤더 */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-indigo-400" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-300">
                폴더 탐색기
              </span>
            </div>
            <button
              onClick={() => handleOpenCreateFolder(null)}
              className="p-1.5 hover:bg-white/10 text-indigo-400 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
              title="최상위에 새 폴더 만들기"
            >
              <FolderPlus size={14} />
              <span>새 폴더</span>
            </button>
          </div>

          {/* 트리 본문 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            
            {/* Root Node: 💻 내 복습 홈 (전체) */}
            <div
              onDragOver={(e) => handleDragOver(e, 'root')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnFolder(e, 'root')}
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs font-black transition-all select-none border ${
                dragOverTargetId === 'root'
                  ? 'bg-indigo-600/40 border-indigo-400 text-white ring-2 ring-indigo-400 scale-[1.02]'
                  : currentFolderId === null
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 border-transparent'
              }`}
              title="클릭 시 최상위 폴더 보기 | 여기에 폴더를 드롭하면 최상위로 꺼내집니다"
            >
              <div className="flex items-center gap-2">
                <Folder size={16} className={currentFolderId === null ? 'text-white' : 'text-indigo-400'} />
                <span>내 복습 홈 (Root)</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  currentFolderId === null ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
                }`}
              >
                {reviewData.items.length}
              </span>
            </div>

            {/* Tree Nodes */}
            {rootLevelFolders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                폴더가 없습니다.
                <br />
                [+ 새 폴더]로 생성해보세요!
              </div>
            ) : (
              rootLevelFolders.map(folder => renderFolderTreeNode(folder, 0))
            )}

            {/* Google Apps Script 기존 시험 오답 팩 (GAS) */}
            {gasCartridges.length > 0 && (
              <div className="pt-4 mt-4 border-t border-white/10 space-y-1">
                <div className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                  <Database size={12} />
                  <span>시험 오답 팩</span>
                </div>
                {gasCartridges.map(cat => {
                  const count = gasRecords.filter(r => r.name.includes(`[${cat}]`)).length;
                  return (
                    <div
                      key={cat}
                      onClick={() => onOpenGasCartridge && onOpenGasCartridge(cat)}
                      className="flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs font-bold text-slate-300 hover:text-white hover:bg-indigo-900/30 transition-all"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Database size={14} className="text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{cat}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/5 text-indigo-300 font-mono">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* D&D 설명 가이드 바 */}
          <div className="pt-3 border-t border-white/10 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
            <GripVertical size={13} className="text-indigo-400 flex-shrink-0" />
            <span>폴더/문제를 드래그하여 다른 폴더에 넣을 수 있습니다.</span>
          </div>

        </div>

        {/* ── [오른쪽 패널] 선택한 폴더 내용 (Windows Explorer Right Content Pane) ── */}
        <div className="flex-1 flex flex-col p-6 space-y-5 overflow-hidden">
          
          {/* 상단 주소 경로 바 (Breadcrumbs) & 도구 모음 */}
          <div className="space-y-3 flex-shrink-0">
            
            {/* Breadcrumb Path Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs md:text-sm">
              <div className="flex items-center gap-2 font-bold flex-1 overflow-x-auto">
                {currentFolderId !== null && (
                  <button
                    onClick={() => setCurrentFolderId(currentFolder?.parentId || null)}
                    className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-all flex items-center gap-1 font-bold mr-1"
                    title="상위 폴더로 이동"
                  >
                    <ArrowLeft size={16} />
                    <span>상위</span>
                  </button>
                )}

                {/* Root Breadcrumb (Drop target to un-nest) */}
                <button
                  onDragOver={(e) => handleDragOver(e, 'root')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnFolder(e, 'root')}
                  onClick={() => setCurrentFolderId(null)}
                  className={`hover:text-indigo-400 transition-colors flex items-center gap-1.5 rounded px-1.5 py-0.5 ${
                    dragOverTargetId === 'root'
                      ? 'bg-indigo-600/40 text-white ring-2 ring-indigo-400'
                      : currentFolderId === null
                      ? 'text-indigo-400 font-black'
                      : 'text-slate-400 font-bold'
                  }`}
                >
                  <Folder size={15} />
                  <span>내 복습 홈</span>
                </button>

                {breadcrumbTrail.map(folder => {
                  const isCurrent = folder.id === currentFolderId;
                  const isDragOver = dragOverTargetId === folder.id;

                  return (
                    <React.Fragment key={folder.id}>
                      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                      <button
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                        onClick={() => setCurrentFolderId(folder.id)}
                        className={`hover:text-amber-300 transition-colors flex items-center gap-1 rounded px-1.5 py-0.5 truncate max-w-[180px] ${
                          isDragOver
                            ? 'bg-indigo-600/40 text-white ring-2 ring-indigo-400'
                            : isCurrent
                            ? 'text-white font-black'
                            : 'text-slate-400 font-bold'
                        }`}
                      >
                        <FolderOpen size={15} className="text-amber-400 flex-shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {toastMessage && (
                <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-xl border border-emerald-500/30 animate-pulse flex items-center gap-1">
                  <Check size={13} /> {toastMessage}
                </span>
              )}
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleOpenCreateFolder(currentFolderId)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-indigo-600/30"
                  title="현재 위치에 새 폴더를 생성합니다"
                >
                  <FolderPlus size={16} />
                  {currentFolder ? '하위 폴더 만들기' : '새 폴더 만들기'}
                </button>

                {currentFiles.length > 0 && (
                  <button
                    onClick={() => onOpenFileForReview(currentFiles[0], currentFiles)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-emerald-600/30"
                  >
                    <Play size={15} fill="currentColor" />
                    이 폴더 전체 학습 ({currentFiles.length}문항)
                  </button>
                )}
              </div>

              {/* 검색창 */}
              <div className="relative w-full md:w-60">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="이 폴더 안 검색..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

          </div>

          {/* ── 메인 컨텐츠 영역 (하위 폴더들 + 문제 파일들) ── */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
            
            {/* 1. 하위 폴더 그리드 (Subfolders) */}
            {filteredSubfolders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                  <Folder size={14} className="text-amber-400" />
                  <span>폴더 ({filteredSubfolders.length})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredSubfolders.map(folder => {
                    const itemCount = reviewData.items.filter(i => i.folderId === folder.id).length;
                    const childCount = reviewData.folders.filter(f => f.parentId === folder.id).length;
                    const isDragOver = dragOverTargetId === folder.id;
                    const isBeingDragged = draggedItem?.type === 'folder' && draggedItem.id === folder.id;

                    return (
                      <div
                        key={folder.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'folder', folder.id, folder.name, folder.parentId)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                        onClick={() => setCurrentFolderId(folder.id)}
                        className={`group bg-white/5 hover:bg-white/[0.09] border rounded-2xl p-5 cursor-pointer transition-all shadow-lg flex flex-col justify-between min-h-[140px] relative select-none ${
                          isBeingDragged
                            ? 'opacity-40 border-dashed border-indigo-400'
                            : isDragOver
                            ? 'bg-indigo-600/30 border-indigo-400 ring-2 ring-indigo-400 scale-[1.02]'
                            : 'border-white/10 hover:border-amber-400/50 hover:scale-[1.01]'
                        }`}
                        title="더블클릭 또는 클릭하여 열기 | 드래그하여 다른 폴더에 넣기 가능"
                      >
                        <div className="flex items-start justify-between">
                          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-black transition-all shadow-inner">
                            <Folder size={24} fill="currentColor" />
                          </div>

                          {/* 폴더 액션 (수정 / 삭제) */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTarget(folder);
                                setRenameValue(folder.name);
                              }}
                              className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                              title="폴더 이름 변경"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFolder(folder, e)}
                              className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                              title="폴더 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 mt-3">
                          <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors truncate">
                            {folder.name}
                          </h4>
                          <p className="text-[11px] font-bold text-slate-500">
                            {childCount > 0 ? `하위 ${childCount}개 폴더 · ` : ''}
                            {itemCount}개 문항
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. 문제 파일 그리드 (Files) */}
            {filteredFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                  <FileText size={14} className="text-indigo-400" />
                  <span>문제 파일 ({filteredFiles.length})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredFiles.map((file, idx) => {
                    const isBeingDragged = draggedItem?.type === 'file' && draggedItem.id === file.id;

                    return (
                      <div
                        key={file.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'file', file.id, file.name, file.folderId)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onOpenFileForReview(file, filteredFiles)}
                        className={`group bg-white/5 hover:bg-white/[0.09] border rounded-2xl p-4.5 cursor-pointer transition-all shadow-lg flex flex-col justify-between space-y-3 select-none ${
                          isBeingDragged
                            ? 'opacity-40 border-dashed border-indigo-400'
                            : 'border-white/10 hover:border-indigo-500 hover:scale-[1.01]'
                        }`}
                        title="클릭하여 문제 풀이 보기 | 다른 폴더로 드래그앤드롭하여 이동 가능"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center">
                              {idx + 1}
                            </div>
                            <div>
                              <h5 className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors truncate max-w-[140px]">
                                {file.name.replace(/\.html?$/i, '')}
                              </h5>
                              <span className="text-[10px] font-bold text-slate-500">
                                {file.folderName}
                              </span>
                            </div>
                          </div>

                          {/* File Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveTargetItem(file);
                                setSelectedDestFolderId(file.folderId);
                              }}
                              className="p-1 hover:bg-white/10 text-slate-400 hover:text-indigo-300 rounded transition-colors"
                              title="다른 폴더로 이동"
                            >
                              <MoveRight size={13} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
                              className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors"
                              title="복습에서 제거"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5 text-slate-400">
                          <span className="text-indigo-400 font-bold">클릭하여 풀이 보기</span>
                          <Play size={12} className="text-indigo-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty Folder State */}
            {filteredSubfolders.length === 0 && filteredFiles.length === 0 && (
              <div
                onDragOver={(e) => handleDragOver(e, currentFolderId || 'root')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropOnFolder(e, currentFolderId || 'root')}
                className={`py-20 text-center border-2 border-dashed rounded-[32px] p-8 space-y-3 transition-all ${
                  dragOverTargetId === (currentFolderId || 'root')
                    ? 'bg-indigo-600/20 border-indigo-400 text-white ring-2 ring-indigo-400'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2">
                  <FolderPlus size={28} />
                </div>
                <h4 className="text-base font-black text-white">이 폴더에 담긴 내용이 없습니다.</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  여기에 폴더나 문제 파일을 드래그하여 옮기거나,
                  <br />
                  상단의 <strong className="text-indigo-400">[하위 폴더 만들기]</strong>를 눌러 새 폴더를 생성할 수 있습니다.
                </p>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ── 모달: 새 폴더 만들기 ── */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <FolderPlus size={18} className="text-indigo-400" />
                {newFolderParentId ? '새 하위 폴더 생성' : '새 폴더 생성'}
              </h3>
              <button onClick={() => setIsNewFolderOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              생성 위치:{' '}
              <strong className="text-white">
                {newFolderParentId
                  ? reviewData.folders.find(f => f.id === newFolderParentId)?.name || '상위 폴더'
                  : '내 복습 홈 (최상위)'}
              </strong>
            </p>

            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="예: 2학기 기말고사 대비, 자주 틀리는 유형"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsNewFolderOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                취소
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-600/30"
              >
                생성하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 폴더 이름 변경 ── */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 size={18} className="text-amber-400" />
                폴더 이름 변경
              </h3>
              <button onClick={() => setRenameTarget(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
              placeholder="새 폴더 이름 입력"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                취소
              </button>
              <button
                onClick={handleRenameFolder}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black transition-all shadow-md shadow-amber-500/30"
              >
                변경 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 파일 다른 폴더로 이동 ── */}
      {moveTargetItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <MoveRight size={18} className="text-indigo-400" />
                문제 이동
              </h3>
              <button onClick={() => setMoveTargetItem(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              <strong className="text-white">'{moveTargetItem.name}'</strong> 문제를 이동할 대상 폴더를 선택하세요:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 py-1 custom-scrollbar">
              {reviewData.folders.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelectedDestFolderId(f.id)}
                  className={`p-3 rounded-xl cursor-pointer border flex items-center justify-between text-xs font-bold transition-all ${
                    selectedDestFolderId === f.id
                      ? 'bg-indigo-600/30 border-indigo-500 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Folder size={15} className="text-amber-400" />
                    <span>{f.name}</span>
                  </div>
                  {selectedDestFolderId === f.id && <Check size={14} className="text-indigo-400" />}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setMoveTargetItem(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                취소
              </button>
              <button
                onClick={handleMoveFile}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-600/30"
              >
                이동하기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
