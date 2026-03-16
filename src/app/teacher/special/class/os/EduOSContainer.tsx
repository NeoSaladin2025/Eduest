'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd'; 
import { Monitor, FileText, PenTool, Box, X, Minus } from 'lucide-react';
import { useOSLogic, WindowType } from './useOSLogic';

// 📦 하위 모듈들
import CartridgeWindow from './cartridge/CartridgeWindow';
import ProblemWindow from './problem/ProblemWindow'; 
import ProblemViewer from './problem/viewer/ProblemViewer';
import SolutionViewer from './problem/solution/SolutionViewer';
import Blackboard from './problem/blackboard/Blackboard';

// ⚙️ 엔진 훅
import { useProblemEngine } from './problem/useProblemEngine';
import { Material } from './cartridge/useCartridge';

export default function EduOSContainer() {
  const { windows, focusWindow, toggleWindow, minimizeWindow, updateWindowScale } = useOSLogic();
  
  const [selectedPack, setSelectedPack] = useState<Material | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [problemData, setProblemData] = useState<string | null>(null);
  const [solutionData, setSolutionData] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const { progress, isReady, problemMap, solutionMap, loadCartridgeData } = useProblemEngine();

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 📐 [반응형 스케일 계산기] - 모바일에서 절대 화면 밖으로 못 나가게 좌표 강제 조정
  const getResponsiveScale = useCallback((id: WindowType) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 1024;

    if (isMobile) {
      // 📱 모바일/폴드: 구석(5, 10)에서 시작해서 화면의 95% 너비 사용
      const mWidth = vw * 0.95;
      const mHeight = vh * 0.75; 
      // 칠판이나 카트리지는 가출 방지를 위해 무조건 좌상단 고정 소환
      return { x: 5, y: 10, width: mWidth, height: mHeight };
    } else {
      // 💻 데스크탑: 자기가 선호하는 계단식 배치
      const desktopMap: Record<string, any> = {
        cartridge: { x: 40, y: 40, width: 700, height: 800 },
        problem: { x: 60, y: 60, width: 600, height: 700 },
        monitor: { x: 100, y: 80, width: 750, height: 850 },
        solution: { x: 140, y: 100, width: 750, height: 850 },
        blackboard: { x: 30, y: 30, width: 850, height: 900 } 
      };
      return desktopMap[id] || { x: 50, y: 50, width: 700, height: 800 };
    }
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
    if (!windows.problem.isOpen) handleTaskbarToggle('problem');
    else focusWindow('problem');
  };

  const handleLaunchProblem = useCallback((index: number) => {
    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey] || Object.values(problemMap)[index - 1];
    if (!pData) return alert(`[${index}번] 리소스를 찾을 수 없어!`);
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
      }, 100 + (i * 80)); // 딜레이를 약간 줘서 모바일 렌더링 부하 방지
    });
  }, [problemMap, solutionMap, windows, toggleWindow, updateWindowScale, focusWindow, isNarrow, getResponsiveScale]);

  const handleCapture = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    if (!windows.blackboard.isOpen) handleTaskbarToggle('blackboard');
    focusWindow('blackboard');
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#020617] overflow-hidden flex flex-col z-[9999]">
      <div className="flex-1 relative p-2 md:p-6 overflow-hidden">
        {Object.values(windows).map((win) => (
          <Rnd
            key={win.id}
            style={{ 
              display: win.isOpen && !win.isMinimized ? 'flex' : 'none',
              zIndex: win.zIndex,
              flexDirection: 'column'
            }}
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
            {/* 🚀 상단바 - 모바일 터치 클릭 완전 보장 수술 */}
            <div className={`handle ${isNarrow ? 'h-14 px-4' : 'h-14 px-6'} bg-slate-50/50 flex items-center justify-between border-b shrink-0 cursor-grab active:cursor-grabbing relative`}>
              <span className="font-black text-slate-800 text-[11px] md:text-sm tracking-wide uppercase italic truncate pr-2 pointer-events-none select-none">
                {win.title} {currentIdx && !['cartridge', 'problem'].includes(win.id) ? `- Q${currentIdx}` : ''}
              </span>
              
              <div className="flex items-center gap-1 md:gap-2 relative z-[9999]">
                <button 
                  onPointerDown={(e) => e.stopPropagation()} // 💡 터치 이벤트 가로채기
                  onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }} 
                  className="p-3 text-slate-400 hover:bg-slate-200 rounded-full transition-colors active:bg-slate-300 touch-none"
                >
                  <Minus size={isNarrow ? 20 : 20} />
                </button>
                <button 
                  onPointerDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); toggleWindow(win.id); }} 
                  className="p-3 text-rose-400 hover:bg-rose-50 rounded-full transition-colors active:bg-rose-100 touch-none"
                >
                  <X size={isNarrow ? 20 : 20} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-white overflow-hidden relative">
              {win.id === 'cartridge' && <CartridgeWindow onPackInsert={handlePackInsert} currentPackId={selectedPack?.id} />}
              {win.id === 'problem' && <ProblemWindow selectedPack={selectedPack} onLaunch={handleLaunchProblem} progress={progress} isReady={isReady} />}
              {win.id === 'monitor' && <ProblemViewer sourceData={problemData} onCapture={handleCapture} />}
              {win.id === 'solution' && <SolutionViewer sourceData={solutionData} />}
              {win.id === 'blackboard' && <Blackboard pastedImage={capturedImage} />}
            </div>
          </Rnd>
        ))}
      </div>

      <footer className={`${isNarrow ? 'h-16 px-4' : 'h-20 px-10'} bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between z-[99999]`}>
        <div className="flex items-center gap-3 md:gap-6">
          <button 
            onClick={() => handleTaskbarToggle('cartridge')} 
            className={`${isNarrow ? 'p-3 rounded-2xl' : 'p-4 rounded-3xl'} transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/10 text-slate-400 opacity-50 hover:opacity-100'}`}
          >
            <Box size={isNarrow ? 20 : 28} />
          </button>
          
          <div className="w-[1px] h-8 bg-white/10" />
          
          <div className="flex gap-2 md:gap-4">
            {(['monitor', 'solution', 'blackboard'] as WindowType[]).map(id => (
              <button 
                key={id} 
                onClick={() => handleTaskbarToggle(id)} 
                className={`${isNarrow ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-3xl'} flex items-center justify-center transition-all border ${windows[id].isOpen ? 'bg-white/10 border-white/20 text-white shadow-xl' : 'bg-white/5 border-white/5 text-slate-500 opacity-40 hover:opacity-100'}`}
              >
                {id === 'monitor' && <Monitor size={isNarrow ? 20 : 28} />}
                {id === 'solution' && <FileText size={isNarrow ? 20 : 28} />}
                {id === 'blackboard' && <PenTool size={isNarrow ? 20 : 28} />}
              </button>
            ))}
          </div>
        </div>
        {!isNarrow && <div className="text-slate-400 text-xs font-black italic uppercase">EDU OS v3.0 | SYNC READY</div>}
      </footer>
    </div>
  );
}