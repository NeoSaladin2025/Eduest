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
  MoreVertical, 
  Check, 
  X, 
  ChevronRight, 
  Sparkles,
  BookOpen,
  Database
} from 'lucide-react';
import { ReviewFolder, ReviewItem, StudentReviewData } from './types';

interface StudentReviewExplorerProps {
  studentId: string;
  reviewData: StudentReviewData;
  onUpdateReviewData: (newData: StudentReviewData) => void;
  onOpenFileForReview: (file: ReviewItem, fileList: ReviewItem[]) => void;
  // 기존 GAS 복습 자료 연동
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
  // Current active folder: null means Root (내 복습 폴더 홈)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameTarget, setRenameTarget] = useState<ReviewFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [moveTargetItem, setMoveTargetItem] = useState<ReviewItem | null>(null);
  const [selectedDestFolderId, setSelectedDestFolderId] = useState<string>('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Get current active folder object
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return reviewData.folders.find(f => f.id === currentFolderId) || null;
  }, [currentFolderId, reviewData.folders]);

  // Files in current folder
  const currentFolderFiles = useMemo(() => {
    if (!currentFolderId) return [];
    return reviewData.items.filter(item => item.folderId === currentFolderId);
  }, [currentFolderId, reviewData.items]);

  // Filtered folders and files by search term
  const filteredFolders = useMemo(() => {
    if (currentFolderId !== null) return []; // Folders only shown at root
    let list = reviewData.folders;
    if (searchTerm.trim()) {
      list = list.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [reviewData.folders, currentFolderId, searchTerm]);

  const filteredFiles = useMemo(() => {
    let list = currentFolderFiles;
    if (searchTerm.trim()) {
      list = list.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [currentFolderFiles, searchTerm]);

  // 1. Create New Folder
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      alert('폴더 이름을 입력해주세요.');
      return;
    }
    if (reviewData.folders.some(f => f.name === trimmed)) {
      alert('동일한 이름의 폴더가 이미 존재합니다.');
      return;
    }

    const newFolder: ReviewFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextData: StudentReviewData = {
      ...reviewData,
      folders: [...reviewData.folders, newFolder],
    };

    onUpdateReviewData(nextData);
    setNewFolderName('');
    setIsNewFolderOpen(false);
    showToast(`'${trimmed}' 폴더가 생성되었습니다. 📁`);
  };

  // 2. Rename Folder
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

    // Also update folderName on all items in this folder
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

  // 3. Delete Folder
  const handleDeleteFolder = (folder: ReviewFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = reviewData.items.filter(i => i.folderId === folder.id).length;
    const msg = count > 0 
      ? `'${folder.name}' 폴더와 내부 문제 ${count}개를 모두 복습 목록에서 삭제하시겠습니까?`
      : `'${folder.name}' 폴더를 삭제하시겠습니까?`;

    if (!confirm(msg)) return;

    const nextFolders = reviewData.folders.filter(f => f.id !== folder.id);
    const nextItems = reviewData.items.filter(i => i.folderId !== folder.id);

    onUpdateReviewData({
      folders: nextFolders,
      items: nextItems,
    });

    if (currentFolderId === folder.id) {
      setCurrentFolderId(null);
    }
    showToast(`'${folder.name}' 폴더가 삭제되었습니다.`);
  };

  // 4. Delete File from Review
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

  // 5. Move File to Another Folder
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

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500 max-w-6xl mx-auto">
      
      {/* 🌟 1. 윈도우 탐색기 스타일 헤더 & 툴바 */}
      <div className="bg-white/5 border border-white/10 rounded-[32px] p-5 md:p-6 backdrop-blur-3xl shadow-2xl space-y-4">
        
        {/* 상단 주소 경로 바 (Breadcrumbs / Address Bar) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs md:text-sm">
          <div className="flex items-center gap-2 font-bold flex-1 overflow-x-auto">
            {currentFolderId !== null && (
              <button
                onClick={() => setCurrentFolderId(null)}
                className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-all flex items-center gap-1 font-bold mr-1"
                title="상위 폴더로 이동"
              >
                <ArrowLeft size={16} />
                <span>뒤로</span>
              </button>
            )}

            <button
              onClick={() => setCurrentFolderId(null)}
              className={`hover:text-indigo-400 transition-colors flex items-center gap-1 ${
                currentFolderId === null ? 'text-indigo-400 font-black' : 'text-slate-400 font-bold'
              }`}
            >
              <Folder size={16} />
              <span>내 복습 홈</span>
            </button>

            {currentFolder && (
              <>
                <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                <span className="text-white font-black flex items-center gap-1">
                  <FolderOpen size={16} className="text-amber-400" />
                  {currentFolder.name}
                </span>
              </>
            )}
          </div>

          {toastMessage && (
            <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-xl border border-emerald-500/30 animate-pulse flex items-center gap-1">
              <Check size={13} /> {toastMessage}
            </span>
          )}
        </div>

        {/* 툴바 커맨드 버튼 영역 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* 새 폴더 만들기 버튼 */}
            <button
              onClick={() => {
                setNewFolderName('');
                setIsNewFolderOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-indigo-600/30"
            >
              <FolderPlus size={16} />
              새 폴더 만들기
            </button>

            {/* 현재 폴더 전체 연속 학습 시작 버튼 */}
            {currentFolder && currentFolderFiles.length > 0 && (
              <button
                onClick={() => {
                  onOpenFileForReview(currentFolderFiles[0], currentFolderFiles);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-emerald-600/30"
              >
                <Play size={15} fill="currentColor" />
                이 폴더 전체 연속 학습 ({currentFolderFiles.length}문항)
              </button>
            )}
          </div>

          {/* 검색창 */}
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="폴더 또는 문제 검색..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

      </div>

      {/* 🌟 2. 윈도우 탐색기 메인 컨텐츠 영역 */}
      <div className="min-h-[400px]">
        {/* Case A: Root Folder View (내 복습 홈) */}
        {currentFolderId === null ? (
          <div className="space-y-8">
            
            {/* 라이브러리에서 체크하여 정리된 폴더들 */}
            <div>
              <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                <Folder size={14} className="text-amber-400" />
                <span>정리된 복습 폴더 ({filteredFolders.length})</span>
              </div>

              {filteredFolders.length === 0 && gasCartridges.length === 0 ? (
                <div className="py-20 text-center bg-white/5 border border-dashed border-white/10 rounded-[36px] space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                    <FolderPlus size={32} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-black text-white">아직 생성된 복습 폴더가 없습니다.</p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      상단의 [새 폴더 만들기]를 누르거나, 라이브러리(Library)에서 문제 하단의 체크박스를 체크하면 해당 회차 폴더가 자동으로 생성되어 담깁니다!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {filteredFolders.map(folder => {
                    const itemCount = reviewData.items.filter(i => i.folderId === folder.id).length;

                    return (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="group bg-white/5 hover:bg-white/[0.09] border border-white/10 hover:border-amber-400/50 rounded-[28px] p-6 cursor-pointer transition-all shadow-xl hover:shadow-amber-500/10 hover:scale-[1.02] flex flex-col justify-between min-h-[170px] relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between">
                          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-black transition-all shadow-inner">
                            <Folder size={26} fill="currentColor" />
                          </div>

                          {/* 폴더 액션 (수정 / 삭제) */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTarget(folder);
                                setRenameValue(folder.name);
                              }}
                              className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                              title="폴더 이름 변경"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFolder(folder, e)}
                              className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                              title="폴더 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 mt-4">
                          <h4 className="text-base font-black text-white group-hover:text-amber-300 transition-colors truncate">
                            {folder.name}
                          </h4>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {itemCount}개 문항 담김
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 기존 구글 드라이브 동기화 오답 팩 (GAS Cartridges) */}
            {gasCartridges.length > 0 && (
              <div className="pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">
                  <Database size={14} />
                  <span>시험 오답 복습 팩 (Google Drive 연동)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {gasCartridges.map(cat => {
                    const count = gasRecords.filter(r => r.name.includes(`[${cat}]`)).length;
                    return (
                      <div
                        key={cat}
                        onClick={() => {
                          if (onOpenGasCartridge) onOpenGasCartridge(cat);
                        }}
                        className="group bg-indigo-950/30 hover:bg-indigo-900/50 border border-indigo-500/30 hover:border-indigo-400 rounded-[28px] p-6 cursor-pointer transition-all shadow-xl hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-inner">
                          <Database size={24} />
                        </div>
                        <div className="space-y-1 mt-4">
                          <h4 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors truncate">
                            {cat}
                          </h4>
                          <p className="text-xs font-bold text-indigo-400/80 uppercase tracking-wider">
                            {count} units
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        ) : (
          /* Case B: Inside a Folder (해당 폴더 내부 파일 목록 뷰) */
          <div className="space-y-6">
            
            {filteredFiles.length === 0 ? (
              <div className="py-20 text-center bg-white/5 border border-dashed border-white/10 rounded-[36px] space-y-4">
                <FileText size={40} className="mx-auto text-slate-600" />
                <div className="space-y-1">
                  <p className="text-base font-black text-white">이 폴더에 담긴 문제가 없습니다.</p>
                  <p className="text-xs text-slate-400">
                    라이브러리(Library)에서 원하는 문제 하단의 체크박스를 체크하여 이 폴더로 가져올 수 있습니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredFiles.map((file, idx) => (
                  <div
                    key={file.id}
                    onClick={() => onOpenFileForReview(file, filteredFiles)}
                    className="group bg-white/5 hover:bg-white/[0.09] border border-white/10 hover:border-indigo-500 rounded-2xl p-4.5 cursor-pointer transition-all shadow-lg hover:scale-[1.01] flex flex-col justify-between space-y-3"
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

                      {/* File Card Actions */}
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
                          <MoveRight size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteFile(file, e)}
                          className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          title="복습에서 제거"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5 text-slate-400">
                      <span className="text-indigo-400 font-bold">클릭하여 문제 풀이 보기</span>
                      <Play size={12} className="text-indigo-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* 🌟 3. 모달: 새 폴더 만들기 */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <FolderPlus size={18} className="text-indigo-400" />
                새 복습 폴더 생성
              </h3>
              <button onClick={() => setIsNewFolderOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

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

      {/* 🌟 4. 모달: 폴더 이름 변경 */}
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

      {/* 🌟 5. 모달: 파일 다른 폴더로 이동 */}
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

            <div className="max-h-60 overflow-y-auto space-y-2 py-1">
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
