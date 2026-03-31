'use client'; 

import React, { useState, useEffect, use, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Loader2, Database, Library, ArrowLeft, ArrowRight, ChevronRight, Lock 
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec';

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  const [student, setStudent] = useState<any>(null);
  const [mode, setMode] = useState<'review' | 'library'>('review'); 
  
  const [allRecords, setAllRecords] = useState<any[]>([]); 
  const [cartridges, setCartridges] = useState<string[]>([]);
  
  const [examLibrary, setExamLibrary] = useState<any[]>([]); 
  const [currentPath, setCurrentPath] = useState<any[]>([]); 
  const [displayLibrary, setDisplayLibrary] = useState<any[]>([]); 

  const [showReviewer, setShowReviewer] = useState(false);
  const [selectedList, setSelectedList] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'problem' | 'board' | 'solution'>('problem');

  const dataCache = useRef<{ [key: string]: string }>({});
  const prefetchQueue = useRef<Set<string>>(new Set());

  const [contentData, setContentData] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const extractNumber = (name: string) => {
    const match = name.match(/(\d+)번/) || name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
  };

  const buildTree = (items: any[]) => {
    const map: any = {};
    const roots: any[] = [];
    items.forEach(item => {
      map[item.drive_id] = { ...item, id: item.drive_id, subFolders: [], files: [] };
    });
    items.forEach(item => {
      const node = map[item.drive_id];
      if (item.parent_id && map[item.parent_id]) {
        if (item.type === 'folder') map[item.parent_id].subFolders.push(node);
        else map[item.parent_id].files.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };

  useEffect(() => {
    const initPage = async () => {
      try {
        setLoading(true);
        // 1. 학생 데이터 로드
        const { data: studentData } = await supabase.from('students').select('*').eq('id', resolvedParams.id).single();
        if (!studentData) return;
        setStudent(studentData);

        // 2. Supabase에서 라이브러리 지도 로드 (광속)
        const { data: dbLibrary } = await supabase
          .from('exam_library')
          .select('*')
          .eq('grade', studentData.grade);

        if (dbLibrary && dbLibrary.length > 0) {
          const formattedLib = buildTree(dbLibrary);
          setExamLibrary(formattedLib);
          
          const gradeFolder = formattedLib.find(f => f.name.includes(studentData.grade));
          if (gradeFolder) {
            setDisplayLibrary(gradeFolder.subFolders || []);
            setCurrentPath([gradeFolder]);
          } else {
            setDisplayLibrary(formattedLib);
          }
          
          // 🔥 [핵심 수정] 지도가 준비되면 여기서 바로 로딩 바를 치워버림!
          // 복습 기록(GAS)이 올 때까지 기다리지 않고 화면을 띄웁니다.
          setLoading(false);
        } else {
          // 지도 데이터가 없어도 일단 로딩은 풀어야 함
          setLoading(false);
        }

        // 3. 복습 기록은 백그라운드에서 조용히 가져오기
        fetch(APPS_SCRIPT_URL, { 
          method: 'POST', 
          body: JSON.stringify({ action: 'get_student_records', studentFolderId: studentData.drive_folder_id, apiKey: "eduest_super_secret_key_1234" }) 
        })
        .then(res => res.json())
        .then(revData => {
          if (revData.success) {
            const records = revData.records || [];
            setAllRecords(records);
            setCartridges(Array.from(new Set(records.map((r: any) => (r.name.match(/\[(.*?)\]/) || [null, "기본"])[1]))));
          }
        })
        .catch(err => console.error("Records Load Error:", err));

      } catch (err) { 
        console.error(err); 
        setLoading(false); 
      }
    };
    initPage();
  }, [resolvedParams.id]);

  const handleLibraryFolderClick = (folder: any) => {
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
        setDisplayLibrary(gradeFolder ? gradeFolder.subFolders : examLibrary);
        return gradeFolder ? [gradeFolder] : [];
      } else {
        setDisplayLibrary(newPath[newPath.length - 1].subFolders || []);
      }
      return newPath;
    });
  };

  const startStealthPrefetch = async (items: any[]) => {
    for (const item of items) {
      const cacheKey = `${item.id}_solution`;
      if (dataCache.current[cacheKey] || prefetchQueue.current.has(cacheKey)) continue;

      prefetchQueue.current.add(cacheKey);
      try {
        const res = await fetch(APPS_SCRIPT_URL, { 
          method: 'POST', 
          body: JSON.stringify({ 
            action: 'get_file_data', 
            fileId: item.id, 
            type: 'html', 
            apiKey: "eduest_super_secret_key_1234" 
          }) 
        });
        const resJson = await res.json();
        if (resJson.success) {
          let d = resJson.data;
          d = d.replace(/[₩¥]/g, '\\');
          dataCache.current[cacheKey] = d;
        }
      } catch (e) {
        console.error("Prefetch error:", e);
      }
    }
  };

  useEffect(() => {
    if (!selectedRecord) return;
    const loadContent = async () => {
      if (typeof window === 'undefined') return;
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
        const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'get_file_data', fileId, type, apiKey: "eduest_super_secret_key_1234" }) });
        const result = await res.json();
        let d = result.data;
        if (type === 'html') d = d.replace(/[₩¥]/g, '\\');
        dataCache.current[key] = d;
        setContentData(d);
      } catch (e) {} finally { setIsContentLoading(false); }
    };
    loadContent();
  }, [selectedRecord, selectedTab]);

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
              <button onClick={() => {setMode('review'); setCurrentPath([]);}} className={`flex items-center gap-3 px-8 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'review' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Database size={18}/> Review
              </button>
              <button onClick={() => setMode('library')} className={`flex items-center gap-3 px-8 md:px-10 py-4 md:py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'library' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
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
              {mode === 'library' && currentPath.length > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 overflow-x-auto whitespace-nowrap px-4 scrollbar-hide">
                  {currentPath.map((p, i) => (
                    <React.Fragment key={p.drive_id || p.id}>
                      {i > 0 && <ChevronRight size={12} className="text-slate-800" />}
                      <span className={i === currentPath.length - 1 ? "text-indigo-400" : ""}>{p.name}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
              {mode === 'review' ? (
                cartridges.length > 0 ? (
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
                  <div className="col-span-full py-10 text-center text-slate-500 font-bold uppercase tracking-widest opacity-50">
                    Loading records...
                  </div>
                )
              ) : (
                !student?.is_unlocked ? (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center space-y-6 bg-white/5 border border-dashed border-white/10 rounded-[64px] animate-in slide-in-from-bottom-5 duration-700">
                    <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-500/20">
                      <Lock size={40} className="animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Library Locked</h2>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] opacity-80">
                        문제를 모두 풀었나요? <br /> 선생님께 <span className="text-indigo-400">잠금 해제</span>를 요청하세요! 👩‍🏫
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentPath.length > 1 && (
                      <div onClick={handleFolderBack} className="bg-white/5 p-12 rounded-[56px] border border-dashed border-white/10 hover:border-white/30 transition-all cursor-pointer flex flex-col items-center justify-center group">
                        <ArrowLeft size={40} className="text-slate-600 group-hover:text-white mb-4 transition-transform group-hover:-translate-x-2"/>
                        <div className="text-xl font-black text-slate-600 group-hover:text-white uppercase">GO BACK</div>
                      </div>
                    )}
                    {displayLibrary.map(folder => (
                      <div key={folder.drive_id || folder.id} onClick={() => handleLibraryFolderClick(folder)} className={`bg-white/5 p-12 rounded-[56px] border border-white/10 transition-all cursor-pointer shadow-3xl group relative overflow-hidden ${folder.subFolders?.length > 0 ? 'hover:bg-amber-600' : 'hover:bg-emerald-600'}`}>
                        <Library size={40} className={`mb-8 transition-colors ${folder.subFolders?.length > 0 ? 'text-amber-500 group-hover:text-white' : 'text-emerald-500 group-hover:text-white'}`}/>
                        <div className="text-3xl font-black mb-3 group-hover:translate-x-2 transition-transform leading-tight">{folder.name}</div>
                        <div className="text-[10px] font-bold text-slate-500 group-hover:text-white opacity-60 uppercase tracking-widest">
                          {folder.subFolders?.length > 0 ? `${folder.subFolders.length} folders` : `${folder.files?.length || 0} solutions`}
                        </div>
                        <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 transition-all text-white" size={40}/>
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
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
                ) : !isContentLoading && <div className="text-slate-800 font-black text-6xl md:text-8xl italic opacity-10 select-none tracking-tighter">EDUEST OS</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}