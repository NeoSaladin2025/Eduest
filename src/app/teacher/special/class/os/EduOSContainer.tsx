'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd'; 
import { Monitor, FileText, PenTool, Box, X, Minus, Users, Save, Loader2, ChevronRight } from 'lucide-react'; 
import { useOSLogic, WindowType } from './useOSLogic';

// 📦 하위 모듈들
import CartridgeWindow from './cartridge/CartridgeWindow';
import ProblemWindow from './problem/ProblemWindow'; 
import ProblemViewer from './problem/viewer/ProblemViewer';
import SolutionViewer from './problem/solution/SolutionViewer';
import Blackboard, { BlackboardHandle } from './problem/blackboard/Blackboard';

// ⚙️ 학생 관리 시스템 모듈
import { StudentProvider, useStudents } from './controller/StudentContext';
import StudentSelector from './controller/StudentSelector';
import StudentManager from './controller/StudentManager';

// ⚙️ 엔진 훅
import { useProblemEngine } from './problem/useProblemEngine';
import { Material } from './cartridge/useCartridge';

/**
 * 🚀 [저장 버튼 컴포넌트] 
 * 카트리지 이름을 포함하여 서버로 전송하도록 업데이트되었습니다.
 */
function SaveButton({ 
  blackboardRef, 
  currentIdx, 
  selectedPack, 
  problemIdMap,
  solutionIdMap 
}: { 
  blackboardRef: React.RefObject<BlackboardHandle | null>,
  currentIdx: number | null,
  selectedPack: Material | null,
  problemIdMap: Record<string, string>,
  solutionIdMap: Record<string, string>
}) {
  const { selectedStudent } = useStudents();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    // 1️⃣ 유효성 검사
    if (!selectedStudent) return alert('학생을 먼저 선택해주세요! 👩‍🎓');
    if (!blackboardRef.current) return alert('칠판 시스템이 준비되지 않았습니다.');
    if (!selectedPack) return alert('카트리지를 먼저 삽입해주세요! 📦');

    // 2️⃣ 칠판 데이터 추출 (Base64)
    const canvasData = blackboardRef.current.getCanvasData(); 
    if (!canvasData || canvasData.length < 1000) {
      return alert('저장할 판서 내용이 없습니다! 🎨');
    }

    setIsSaving(true);
    try {
      // ✅ 문제 키 생성 (예: 1 -> "0001")
      const pKey = String(currentIdx).padStart(4, '0');
      
      // ✅ ID 맵에서 실제 구글 드라이브 파일 ID 추출
      const pFileId = problemIdMap[pKey] || "";
      const sFileId = solutionIdMap[pKey] || solutionIdMap[`sol_${pKey}`] || "";

      // ✅ [카트리지 정보] 선택된 팩의 타이틀을 카트리지명으로 사용
      const cartridgeName = selectedPack.title; 

      // ✅ 파일명 조합 (API 라우트에서 [카트리지명]을 붙여주므로 여기선 순수 이름만 전송)
      const problemNumber = currentIdx ? `${currentIdx}번` : 'No_Number';
      const pureFileName = `${problemNumber}_${selectedStudent.name}.png`;

      // 3️⃣ 통합 저장 API 호출 (경로: /api/save-action)
      const res = await fetch('/api/save-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          imageData: canvasData,
          fileName: pureFileName,
          problemUrl: pFileId, 
          solutionUrl: sFileId,
          cartridgeName: cartridgeName // 🔥 스텔스 로딩을 위한 핵심 데이터!
        }),
      });

      const result = await res.json();
      if (res.ok) {
        alert(`✅ [${cartridgeName}] 카트리지에 저장이 완료되었습니다!\n${selectedStudent.name} 학생이 바로 확인할 수 있어요. 🚀`);
      } else {
        throw new Error(result.error || '저장 중 서버 오류가 발생했습니다.');
      }
    } catch (err: any) {
      console.error('Save Error:', err);
      alert(`❌ 저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button 
      onClick={handleSave}
      disabled={isSaving || !selectedStudent}
      className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-2xl shadow-lg shadow-indigo-500/20 transition-all font-black text-xs italic tracking-tighter"
    >
      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
      {isSaving ? 'SAVING...' : 'SAVE TO DRIVE'}
    </button>
  );
}

export default function EduOSContainer() {
  const { windows, focusWindow, toggleWindow, minimizeWindow, updateWindowScale } = useOSLogic();
  const blackboardRef = useRef<BlackboardHandle>(null); 
  
  const [selectedPack, setSelectedPack] = useState<Material | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [problemData, setProblemData] = useState<string | null>(null);
  const [solutionData, setSolutionData] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [isStudentMgrOpen, setIsStudentMgrOpen] = useState(false);
  
  const { 
    progress, 
    isReady, 
    problemMap, 
    solutionMap, 
    problemIdMap, 
    solutionIdMap, 
    loadCartridgeData 
  } = useProblemEngine();

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getResponsiveScale = useCallback((id: WindowType) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 1024) return { x: 10, y: 10, width: vw * 0.92, height: vh * 0.75 };
    
    const desktopMap: Record<string, any> = {
      cartridge: { x: 40, y: 40, width: 700, height: 800 },
      problem: { x: 80, y: 60, width: 600, height: 700 },
      monitor: { x: 120, y: 80, width: 750, height: 850 },
      solution: { x: 160, y: 100, width: 750, height: 850 },
      blackboard: { x: 60, y: 50, width: 850, height: 900 } 
    };
    return desktopMap[id] || { x: 100, y: 100, width: 700, height: 800 };
  }, []);

  const handleTaskbarToggle = (id: WindowType) => {
    if (windows[id].isOpen) {
      toggleWindow(id);
    } else {
      toggleWindow(id);
      setTimeout(() => {
        updateWindowScale(id, getResponsiveScale(id));
        focusWindow(id);
      }, 50);
    }
  };

  const handlePackInsert = (pack: Material) => {
    setSelectedPack(pack);
    loadCartridgeData(pack);
    if (!windows.problem.isOpen) {
      toggleWindow('problem');
      setTimeout(() => {
        updateWindowScale('problem', getResponsiveScale('problem'));
        focusWindow('problem');
      }, 100);
    } else {
      focusWindow('problem');
    }
  };

  const handleLaunchProblem = useCallback((index: number) => {
    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey] || Object.values(problemMap)[index - 1];
    if (!pData) return alert(`리소스를 찾을 수 없어!`);
    
    setCurrentIdx(index);
    setProblemData(pData);
    setSolutionData(solutionMap[`sol_${pKey}`] || solutionMap[pKey] || null);
    setCapturedImage(null);

    ['monitor', 'solution', 'blackboard'].forEach((id, i) => {
      if (!windows[id as WindowType].isOpen) toggleWindow(id as WindowType);
      setTimeout(() => {
        const scale = getResponsiveScale(id as WindowType);
        updateWindowScale(id as WindowType, {
          ...scale,
          x: scale.x + (i * (isNarrow ? 10 : 20)),
          y: scale.y + (i * (isNarrow ? 10 : 20))
        });
        if (id === 'blackboard') focusWindow('blackboard');
      }, 100 + (i * 80));
    });
  }, [problemMap, solutionMap, windows, toggleWindow, updateWindowScale, focusWindow, isNarrow, getResponsiveScale]);

  const handleCapture = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    if (!windows.blackboard.isOpen) handleTaskbarToggle('blackboard');
    focusWindow('blackboard');
  };

  return (
    <StudentProvider>
      <div className="fixed inset-0 w-screen h-screen bg-[#020617] overflow-hidden flex flex-col z-[9999]">
        <header className="h-16 bg-slate-900/60 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 z-[10000]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Box size={18} className="text-white" />
              </div>
              <div className="text-white font-black italic tracking-tighter text-xl leading-none">EduOS</div>
            </div>
            <div className="w-[1px] h-4 bg-white/10" />
            <StudentSelector />
            <button 
              onClick={() => setIsStudentMgrOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all text-[11px] font-black uppercase tracking-widest ml-2"
            >
              <Users size={16} />
              <span className="hidden md:inline">Manage</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <SaveButton 
              blackboardRef={blackboardRef} 
              currentIdx={currentIdx}
              selectedPack={selectedPack}
              problemIdMap={problemIdMap}
              solutionIdMap={solutionIdMap}
            />
          </div>
        </header>

        <div className="flex-1 relative p-2 md:p-6 overflow-hidden">
          {Object.values(windows).map((win) => (
            <Rnd
              key={win.id}
              style={{ display: win.isOpen && !win.isMinimized ? 'flex' : 'none', zIndex: win.zIndex, flexDirection: 'column' }}
              size={{ width: win.width, height: win.height }}
              position={{ x: win.x, y: win.y }}
              onDragStop={(_e, d) => updateWindowScale(win.id, { x: d.x, y: d.y })}
              onResizeStop={(_e, _dir, ref, _delta, pos) => {
                updateWindowScale(win.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), ...pos });
              }}
              dragHandleClassName="handle"
              bounds="parent"
              onMouseDown={() => focusWindow(win.id)}
              className="bg-white/95 backdrop-blur-xl rounded-[20px] md:rounded-[32px] shadow-2xl border border-white/20 overflow-hidden"
            >
              <div className="h-14 bg-slate-50/50 flex items-center justify-between border-b shrink-0 relative">
                <div className="handle flex-1 h-full flex items-center px-6">
                  <span className="font-black text-slate-800 text-[11px] md:text-sm tracking-wide uppercase italic truncate pointer-events-none select-none">
                    {win.title} {currentIdx && !['cartridge', 'problem'].includes(win.id) ? `- Q${currentIdx}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 pr-3 relative z-[9999]">
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }} className="p-3 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"><Minus size={18} /></button>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleWindow(win.id); }} className="p-2 text-rose-400 hover:bg-rose-50 rounded-full transition-colors"><X size={20} /></button>
                </div>
              </div>

              <div className="flex-1 bg-white overflow-hidden relative">
                {win.id === 'cartridge' && <CartridgeWindow onPackInsert={handlePackInsert} currentPackId={selectedPack?.id} />}
                {win.id === 'problem' && <ProblemWindow selectedPack={selectedPack} onLaunch={handleLaunchProblem} progress={progress} isReady={isReady} />}
                {win.id === 'monitor' && <ProblemViewer sourceData={problemData} onCapture={handleCapture} />}
                {win.id === 'solution' && <SolutionViewer sourceData={solutionData} />}
                {win.id === 'blackboard' && <Blackboard ref={blackboardRef} pastedImage={capturedImage} />}
              </div>
            </Rnd>
          ))}
        </div>

        <StudentManager 
          isOpen={isStudentMgrOpen} 
          onClose={() => setIsStudentMgrOpen(false)} 
        />

        <footer className={`${isNarrow ? 'h-16 px-4' : 'h-20 px-10'} bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between z-[99999]`}>
          <div className="flex items-center gap-3 md:gap-6">
            <button onClick={() => handleTaskbarToggle('cartridge')} className={`${isNarrow ? 'p-3 rounded-2xl' : 'p-4 rounded-3xl'} transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/10 text-slate-400 opacity-50 hover:opacity-100'}`}><Box size={isNarrow ? 20 : 28} /></button>
            <div className="w-[1px] h-8 bg-white/10" />
            <div className="flex gap-2 md:gap-4">
              {(['monitor', 'solution', 'blackboard']).map(id => (
                <button key={id} onClick={() => handleTaskbarToggle(id as WindowType)} className={`${isNarrow ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-3xl'} flex items-center justify-center transition-all border ${windows[id as WindowType].isOpen ? 'bg-white/10 border-white/20 text-white shadow-xl' : 'bg-white/5 border-white/5 text-slate-500 opacity-40 hover:opacity-100'}`}>
                  {id === 'monitor' && <Monitor size={isNarrow ? 20 : 28} />}
                  {id === 'solution' && <FileText size={isNarrow ? 20 : 28} />}
                  {id === 'blackboard' && <PenTool size={isNarrow ? 20 : 28} />}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </StudentProvider>
  );
}