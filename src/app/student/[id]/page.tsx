'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  Loader2, Database, Library, ArrowLeft, ArrowRight, ChevronRight, Lock, Zap, BookOpen 
} from 'lucide-react';
import TestModule from './test/test';
import { useStudentData } from './useStudentData';
import StudentHomeworkView from './StudentHomeworkView';
import StudentReviewExplorer from './StudentReviewExplorer';
import { StudentReviewData, ReviewItem } from './types';

const GAS_LIBRARY_PROXY = '/api/gas/library';

/** `extractNumber`와 동일: `N번` 우선, 없으면 이름 안 첫 숫자열 — 없으면 null */
function primaryNumberFromFolderName(name: string): number | null {
  const 번 = name.match(/(\d+)번/);
  if (번) return parseInt(번[1], 10);
  const any = name.match(/(\d+)/);
  if (any) return parseInt(any[1], 10);
  return null;
}

/** 숫자 있으면 숫자 오름차순, 없으면 한글 가나다. 숫자 있는 항목을 앞에 둠. */
function sortLibraryDisplayFolders<T extends { name: string }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => {
    const na = primaryNumberFromFolderName(a.name);
    const nb = primaryNumberFromFolderName(b.name);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/**
 * 폴더 접근 권한 판별:
 * 1. 폴더 본인의 drive_id가 unlocked_folders에 있으면 열림
 * 2. 하위 폴더(subFolders)가 있는 상위 폴더인 경우:
 *    하위 자손 폴더 중 최소 1개 이상이 unlocked_folders에 있으면 탐색 가능(열림)
 * 3. 하위 폴더가 없는 최종 회차 폴더인 경우:
 *    본인의 drive_id가 unlocked_folders에 있어야만 열림
 */
function isFolderAccessible(folder: any, unlockedFolders?: string[]): boolean {
  if (!unlockedFolders || unlockedFolders.length === 0) return false;
  const set = new Set(unlockedFolders);
  const folderId = folder.drive_id || folder.id;

  if (folderId && set.has(folderId)) {
    return true;
  }

  if (folder.subFolders && folder.subFolders.length > 0) {
    const hasUnlockedChild = (node: any): boolean => {
      const id = node.drive_id || node.id;
      if (id && set.has(id)) return true;
      if (node.subFolders && node.subFolders.length > 0) {
        return node.subFolders.some((child: any) => hasUnlockedChild(child));
      }
      return false;
    };
    return folder.subFolders.some((child: any) => hasUnlockedChild(child));
  }

  return false;
}

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  const { 
    student, 
    allRecords, 
    cartridges, 
    examLibrary, 
    loading, 
    dataCache, 
    fetchFileContent,
    prefetchItem,
    startStealthPrefetch, 
    extractNumber 
  } = useStudentData(resolvedParams.id);

  const [mode, setMode] = useState<'test' | 'homework' | 'review' | 'library'>('review');
  const [isTesting, setIsTesting] = useState(false);
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const [displayLibrary, setDisplayLibrary] = useState<any[]>([]);
  const [showReviewer, setShowReviewer] = useState(false);
  const [selectedList, setSelectedList] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'problem' | 'board' | 'solution'>('problem');
  const [contentData, setContentData] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);

  // 🌟 [사용자 요청] 학생 복습 폴더 및 체크 항목 상태 관리
  const [reviewData, setReviewData] = useState<StudentReviewData>({ folders: [], items: [] });
  const [currentActiveFolder, setCurrentActiveFolder] = useState<any>(null);

  // 비번 잠금
  const [pwdVerified, setPwdVerified] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState(false);

  // 학생 복습 데이터 로드 (Local Cache -> Cloud DB)
  useEffect(() => {
    if (!resolvedParams.id) return;
    const local = localStorage.getItem(`student_review_${resolvedParams.id}`);
    if (local) {
      try {
        setReviewData(JSON.parse(local));
      } catch (e) {}
    }

    fetch(`/api/student/review?studentId=${resolvedParams.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.reviewData && (data.reviewData.folders?.length > 0 || data.reviewData.items?.length > 0)) {
          setReviewData(data.reviewData);
          localStorage.setItem(`student_review_${resolvedParams.id}`, JSON.stringify(data.reviewData));
        }
      })
      .catch(err => console.error('Review data fetch error:', err));
  }, [resolvedParams.id]);

  const saveReviewData = async (newData: StudentReviewData) => {
    setReviewData(newData);
    localStorage.setItem(`student_review_${resolvedParams.id}`, JSON.stringify(newData));

    try {
      await fetch('/api/student/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: resolvedParams.id,
          reviewData: newData,
        }),
      });
    } catch (err) {
      console.error('Failed to sync review data to cloud:', err);
    }
  };

  const isRecordChecked = (recordId: string) => {
    return reviewData.items.some(item => item.fileId === recordId);
  };

  // 🌟 [2번 스샷 반영] 개별 문제 체크박스 토글 -> 해당 회차 폴더에 자동 추가/제거
  const handleToggleRecordReview = (record: any) => {
    const isChecked = isRecordChecked(record.id);
    const folderName = currentActiveFolder?.name || '라이브러리 복습';

    if (isChecked) {
      const nextItems = reviewData.items.filter(item => item.fileId !== record.id);
      saveReviewData({
        ...reviewData,
        items: nextItems,
      });
    } else {
      let folder = reviewData.folders.find(f => f.name === folderName);
      let nextFolders = [...reviewData.folders];
      if (!folder) {
        folder = {
          id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: folderName,
          createdAt: new Date().toISOString(),
        };
        nextFolders.push(folder);
      }

      const newItem: ReviewItem = {
        id: `review_${record.id}`,
        fileId: record.id,
        name: record.name,
        folderId: folder.id,
        folderName: folder.name,
        solutionUrl: record.solutionUrl || record.id,
        problemUrl: record.problemUrl || record.id,
        type: 'html',
        addedAt: new Date().toISOString(),
      };

      saveReviewData({
        folders: nextFolders,
        items: [...reviewData.items, newItem],
      });
    }
  };

  // 현재 폴더 전체 담기
  const handleSelectAllInCurrentFolder = () => {
    const folderName = currentActiveFolder?.name || '라이브러리 복습';
    let folder = reviewData.folders.find(f => f.name === folderName);
    let nextFolders = [...reviewData.folders];
    if (!folder) {
      folder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: folderName,
        createdAt: new Date().toISOString(),
      };
      nextFolders.push(folder);
    }

    const currentFolderItemsMap = new Set(reviewData.items.map(i => i.fileId));
    const newItemsToAdd: ReviewItem[] = [];

    selectedList.forEach(record => {
      if (!currentFolderItemsMap.has(record.id)) {
        newItemsToAdd.push({
          id: `review_${record.id}`,
          fileId: record.id,
          name: record.name,
          folderId: folder!.id,
          folderName: folder!.name,
          solutionUrl: record.solutionUrl || record.id,
          problemUrl: record.problemUrl || record.id,
          type: 'html',
          addedAt: new Date().toISOString(),
        });
      }
    });

    saveReviewData({
      folders: nextFolders,
      items: [...reviewData.items, ...newItemsToAdd],
    });
  };

  // 현재 폴더 전체 해제
  const handleDeselectAllInCurrentFolder = () => {
    const selectedIds = new Set(selectedList.map(r => r.id));
    const nextItems = reviewData.items.filter(item => !selectedIds.has(item.fileId));
    saveReviewData({
      ...reviewData,
      items: nextItems,
    });
  };

  // 🌟 [2번 스샷 반영] 윈도우 탐색기에서 문제 클릭 시 문제 풀이 화면 열기
  const handleOpenFileForReview = (file: ReviewItem, fileList: ReviewItem[]) => {
    const mappedList = fileList.map(item => ({
      id: item.fileId,
      name: item.name,
      drive_id: item.fileId,
      solutionUrl: item.solutionUrl || item.fileId,
      problemUrl: item.problemUrl || item.fileId,
    }));
    const activeRecord = mappedList.find(r => r.id === file.fileId) || mappedList[0];
    setSelectedList(mappedList);
    setSelectedRecord(activeRecord);
    setSelectedTab(file.type === 'image' ? 'problem' : 'solution');
    setShowReviewer(true);
    startStealthPrefetch(mappedList, 0, file.type);
  };

  // 라이브러리 초기 진입 및 학년별 필터링
  useEffect(() => {
    if (examLibrary.length > 0 && student) {
      const gradeFolder = examLibrary.find(f => f.name.includes(student.grade));
      
      if (gradeFolder) {
        setDisplayLibrary(sortLibraryDisplayFolders(gradeFolder.subFolders || []));
        setCurrentPath([gradeFolder]);
      } else {
        const fallbackList = examLibrary.filter(f => f.grade === student.grade);
        setDisplayLibrary(sortLibraryDisplayFolders(fallbackList));
        setCurrentPath([]);
      }
    }
  }, [examLibrary, student]);

  const changeMode = (newMode: typeof mode) => {
    if (isTesting) {
      alert("🔥 시험이 진행 중입니다! 종료 또는 일시 정지 후에 이동할 수 있습니다.");
      return;
    }
    setMode(newMode);
    setCurrentPath([]);
  };

  // 개별 폴더 클릭 핸들러 (계층형 권한 체크)
  const handleLibraryFolderClick = (folder: any) => {
    const isUnlocked = isFolderAccessible(folder, student?.unlocked_folders);

    if (!isUnlocked) {
      alert("🔒 해당 폴더는 아직 시험 전이거나 잠겨있어 접근할 수 없습니다.");
      return;
    }

    if (folder.subFolders && folder.subFolders.length > 0) {
      setCurrentPath(prev => [...prev, folder]);
      setDisplayLibrary(sortLibraryDisplayFolders(folder.subFolders));
      return;
    }
    if (folder.files && folder.files.length > 0) {
      setCurrentActiveFolder(folder);
      const files = folder.files
        .map((f: any) => ({ ...f, id: f.drive_id || f.id, solutionUrl: f.drive_id || f.id }))
        .sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));
      setSelectedList(files);
      setShowReviewer(true);
      setSelectedTab('solution');
      setSelectedRecord(files[0]);
      startStealthPrefetch(files, 0, 'html');
    } else {
      alert("이 폴더는 비어있거나 준비 중입니다! 📁");
    }
  };

  const handleFolderBack = () => {
    setCurrentPath(prev => {
      const newPath = [...prev];
      newPath.pop();
      if (newPath.length === 0) {
        const gradeFolder = examLibrary.find((f: any) => f.name.includes(student?.grade));
        if (gradeFolder) {
          setDisplayLibrary(sortLibraryDisplayFolders(gradeFolder.subFolders || []));
          return [gradeFolder];
        } else {
          setDisplayLibrary(sortLibraryDisplayFolders(examLibrary.filter((f: any) => f.grade === student?.grade)));
          return [];
        }
      } else {
        const lastFolder = newPath[newPath.length - 1];
        setDisplayLibrary(sortLibraryDisplayFolders(lastFolder.subFolders || []));
        return newPath;
      }
    });
  };

  useEffect(() => {
    if (!selectedRecord) return;
    let isCancelled = false;

    const loadContent = async () => {
      const key = `${selectedRecord.id}_${selectedTab}`;
      if (dataCache.current[key]) {
        setContentData(dataCache.current[key]);
        setIsContentLoading(false);
        return;
      }

      setIsContentLoading(true);
      const fileId = selectedTab === 'solution' ? selectedRecord.solutionUrl : (selectedTab === 'problem' ? selectedRecord.problemUrl : selectedRecord.id);
      const type = selectedTab === 'solution' ? 'html' : 'image';

      try {
        const d = await fetchFileContent(fileId, type);
        if (!isCancelled) {
          if (d) setContentData(d);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!isCancelled) {
          setIsContentLoading(false);
        }
      }
    };

    loadContent();
    return () => {
      isCancelled = true;
    };
  }, [selectedRecord, selectedTab, dataCache, fetchFileContent]);

  // ── 비번 확인 ──────────────────────────────────────────────
  const handlePwdSubmit = () => {
    if (pwdInput.trim() === student?.password) {
      setPwdVerified(true);
      setPwdError(false);
    } else {
      setPwdError(true);
      setPwdInput('');
    }
  };

  // 비번 잠금 화면 (로딩 끝, 비번 있는 학생, 미인증)
  if (!loading && student?.password && !pwdVerified) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl font-black italic tracking-tighter text-white mb-2">
              EDU<span className="text-indigo-500">EST</span>
            </div>
            <p className="text-slate-500 text-sm font-bold">비번을 입력해줘</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8">
            <p className="text-center text-slate-300 font-black text-sm mb-6 uppercase tracking-widest">{student.name}</p>
            <input
              type="password"
              maxLength={4}
              value={pwdInput}
              onChange={e => { setPwdInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setPwdError(false); }}
              onKeyDown={e => e.key === 'Enter' && handlePwdSubmit()}
              placeholder="· · · ·"
              className={`w-full bg-white/5 border rounded-2xl py-5 px-6 text-center text-4xl font-black tracking-[0.5em] text-white focus:outline-none transition-all ${pwdError ? 'border-rose-500 animate-pulse' : 'border-white/10 focus:border-indigo-500'}`}
              autoFocus
            />
            {pwdError && <p className="text-rose-400 text-xs font-bold text-center mt-3">틀렸어. 다시 입력해줘.</p>}
            <button
              onClick={handlePwdSubmit}
              disabled={pwdInput.length !== 4}
              className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 text-white font-black py-4 rounded-2xl transition-all"
            >
              입장
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !showReviewer) return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center gap-6">
      <Loader2 className="animate-spin text-indigo-500" size={60} />
      <p className="text-white font-black text-2xl tracking-tighter animate-pulse uppercase italic">Syncing Eduest...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-12 font-sans text-slate-200 overflow-x-hidden">
      <div className="max-w-[1400px] mx-auto">
        
        {!showReviewer && (
          <div className="flex justify-center mb-16 animate-in slide-in-from-top-10 duration-700">
            <div className="bg-white/5 p-1.5 rounded-[32px] border border-white/10 backdrop-blur-3xl flex shadow-3xl">
              <button onClick={() => changeMode('test')} className={`flex items-center gap-3 px-6 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'test' ? 'bg-rose-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Zap size={18} fill={mode === 'test' ? "currentColor" : "none"}/> Test
              </button>
              {/* 🌟 [사용자 요청 1번 스샷] 리뷰 메뉴랑 테스트 사이에 [숙제] 메뉴 추가 */}
              <button onClick={() => changeMode('homework')} className={`flex items-center gap-3 px-6 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'homework' ? 'bg-amber-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <BookOpen size={18}/> 숙제
              </button>
              <button onClick={() => changeMode('review')} className={`flex items-center gap-3 px-6 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'review' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Database size={18}/> Review
              </button>
              <button onClick={() => changeMode('library')} className={`flex items-center gap-3 px-6 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'library' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Library size={18}/> Library
              </button>
            </div>
          </div>
        )}

        {!showReviewer && (
          <div className="animate-in fade-in zoom-in duration-1000">
            <div className="text-center mb-16 space-y-4">
              <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase leading-none truncate">
                {student?.name} <span className="text-slate-800 not-italic">/</span> <span className="text-indigo-500">{student?.grade}</span>
              </h1>
            </div>

            {mode === 'test' ? (
              <TestModule 
                studentId={student?.id} 
                studentName={student?.name} 
                onStatusChange={(status: boolean) => setIsTesting(status)}
              />
            ) : mode === 'homework' ? (
              /* 🌟 [1번 스샷 반영] 부여받은 숙제 확인 화면 (최근 숙제 및 히스토리) */
              <StudentHomeworkView 
                studentId={student?.id}
                studentName={student?.name}
                studentGrade={student?.grade}
              />
            ) : mode === 'review' ? (
              /* 🌟 [2번 스샷 반영] 윈도우 탐색기 스타일 복습 관리 화면 */
              <StudentReviewExplorer
                studentId={student?.id}
                reviewData={reviewData}
                onUpdateReviewData={saveReviewData}
                onOpenFileForReview={handleOpenFileForReview}
                gasRecords={allRecords}
                gasCartridges={cartridges}
                onOpenGasCartridge={(cat) => {
                  const filtered = allRecords.filter(r => r.name.includes(`[${cat}]`)).sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));
                  setSelectedList(filtered); setShowReviewer(true); setSelectedRecord(filtered[0]); setSelectedTab('problem'); startStealthPrefetch(filtered, 0, 'image');
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                {!student?.is_unlocked ? (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center space-y-6 bg-white/5 border border-dashed border-white/10 rounded-[64px] animate-in slide-in-from-bottom-5 duration-700">
                    <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-500/20">
                      <Lock size={40} className="animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Library Locked</h2>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] opacity-80 text-center">선생님께 잠금 해제를 요청하세요!</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentPath.length > 0 && (
                      <div onClick={handleFolderBack} className="bg-white/5 p-12 rounded-[56px] border border-dashed border-white/10 hover:border-white/30 transition-all cursor-pointer flex flex-col items-center justify-center group">
                        <ArrowLeft size={40} className="text-slate-600 group-hover:text-white mb-4 transition-transform group-hover:-translate-x-2"/>
                        <div className="text-xl font-black text-slate-600 group-hover:text-white uppercase">GO BACK</div>
                      </div>
                    )}
                    {displayLibrary.map(folder => {
                      const isUnlocked = isFolderAccessible(folder, student?.unlocked_folders);
                      const isLocked = !isUnlocked;

                      return (
                        <div 
                          key={folder.drive_id || folder.id} 
                          onClick={() => handleLibraryFolderClick(folder)} 
                          className={`bg-white/5 p-12 rounded-[56px] border border-white/10 transition-all cursor-pointer shadow-3xl group relative overflow-hidden ${isLocked ? 'opacity-40 grayscale' : folder.subFolders?.length > 0 ? 'hover:bg-amber-600' : 'hover:bg-emerald-600'}`}
                        >
                          {isLocked ? (
                            <Lock size={40} className="text-rose-500 mb-8" />
                          ) : (
                            <Library size={40} className={`mb-8 transition-colors ${folder.subFolders?.length > 0 ? 'text-amber-500 group-hover:text-white' : 'text-emerald-500 group-hover:text-white'}`}/>
                          )}
                          <div className="text-3xl font-black mb-3 group-hover:translate-x-2 transition-transform leading-tight">
                            {folder.name}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 group-hover:text-white opacity-60 uppercase tracking-widest">
                            {isLocked ? 'LOCKED FOLDER' : folder.subFolders?.length > 0 ? `${folder.subFolders.length} folders` : `${folder.files?.length || 0} solutions`}
                          </div>
                          {!isLocked && <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 transition-all text-white" size={40}/>}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {showReviewer && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-10 duration-1000 pb-10">
            <div className="flex items-center gap-3 bg-white/5 p-4 rounded-[32px] border border-white/10 backdrop-blur-3xl shadow-2xl">
              <button onClick={() => {setShowReviewer(false); setContentData(null);}} className="shrink-0 w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/20 transition-all" title="뒤로가기">
                <ArrowLeft size={24}/>
              </button>

              {/* 🌟 [사용자 요청 2번 스샷] 라이브러리 모드일 때 회차 전체 담기 / 해제 컨트롤 */}
              {mode === 'library' && (
                <div className="hidden sm:flex items-center gap-1.5 shrink-0 pr-2 border-r border-white/10 text-xs">
                  <button
                    onClick={handleSelectAllInCurrentFolder}
                    className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white rounded-xl font-bold transition-all border border-indigo-500/30 whitespace-nowrap"
                    title="이 회차의 모든 문제를 복습(Review)에 담기"
                  >
                    ✓ 전체 담기
                  </button>
                  <button
                    onClick={handleDeselectAllInCurrentFolder}
                    className="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 rounded-xl font-bold transition-all border border-white/5 whitespace-nowrap"
                    title="이 회차의 모든 문제 복습 해제"
                  >
                    ✕ 해제
                  </button>
                </div>
              )}

              <div className="w-[1px] h-10 bg-white/10 mx-1 hidden sm:block" />

              <div className="flex-1 flex gap-3 overflow-x-auto py-2 scrollbar-hide snap-x items-center">
                {selectedList.map((record, idx) => {
                  const 번Match = record.name.match(/(\d+)번/);
                  const reviewLabel = 번Match ? 번Match[1] : String(idx + 1);
                  const isLibrary = mode === 'library';
                  const libraryLabel = record.name.replace(/\.html?$/i, '');
                  const isChecked = isRecordChecked(record.id);

                  return (
                    <div key={record.id} className="shrink-0 flex flex-col items-center gap-1.5 snap-center">
                      <button
                        title={isLibrary ? libraryLabel : undefined}
                        onClick={() => { 
                          setSelectedRecord(record); 
                          if (mode === 'review') setSelectedTab('problem'); 
                          startStealthPrefetch(selectedList, idx, isLibrary ? 'html' : 'image');
                        }}
                        onMouseEnter={() => {
                          prefetchItem(record, isLibrary ? 'html' : 'image');
                        }}
                        className={`rounded-2xl flex items-center justify-center font-black transition-all ${
                          isLibrary
                            ? `px-3.5 py-2 md:px-4 md:py-2.5 text-xs md:text-sm min-w-[70px] ${selectedRecord?.id === record.id ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-[1.02]' : 'bg-white/5 text-slate-400 border border-white/5 hover:border-white/20 hover:text-slate-200'}`
                            : `w-14 h-14 md:w-16 md:h-16 text-lg ${selectedRecord?.id === record.id ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-110' : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/20 hover:text-slate-200'}`
                        }`}
                      >
                        {isLibrary ? <span className="truncate">{libraryLabel}</span> : reviewLabel}
                      </button>

                      {/* 🌟 [2번 스샷 반영] 각 파일리스트 하단 체크박스 (체크 시 학생 복습 폴더에 자동 정리) */}
                      {isLibrary && (
                        <label 
                          onClick={(e) => e.stopPropagation()} 
                          className={`flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                            isChecked
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200 bg-white/5 border border-white/10 hover:border-white/20'
                          }`}
                          title="체크 시 이 문제가 복습(Review)에 해당 회차 폴더로 자동 정리됩니다"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRecordReview(record)}
                            className="w-3.5 h-3.5 rounded border-white/30 text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-600"
                          />
                          <span>복습</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-[48px] md:rounded-[64px] overflow-hidden flex flex-col min-h-[750px] lg:min-h-[850px] relative shadow-3xl backdrop-blur-3xl">
              <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-transparent to-indigo-950/20 overflow-auto relative min-h-[600px]">
                {isContentLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50 transition-all">
                    <Loader2 className="animate-spin text-indigo-500" size={50} />
                  </div>
                )}
                {contentData ? (
                  selectedTab === 'solution' ? <iframe srcDoc={contentData} className="w-full h-full min-h-[700px] border-0 rounded-[32px] bg-white shadow-3xl animate-in fade-in duration-1000" /> 
                  : <img src={contentData} alt="content" className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-3xl animate-in zoom-in-95 duration-700" />
                ) : !isContentLoading && <div className="text-slate-800 font-black text-6xl md:text-8xl italic opacity-10 select-none tracking-tighter text-center uppercase">Eduest OS System</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
