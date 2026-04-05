'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  Loader2, Database, Library, ArrowLeft, ArrowRight, ChevronRight, Lock, Zap 
} from 'lucide-react';
import TestModule from './test/test';
import { useStudentData } from './useStudentData';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec';

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  const { 
    student, 
    allRecords, 
    cartridges, 
    examLibrary, 
    loading, 
    dataCache, 
    startStealthPrefetch, 
    extractNumber 
  } = useStudentData(resolvedParams.id);

  const [mode, setMode] = useState<'test' | 'review' | 'library'>('review');
  const [isTesting, setIsTesting] = useState(false);
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const [displayLibrary, setDisplayLibrary] = useState<any[]>([]);
  const [showReviewer, setShowReviewer] = useState(false);
  const [selectedList, setSelectedList] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'problem' | 'board' | 'solution'>('problem');
  const [contentData, setContentData] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);

  // 라이브러리 초기 진입 및 학년별 필터링
  useEffect(() => {
    if (examLibrary.length > 0 && student) {
      const gradeFolder = examLibrary.find(f => f.name.includes(student.grade));
      
      if (gradeFolder) {
        setDisplayLibrary(gradeFolder.subFolders || []);
        setCurrentPath([gradeFolder]);
      } else {
        const fallbackList = examLibrary.filter(f => f.grade === student.grade);
        setDisplayLibrary(fallbackList);
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

  // 🔥 [수정] 개별 폴더 클릭 핸들러 (회차 폴더인 경우에만 락 체크)
  const handleLibraryFolderClick = (folder: any) => {
    // 🔍 로직: 이름에 '차'가 들어간 경우(시험지 회차)에만 선생님이 준 개별 권한을 확인해
    const isExamSession = folder.name.includes('차');
    const isUnlocked = student?.unlocked_folders?.includes(folder.drive_id);

    // 만약 회차 폴더인데 내 권한 리스트에 없다면? 철통 방어!
    if (isExamSession && !isUnlocked) {
      alert("🔒 해당 회차는 아직 시험 전이거나 잠겨있어 해설을 볼 수 없습니다.");
      return;
    }

    if (folder.subFolders && folder.subFolders.length > 0) {
      setCurrentPath(prev => [...prev, folder]);
      setDisplayLibrary(folder.subFolders);
      return;
    }
    if (folder.files && folder.files.length > 0) {
      const files = folder.files
        .map((f: any) => ({ ...f, id: f.drive_id || f.id, solutionUrl: f.drive_id || f.id }))
        .sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));
      setSelectedList(files);
      setShowReviewer(true);
      setSelectedTab('solution');
      setSelectedRecord(files[0]);
      startStealthPrefetch(files);
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
          setDisplayLibrary(gradeFolder.subFolders || []);
          return [gradeFolder];
        } else {
          setDisplayLibrary(examLibrary.filter((f: any) => f.grade === student?.grade));
          return [];
        }
      } else {
        const lastFolder = newPath[newPath.length - 1];
        setDisplayLibrary(lastFolder.subFolders || []);
        return newPath;
      }
    });
  };

  useEffect(() => {
    if (!selectedRecord) return;
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
        const res = await fetch(APPS_SCRIPT_URL, { 
          method: 'POST', 
          body: JSON.stringify({ action: 'get_file_data', fileId, type, apiKey: "eduest_super_secret_key_1234" }) 
        });
        const result = await res.json();
        let d = result.data;
        if (type === 'html' && d) d = d.replace(/[₩¥]/g, '\\');
        dataCache.current[key] = d;
        setContentData(d);
      } catch (e) {
        console.error(e);
      } finally {
        setIsContentLoading(false);
      }
    };
    loadContent();
  }, [selectedRecord, selectedTab, dataCache]);

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
            ) : mode === 'review' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                {cartridges.length > 0 ? (
                  cartridges.map(cat => (
                    <div key={cat} onClick={() => {
                      const filtered = allRecords.filter(r => r.name.includes(`[${cat}]`)).sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));
                      setSelectedList(filtered); setShowReviewer(true); setSelectedRecord(filtered[0]); setSelectedTab('problem'); startStealthPrefetch(filtered);
                    }} className="bg-white/5 p-12 rounded-[56px] border border-white/10 hover:bg-indigo-600 transition-all cursor-pointer shadow-3xl group relative overflow-hidden">
                      <Database size={40} className="text-indigo-500 group-hover:text-white mb-8 transition-colors"/>
                      <div className="text-4xl font-black mb-3 group-hover:translate-x-2 transition-transform">{cat}</div>
                      <div className="text-xs font-bold text-slate-500 group-hover:text-indigo-100 uppercase tracking-widest">{allRecords.filter(r => r.name.includes(`[${cat}]`)).length} units</div>
                      <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 transition-all text-white" size={40}/>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-10 text-center text-slate-500 font-bold uppercase tracking-widest opacity-50 italic">기록을 불러오고 있습니다...</div>
                )}
              </div>
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
                      // 🔥 [수정] 회차 폴더(이름에 '차' 포함)인 경우에만 락 비주얼을 적용해
                      const isExamSession = folder.name.includes('차');
                      const isUnlocked = student?.unlocked_folders?.includes(folder.drive_id);
                      const isLocked = isExamSession && !isUnlocked;

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
                            {isLocked ? 'LOCKED SESSION' : folder.subFolders?.length > 0 ? `${folder.subFolders.length} folders` : `${folder.files?.length || 0} solutions`}
                          </div>
                          {!isLocked && <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 transition-all text-white" size={40}/>}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {showReviewer && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-10 duration-1000 pb-10">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-[32px] border border-white/10 backdrop-blur-3xl shadow-2xl">
              <button onClick={() => {setShowReviewer(false); setContentData(null);}} className="shrink-0 w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/20 transition-all">
                <ArrowLeft size={24}/>
              </button>
              <div className="w-[1px] h-10 bg-white/10 mx-2" />
              <div className="flex-1 flex gap-3 overflow-x-auto py-2 scrollbar-hide snap-x">
                {selectedList.map((record, idx) => {
                  const displayNum = record.name.match(/(\d+)번/) ? record.name.match(/(\d+)번/)[1] : idx + 1;
                  return (
                    <button key={record.id} onClick={() => { setSelectedRecord(record); if(mode==='review') setSelectedTab('problem'); }} className={`shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center font-black text-lg transition-all snap-center ${selectedRecord?.id === record.id ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-110' : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/20 hover:text-slate-200'}`}>
                      {displayNum}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-[48px] md:rounded-[64px] overflow-hidden flex flex-col min-h-[750px] lg:min-h-[850px] relative shadow-3xl backdrop-blur-3xl">
              <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-transparent to-indigo-950/20 overflow-auto relative min-h-[600px]">
                {isContentLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-50"><Loader2 className="animate-spin text-indigo-500" size={50} /></div>}
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