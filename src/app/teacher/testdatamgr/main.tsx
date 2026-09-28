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
  Sparkles, 
  Loader2, 
  Check, 
  Eye, 
  AlertCircle, 
  Search, 
  BookOpen,
  Filter
} from 'lucide-react';
import { ExamLibraryNode } from '@/lib/examLibraryTree';
import { TestCategory, TestBankItem } from '@/app/api/test2/bank/route';

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];

export default function TestDataManagerMain() {
  const [selectedGrade, setSelectedGrade] = useState('중3');

  // 원천 DB 상태
  const [rawTree, setRawTree] = useState<ExamLibraryNode[]>([]);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [selectedRawFiles, setSelectedRawFiles] = useState<{ drive_id: string; name: string; question_image_drive_id?: string | null }[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // 시험 DB 상태 (카테고리 & 아이템)
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [bankItems, setBankItems] = useState<TestBankItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // 카테고리 모달 상태 (추가 / 수정)
  const [categoryModalMode, setCategoryModalMode] = useState<'create' | 'edit' | null>(null);
  const [categoryModalName, setCategoryModalName] = useState('');
  const [editingCategory, setEditingCategory] = useState<TestCategory | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // 미리보기 모달
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 1. 특정 학년의 원천 DB 로드
  const loadRawLibrary = async (grade: string) => {
    try {
      setLoadingRaw(true);
      setSelectedRawFiles([]);
      const res = await fetch(`/api/test2/raw-library?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tree)) {
        setRawTree(data.tree);
        // 기본적으로 최상위 1레벨 폴더들은 펼쳐두기
        const initialExpanded = new Set<string>();
        data.tree.forEach((node: ExamLibraryNode) => initialExpanded.add(node.drive_id));
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

        // 첫 번째 카테고리 자동 선택
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

  // 학년 변경 시 원천 DB & 시험 DB 동시 로드
  useEffect(() => {
    loadRawLibrary(selectedGrade);
    loadTestBank(selectedGrade);
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

  // 원천 DB 개별 파일 선택 토글
  const toggleRawFile = (file: { drive_id: string; name: string; question_image_drive_id?: string | null }) => {
    setSelectedRawFiles(prev => {
      const exists = prev.some(f => f.drive_id === file.drive_id);
      if (exists) return prev.filter(f => f.drive_id !== file.drive_id);
      return [...prev, file];
    });
  };

  // 폴더 내 모든 파일 일괄 선택
  const handleSelectAllInFolder = (node: ExamLibraryNode) => {
    type FileItem = { drive_id: string; name: string; question_image_drive_id?: string | null };
    const collectFiles = (n: ExamLibraryNode): FileItem[] => {
      let list: FileItem[] = n.files.map(f => ({
        drive_id: f.drive_id,
        name: f.name,
        question_image_drive_id: f.question_image_drive_id ?? null,
      }));
      n.subFolders.forEach(sf => {
        list = [...list, ...collectFiles(sf)];
      });
      return list;
    };

    const folderFiles = collectFiles(node);
    setSelectedRawFiles(prev => {
      const set = new Set(prev.map(f => f.drive_id));
      const toAdd = folderFiles.filter(f => !set.has(f.drive_id));
      return [...prev, ...toAdd];
    });
  };

  // 3. 카테고리 생성 / 수정 저장
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

  // 4. 원천 DB 선택 문제들을 시험 DB 카테고리에 담기 (가져오기)
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
    if (!confirm(`'${item.name}' 문제를 이 카테고리에서 제거하시겠습니까?`)) return;

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

  const activeCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  // 원천 DB 트리 렌더러 (재귀)
  const renderRawTree = (nodes: ExamLibraryNode[], depth = 0) => {
    return (
      <div className={`space-y-1 ${depth > 0 ? 'ml-3 pl-2.5 border-l border-slate-200' : ''}`}>
        {nodes.map(node => {
          const isFolder = node.type === 'folder';
          const isExpanded = expandedFolders.has(node.drive_id);
          const hasChildren = node.subFolders.length > 0 || node.files.length > 0;

          if (isFolder) {
            return (
              <div key={node.drive_id} className="text-xs">
                <div
                  className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100 group transition-colors cursor-pointer select-none"
                  onClick={() => toggleFolder(node.drive_id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {hasChildren ? (
                      isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
                    ) : (
                      <div className="w-3.5" />
                    )}
                    {isExpanded ? (
                      <FolderOpen size={16} className="text-amber-500 shrink-0" />
                    ) : (
                      <Folder size={16} className="text-amber-500 shrink-0" />
                    )}
                    <span className="font-bold text-slate-700 truncate">{node.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({node.subFolders.length > 0 ? `${node.subFolders.length}폴더 ` : ''}{node.files.length}문제)
                    </span>
                  </div>

                  {node.files.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleSelectAllInFolder(node); }}
                      className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded text-[10px] font-bold transition-all shrink-0"
                    >
                      + 폴더 전체 선택
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-1">
                    {node.subFolders.length > 0 && renderRawTree(node.subFolders, depth + 1)}
                    {node.files.length > 0 && (
                      <div className="ml-5 pl-2 border-l border-slate-200 space-y-1 mt-1">
                        {node.files.map(fileNode => {
                          const isSelected = selectedRawFiles.some(f => f.drive_id === fileNode.drive_id);
                          return (
                            <div
                              key={fileNode.drive_id}
                              onClick={() => toggleRawFile({
                                drive_id: fileNode.drive_id,
                                name: fileNode.name,
                                question_image_drive_id: fileNode.question_image_drive_id,
                              })}
                              className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                isSelected ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200' : 'hover:bg-slate-100 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                {isSelected ? (
                                  <CheckSquare size={15} className="text-indigo-600 shrink-0" />
                                ) : (
                                  <Square size={15} className="text-slate-300 shrink-0" />
                                )}
                                <FileText size={14} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                                <span className="truncate">{fileNode.name}</span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenPreview(fileNode.drive_id); }}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors"
                                title="문제 미리보기"
                              >
                                <Eye size={13} />
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
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
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
          <p className="text-sm font-medium text-slate-500">
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

      {/* 2. 메인 2분할 레이아웃: 좌측(원천 DB) + 중앙 액션 + 우측(시험 DB) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── 좌측: 원천 DB 탐색기 (우리 DB 전체) ── */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 min-h-[650px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <FolderOpen size={18} className="text-amber-500" />
                <span>{selectedGrade} 원천 DB 라이브러리</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                동기화된 전체 폴더 및 문제 파일 목록 (체크하여 우측 시험 DB로 담기)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
                선택됨: {selectedRawFiles.length}개
              </span>
              {selectedRawFiles.length > 0 && (
                <button
                  onClick={() => setSelectedRawFiles([])}
                  className="text-xs text-slate-400 hover:text-rose-500 font-bold"
                >
                  선택 해제
                </button>
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
                [+ 카테고리 추가] 버튼을 눌러 카테고리(예: '1학기 기말 기출')를 먼저 만들어주세요.
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

          {/* 중앙 담기 액션 바 (원천 DB에서 선택한 문제 담기) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              현재 선택된 카테고리:{' '}
              <strong className="text-indigo-600 font-black">
                {activeCategory ? activeCategory.name : '(카테고리 없음)'}
              </strong>
            </div>

            <button
              onClick={handleAddSelectedToCategory}
              disabled={!activeCategory || selectedRawFiles.length === 0}
              className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <span>선택한 {selectedRawFiles.length}개 문제 시험자료로 담기</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* 선택된 카테고리에 등록된 시험 문제 리스트 */}
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
              <span>등록된 문제 ({currentCategoryItems.length}개)</span>
              <span>* 여기서 구축된 문제가 [테스트 관리] 시험지 제작 시 라이브러리에 뜹니다</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1 scrollbar-thin">
              {currentCategoryItems.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 space-y-2">
                  <CheckSquare size={28} className="mx-auto opacity-30" />
                  <p>이 카테고리에 등록된 시험 문제가 없습니다.</p>
                  <p className="text-[11px] text-slate-400">
                    왼쪽 원천 DB에서 문제를 선택한 후 상단의 [시험자료로 담기]를 눌러주세요.
                  </p>
                </div>
              ) : (
                currentCategoryItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-indigo-600 text-white font-black flex items-center justify-center text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 truncate">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenPreview(item.drive_id)}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                      >
                        <Eye size={12} />
                        보기
                      </button>
                      <button
                        onClick={() => handleDeleteBankItem(item)}
                        className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-1"
                        title="제거"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* 3. 카테고리 추가 / 수정 모달 */}
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
                  placeholder="예: 1학기 기말 기출 모음, 단원평가 등"
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

      {/* 4. 문제 미리보기 모달 */}
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
