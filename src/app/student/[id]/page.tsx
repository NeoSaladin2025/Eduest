'use client'; 

import React, { useState, useEffect, use, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  GraduationCap, ArrowRight, Sparkles, BookOpenText, FileText, 
  ChevronRight, Loader2, Database, Library, ArrowLeft, LayoutGrid 
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfsRGa1EuoDaHjiYKCslabSsE4j3sHRsv7b0T-23wDuZqTGw_VrDlIXXfEB-zwyUKh1A/exec';

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  const [student, setStudent] = useState<any>(null);
  const [mode, setMode] = useState<'review' | 'library'>('review'); 
  
  const [allRecords, setAllRecords] = useState<any[]>([]); 
  const [cartridges, setCartridges] = useState<string[]>([]);
  const [examLibrary, setExamLibrary] = useState<any[]>([]); 
  
  const [showReviewer, setShowReviewer] = useState(false);
  const [selectedList, setSelectedList] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'problem' | 'board' | 'solution'>('problem');

  const dataCache = useRef<{ [key: string]: string }>({});
  const prefetchQueue = useRef<Set<string>>(new Set());

  const [contentData, setContentData] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // 헬퍼: 파일명에서 숫자를 추출해 정렬용 숫자로 반환
  const extractNumber = (name: string) => {
    const match = name.match(/(\d+)번/) || name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
  };

  // 1. 초기 로드
  useEffect(() => {
    const initPage = async () => {
      try {
        setLoading(true);
        const { data: studentData } = await supabase.from('students').select('*').eq('id', resolvedParams.id).single();
        if (!studentData) return;
        setStudent(studentData);

        const [revRes, libRes] = await Promise.all([
          fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'get_student_records', studentFolderId: studentData.drive_folder_id }) 
          }),
          fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'get_exam_library', grade: studentData.grade }) 
          })
        ]);

        const revData = await revRes.json();
        const libData = await libRes.json();

        const records = revData.records || [];
        setAllRecords(records);
        const categories = Array.from(new Set(records.map((r: any) => {
            const match = r.name.match(/\[(.*?)\]/);
            return match ? match[1] : "기본";
        })));
        setCartridges(categories as string[]);
        setExamLibrary(libData.library || []);

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initPage();
  }, [resolvedParams.id]);

  const handleLibraryFolderClick = (folder: any) => {
    if (!folder.files || folder.files.length === 0) {
        alert("이 폴더에는 HTML 해설지가 없습니다! 📁");
        return;
    }
    // 🚀 번호순 정렬 적용
    const files = folder.files
      .map((f: any) => ({ ...f, solutionUrl: f.id }))
      .sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));

    setSelectedList(files);
    setShowReviewer(true);
    setSelectedTab('solution');
    setSelectedRecord(files[0]);
    startStealthPrefetch(files); 
  };

  const startStealthPrefetch = async (items: any[]) => {
    for (const item of items) {
      const tasks = mode === 'library' 
        ? [{id: item.id, type:'html', tab:'solution'}] 
        : [{id: item.problemUrl, type:'image', tab:'problem'}, {id: item.id, type:'image', tab:'board'}, {id: item.solutionUrl, type:'html', tab:'solution'}];
      
      for (const task of tasks) {
        const cacheKey = `${item.id}_${task.tab}`;
        if (!task.id || dataCache.current[cacheKey] || prefetchQueue.current.has(cacheKey)) continue;
        prefetchQueue.current.add(cacheKey);
        try {
          const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'get_file_data', fileId: task.id, type: task.type }) });
          const resJson = await res.json();
          if (resJson.success) {
            let d = resJson.data;
            if (task.type === 'html') d = d.replace(/[₩¥]/g, '\\');
            dataCache.current[cacheKey] = d;
          }
        } catch (e) {}
      }
    }
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
      const fileId = selectedTab === 'problem' ? selectedRecord.problemUrl : selectedTab === 'board' ? selectedRecord.id : selectedRecord.solutionUrl;
      const type = selectedTab === 'solution' ? 'html' : 'image';
      try {
        const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'get_file_data', fileId, type }) });
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
      <div className="text-center">
        <p className="text-white font-black text-2xl tracking-tighter animate-pulse uppercase italic">Syncing Eduest...</p>
        <p className="text-slate-500 text-[10px] font-bold mt-2 uppercase tracking-[0.3em]">최초 1회 라이브러리 패키지를 구성 중입니다</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-12 font-sans text-slate-200">
      <div className="max-w-[1400px] mx-auto">
        
        {!showReviewer && (
          <div className="flex justify-center mb-16 animate-in slide-in-from-top-10 duration-700">
            <div className="bg-white/5 p-1.5 rounded-[32px] border border-white/10 backdrop-blur-3xl flex shadow-3xl">
              <button onClick={() => setMode('review')} className={`flex items-center gap-3 px-10 py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'review' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Database size={18}/> Review Mode
              </button>
              <button onClick={() => setMode('library')} className={`flex items-center gap-3 px-10 py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${mode === 'library' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-white'}`}>
                <Library size={18}/> Exam Library
              </button>
            </div>
          </div>
        )}

        {!showReviewer && (
          <div className="animate-in fade-in zoom-in duration-1000">
            <div className="text-center mb-16 space-y-4">
              <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase leading-none">
                {student?.name} <span className="text-slate-800 not-italic">/</span> <span className="text-indigo-500">{student?.grade}</span>
              </h1>
              <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px] opacity-60">Personalized Learning Dashboard</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {mode === 'review' ? (
                cartridges.map(cat => (
                  <div key={cat} onClick={() => {
                    // 🚀 번호순 정렬 적용
                    const filtered = allRecords
                      .filter(r => r.name.includes(`[${cat}]`))
                      .sort((a: any, b: any) => extractNumber(a.name) - extractNumber(b.name));
                    setSelectedList(filtered); setShowReviewer(true); setSelectedRecord(filtered[0]); startStealthPrefetch(filtered);
                  }} className="bg-white/5 p-12 rounded-[56px] border border-white/10 hover:bg-indigo-600 transition-all cursor-pointer shadow-3xl group relative overflow-hidden">
                    <Database size={40} className="text-indigo-500 group-hover:text-white mb-8 transition-colors"/>
                    <div className="text-4xl font-black mb-3 group-hover:translate-x-2 transition-transform">{cat}</div>
                    <div className="text-xs font-bold text-slate-500 group-hover:text-indigo-100 uppercase tracking-widest">{allRecords.filter(r => r.name.includes(`[${cat}]`)).length} units pack</div>
                    <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 group-hover:translate-x-3 transition-all text-white" size={40}/>
                  </div>
                ))
              ) : (
                examLibrary.map(folder => (
                  <div key={folder.id} onClick={() => handleLibraryFolderClick(folder)} className="bg-white/5 p-12 rounded-[56px] border border-white/10 hover:bg-emerald-600 transition-all cursor-pointer shadow-3xl group relative overflow-hidden">
                    <Library size={40} className="text-emerald-500 group-hover:text-white mb-8 transition-colors"/>
                    <div className="text-4xl font-black mb-3 group-hover:translate-x-2 transition-transform">{folder.name}</div>
                    <div className="text-xs font-bold text-slate-500 group-hover:text-emerald-100 uppercase tracking-widest italic">{folder.files?.length || 0} master solutions</div>
                    <ArrowRight className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-100 group-hover:translate-x-3 transition-all text-white" size={40}/>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {showReviewer && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-10 duration-1000">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-[32px] border border-white/10 backdrop-blur-3xl shadow-2xl">
              <button 
                onClick={() => {setShowReviewer(false); setContentData(null);}} 
                className="shrink-0 w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/20 transition-all"
              >
                <ArrowLeft size={24}/>
              </button>
              <div className="w-[1px] h-10 bg-white/10 mx-2" />
              <div className="flex-1 flex gap-3 overflow-x-auto py-2 scrollbar-hide snap-x">
                {selectedList.map((record, idx) => {
                  // 파일명에서 추출한 실제 문제 번호 표시 (없으면 인덱스+1)
                  const displayNum = record.name.match(/(\d+)번/) ? record.name.match(/(\d+)번/)[1] : idx + 1;
                  return (
                    <button 
                      key={record.id} 
                      onClick={() => { setSelectedRecord(record); if(mode==='review') setSelectedTab('problem'); }} 
                      className={`
                        shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center font-black text-lg transition-all snap-center
                        ${selectedRecord?.id === record.id 
                          ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-110' 
                          : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/20 hover:text-slate-200'}
                      `}
                    >
                      {displayNum}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[48px] md:rounded-[64px] overflow-hidden flex flex-col min-h-[700px] lg:min-h-[850px] relative shadow-3xl backdrop-blur-3xl">
              {mode === 'review' && (
                <div className="flex bg-black/40 border-b border-white/10">
                  {(['problem', 'board', 'solution'] as const).map(tab => (
                    <button 
                      key={tab} 
                      onClick={() => setSelectedTab(tab)} 
                      className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.2em] relative transition-all ${selectedTab === tab ? 'text-white bg-white/5' : 'text-slate-500 hover:text-white'}`}
                    >
                      {tab}
                      {selectedTab === tab && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,1)]" />}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-transparent to-indigo-950/20 overflow-auto relative min-h-[600px]">
                {isContentLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-50">
                    <Loader2 className="animate-spin text-indigo-500" size={50} />
                  </div>
                )}
                
                {contentData ? (
                  selectedTab === 'solution' ? (
                    <iframe 
                      srcDoc={contentData} 
                      className="w-full h-full min-h-[700px] border-0 rounded-[32px] bg-white shadow-3xl animate-in fade-in duration-1000" 
                    /> 
                  ) : (
                    <img 
                      src={contentData} 
                      alt="content" 
                      className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-3xl animate-in zoom-in-95 duration-700" 
                    />
                  )
                ) : !isContentLoading && (
                  <div className="text-slate-800 font-black text-6xl md:text-8xl italic opacity-10 select-none tracking-tighter">
                    EDUEST OS
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}