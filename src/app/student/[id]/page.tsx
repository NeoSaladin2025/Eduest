'use client'; 

import React, { useState, useEffect, use, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GraduationCap, ArrowRight, Sparkles, BookOpenText, FileText, ChevronRight, Loader2, Database, Library, ArrowLeft, LayoutGrid } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 🔥 자기야, 방금 준 따끈따끈한 '고속 로딩용' 새 URL로 업데이트 완료!
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfsRGa1EuoDaHjiYKCslabSsE4j3sHRsv7b0T-23wDuZqTGw_VrDlIXXfEB-zwyUKh1A/exec';

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  const [student, setStudent] = useState<any>(null);
  const [mode, setMode] = useState<'review' | 'library'>('review'); 
  
  const [allRecords, setAllRecords] = useState<any[]>([]); 
  const [cartridges, setCartridges] = useState<string[]>([]);
  const [examLibrary, setExamLibrary] = useState<any[]>([]); // 이제 여기에 파일 목록까지 다 들어감!
  
  const [showReviewer, setShowReviewer] = useState(false);
  const [selectedList, setSelectedList] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'problem' | 'board' | 'solution'>('problem');

  const dataCache = useRef<{ [key: string]: string }>({});
  const prefetchQueue = useRef<Set<string>>(new Set());

  const [contentData, setContentData] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. 초기 로드: 학생 정보 + 복습 목록 + 고속 라이브러리 세트
  useEffect(() => {
    const initPage = async () => {
      try {
        setLoading(true);
        const { data: studentData } = await supabase.from('students').select('*').eq('id', resolvedParams.id).single();
        if (!studentData) return;
        setStudent(studentData);

        // 🔥 복습 데이터와 라이브러리 데이터를 병렬로 호출해서 로딩 시간 단축!
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

        // A. 복습 데이터 세팅
        const records = revData.records || [];
        setAllRecords(records);
        const categories = Array.from(new Set(records.map((r: any) => {
            const match = r.name.match(/\[(.*?)\]/);
            return match ? match[1] : "기본";
        })));
        setCartridges(categories as string[]);

        // B. 자습 라이브러리 세팅 (파일 목록이 이미 포함되어 있음!)
        setExamLibrary(libData.library || []);

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initPage();
  }, [resolvedParams.id]);

  // 🚀 [고속 진입] 폴더 클릭 시 다시 fetch하지 않고 즉시 뷰어 실행
  const handleLibraryFolderClick = (folder: any) => {
    if (!folder.files || folder.files.length === 0) {
        alert("이 폴더에는 HTML 해설지가 없습니다! 📁");
        return;
    }
    // 데이터 구조를 통일해서 뷰어에 전달
    const files = folder.files.map((f: any) => ({ ...f, solutionUrl: f.id }));
    setSelectedList(files);
    setShowReviewer(true);
    setSelectedTab('solution'); // 라이브러리는 해설 위주이므로 바로 solution 탭
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
    <div className="min-h-screen bg-[#020617] p-6 md:p-12 font-sans text-slate-200">
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
              <h1 className="text-7xl font-black italic tracking-tighter uppercase leading-none">
                {student?.name} <span className="text-slate-800 not-italic">/</span> <span className="text-indigo-500">{student?.grade}</span>
              </h1>
              <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px] opacity-60">Personalized Learning Dashboard</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {mode === 'review' ? (
                cartridges.map(cat => (
                  <div key={cat} onClick={() => {
                    const filtered = allRecords.filter(r => r.name.includes(`[${cat}]`));
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
          <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-12 animate-in slide-in-from-bottom-10 duration-1000">
            <div className="space-y-8">
              <button onClick={() => {setShowReviewer(false); setContentData(null);}} className="group flex items-center gap-4 text-xs font-black text-slate-500 hover:text-white transition-all uppercase tracking-[0.2em]">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10"><ArrowLeft size={18}/></div> Back to Hub
              </button>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-6 scrollbar-thin">
                {selectedList.map((record) => (
                  <div key={record.id} onClick={() => { setSelectedRecord(record); if(mode==='review') setSelectedTab('problem'); }} className={`p-8 rounded-[40px] cursor-pointer transition-all border ${selectedRecord?.id === record.id ? 'bg-indigo-600 border-indigo-400 shadow-2xl scale-[1.02]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    <div className="font-bold text-white tracking-tight leading-tight">{record.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[64px] overflow-hidden flex flex-col min-h-[850px] relative shadow-3xl backdrop-blur-3xl">
              {mode === 'review' && (
                <div className="flex bg-black/40 border-b border-white/10">
                  {(['problem', 'board', 'solution'] as const).map(tab => (
                    <button key={tab} onClick={() => setSelectedTab(tab)} className={`flex-1 py-8 text-[11px] font-black uppercase tracking-[0.3em] relative transition-all ${selectedTab === tab ? 'text-white bg-white/5' : 'text-slate-500 hover:text-white'}`}>
                      {tab} {selectedTab === tab && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_25px_rgba(99,102,241,1)]" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-12 flex-1 flex items-center justify-center bg-gradient-to-br from-transparent to-indigo-950/20 overflow-auto relative">
                {isContentLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-50"><Loader2 className="animate-spin text-indigo-500" size={50} /></div>}
                {contentData ? (
                  selectedTab === 'solution' ? <iframe srcDoc={contentData} className="w-full h-full border-0 rounded-[48px] bg-white shadow-3xl animate-in fade-in duration-1000" /> 
                  : <img src={contentData} alt="content" className="max-w-full max-h-[70vh] object-contain rounded-3xl shadow-3xl animate-in zoom-in-95 duration-700" />
                ) : !isContentLoading && <div className="text-slate-800 font-black text-8xl italic opacity-10 select-none tracking-tighter">EDUEST OS</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}