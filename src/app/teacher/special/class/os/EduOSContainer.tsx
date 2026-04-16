'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Rnd } from 'react-rnd'; 
import { 
  Monitor, FileText, PenTool, Box, X, Minus, Users, Save, Loader2, 
  LayoutGrid 
} from 'lucide-react'; 
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
 * GAS 웹 앱을 호출하여 구글 로그인 없이 즉시 저장합니다.
 */
function SaveButton({ 
  blackboardRef, currentIdx, selectedPack, problemIdMap, solutionIdMap 
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
    if (!selectedStudent) return alert('학생을 먼저 선택해주세요! 👩‍🎓');
    if (!blackboardRef.current) return alert('칠판 시스템이 준비되지 않았습니다.');
    if (!selectedPack) return alert('카트리지를 먼저 삽입해주세요! 📦');

    const canvasData = blackboardRef.current.getCanvasData(); 
    if (!canvasData || canvasData.length < 1000) {
      return alert('저장할 판서 내용이 없습니다! 🎨');
    }

    setIsSaving(true);
    try {
      const pKey = String(currentIdx).padStart(4, '0');
      const pFileId = problemIdMap[pKey] || "";
      const sFileId = solutionIdMap[pKey] || solutionIdMap[`sol_${pKey}`] || "";
      
      const GAS_URL = "https://script.google.com/macros/s/AKfycbzRXwdja0xFm9wKcTG0asR5cv2mmhUDLK_S9j1VgtCcI37Dqw228mNrwNm74yzfyS05GA/exec";
      
      // 🔥 [수정 포인트] 파일명에 [카트리지명]을 포함하여 저장 (리뷰 모드 분류용)
      const fileName = `[${selectedPack.title}] ${currentIdx}번_${selectedStudent.name}.png`;

      const res = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          apiKey: "eduest_super_secret_key_1234", 
          action: "upload_and_record",
          studentFolderId: selectedStudent.folderId || (selectedStudent as any).drive_folder_id,
          imageData: canvasData.split(',')[1], 
          fileName: fileName, // 수정된 파일명 적용
          problemUrl: pFileId, 
          solutionUrl: sFileId,
          cartridgeName: selectedPack.title
        }),
      });

      const result = await res.json();
      if (result.success) {
        alert(`✅ [${selectedPack.title}] 저장이 완료되었습니다!\n${selectedStudent.name} 학생이 바로 확인할 수 있어요. 🚀`);
      } else {
        throw new Error(result.error || 'GAS 저장 오류');
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
    loadCartridgeData,
    loadSpecificProblem 
  } = useProblemEngine();

  const [useTiling, setUseTiling] = useState(false);
  useEffect(() => {
    const handleResize = () => setUseTiling(window.innerWidth <= 1920);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeWindows = useMemo(() => {
    return (['problem', 'monitor', 'solution', 'blackboard'] as WindowType[])
      .filter(id => windows[id].isOpen && !windows[id].isMinimized);
  }, [windows]);

  const activeCount = activeWindows.length;

  const getResponsiveScale = useCallback((id: WindowType) => {
    const desktopMap: Record<string, { x: number; y: number; width: number; height: number }> = {
      problem: { x: 80, y: 60, width: 600, height: 700 },
      monitor: { x: 120, y: 80, width: 750, height: 850 },
      solution: { x: 160, y: 100, width: 750, height: 850 },
      blackboard: { x: 60, y: 50, width: 850, height: 900 },
      cartridge: { x: 400, y: 80, width: 700, height: 750 },
    };

    // SSR / 빌드 시 프리렌더: window 없음 → 고정 레이아웃만 사용
    if (typeof window === 'undefined') {
      return desktopMap[id] || { x: 100, y: 100, width: 700, height: 800 };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (id === 'cartridge') {
      return { x: (vw - 700) / 2, y: 80, width: 700, height: 750 };
    }

    if (useTiling) {
      const idx = activeWindows.indexOf(id);
      if (idx === -1) return null;
      const tileWidth = vw / activeCount;
      const contentHeight = vh - 80;

      return {
        x: idx * tileWidth,
        y: 0, 
        width: tileWidth,
        height: contentHeight - 64 
      };
    }

    return desktopMap[id] || { x: 100, y: 100, width: 700, height: 800 };
  }, [useTiling, activeWindows, activeCount]);

  const handleTaskbarToggle = (id: WindowType) => {
    if (windows[id].isOpen) {
      toggleWindow(id);
    } else {
      toggleWindow(id);
      setTimeout(() => {
        const scale = getResponsiveScale(id);
        if (scale) updateWindowScale(id, scale);
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
        const scale = getResponsiveScale('problem');
        if (scale) updateWindowScale('problem', scale);
        focusWindow('problem');
      }, 100);
    } else {
      focusWindow('problem');
    }
  };

  const handleLaunchProblem = useCallback(async (index: number) => {
    await loadSpecificProblem(index);

    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey];
    
    if (!pData) return alert(`리소스를 찾을 수 없어!`);
    
    setCurrentIdx(index);
    setProblemData(pData);
    setSolutionData(solutionMap[`sol_${pKey}`] || solutionMap[pKey] || null);
    setCapturedImage(null);

    ['monitor', 'solution', 'blackboard'].forEach((id) => {
      if (!windows[id as WindowType].isOpen) toggleWindow(id as WindowType);
    });
  }, [loadSpecificProblem, problemMap, solutionMap, windows, toggleWindow]);

  const handleCapture = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    if (!windows.blackboard.isOpen) handleTaskbarToggle('blackboard');
    focusWindow('blackboard');
  };

  // 🔥 [무한 루프 방어] 4분할 레이아웃 자동 계산 로직
  useEffect(() => {
    if (useTiling) {
      activeWindows.forEach(id => {
        const newScale = getResponsiveScale(id);
        if (!newScale) return;

        const currentWin = windows[id];
        // 🛠️ 현재 창의 크기/위치가 새로 계산된 값과 진짜로 다를 때만 업데이트를 요청함!
        if (
          currentWin.x !== newScale.x || 
          currentWin.y !== newScale.y || 
          currentWin.width !== newScale.width || 
          currentWin.height !== newScale.height
        ) {
          updateWindowScale(id, newScale);
        }
      });
    }
  // windows 객체를 의존성에 넣되, 내부에서 비교 로직으로 업데이트를 제어함
  }, [activeCount, useTiling, activeWindows, getResponsiveScale, updateWindowScale, windows]);

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
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 transition-all text-[11px] font-black uppercase tracking-widest ml-2"
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

        <div className="flex-1 relative p-0 overflow-hidden">
          {Object.values(windows).map((win) => {
            const layout = getResponsiveScale(win.id as WindowType);
            const isTiled = useTiling && ['problem', 'monitor', 'solution', 'blackboard'].includes(win.id);

            return (
              <Rnd
                key={win.id}
                style={{ 
                  display: win.isOpen && !win.isMinimized ? 'flex' : 'none', 
                  zIndex: win.zIndex, 
                  flexDirection: 'column',
                  transition: useTiling ? 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)' : 'none'
                }}
                size={layout ? { width: layout.width, height: layout.height } : { width: win.width, height: win.height }}
                position={layout ? { x: layout.x, y: layout.y } : { x: win.x, y: win.y }}
                disableDragging={isTiled}
                enableResizing={!isTiled}
                onDragStop={(_e, d) => updateWindowScale(win.id, { x: d.x, y: d.y })}
                onResizeStop={(_e, _dir, ref, _delta, pos) => {
                  updateWindowScale(win.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), ...pos });
                }}
                dragHandleClassName="handle"
                bounds="parent"
                onMouseDown={() => focusWindow(win.id)}
                className={`bg-white/95 backdrop-blur-xl shadow-2xl border border-white/20 overflow-hidden ${
                  isTiled ? 'rounded-none border-x-slate-200' : 'rounded-[32px]'
                }`}
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
            );
          })}
        </div>

        <StudentManager 
          isOpen={isStudentMgrOpen} 
          onClose={() => setIsStudentMgrOpen(false)} 
        />

        <footer className="h-20 bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between px-6 z-[99999]">
          <div className="flex items-center gap-3 md:gap-6">
            <button onClick={() => handleTaskbarToggle('cartridge')} className={`p-4 rounded-3xl transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/10 text-slate-400 opacity-50 hover:opacity-100'}`}><Box size={28} /></button>
            <div className="w-[1px] h-8 bg-white/10" />
            <div className="flex gap-2 md:gap-4">
              {(['problem', 'monitor', 'solution', 'blackboard']).map(id => (
                <button 
                  key={id} 
                  onClick={() => handleTaskbarToggle(id as WindowType)} 
                  className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all border ${windows[id as WindowType].isOpen && !windows[id as WindowType].isMinimized ? 'bg-white/10 border-white/20 text-white shadow-xl scale-110' : 'bg-white/5 border-white/5 text-slate-500 opacity-40 hover:opacity-100'}`}
                >
                  {id === 'problem' && <LayoutGrid size={28} />}
                  {id === 'monitor' && <Monitor size={28} />}
                  {id === 'solution' && <FileText size={28} />}
                  {id === 'blackboard' && <PenTool size={28} />}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </StudentProvider>
  );
}