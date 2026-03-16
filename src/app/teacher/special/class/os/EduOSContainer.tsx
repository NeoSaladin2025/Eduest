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
  
  // 💾 상태 관리
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

  // 🕹️ [태스크바 토글 핸들러] - 클릭 시 껐다 켜기 + 좌상단 초기화
  const handleTaskbarToggle = (id: WindowType) => {
    const win = windows[id];
    
    if (win.isOpen) {
      // 1. 열려있으면 닫기
      toggleWindow(id);
    } else {
      // 2. 닫혀있으면 열기 + 위치를 왼쪽 위로 강제 리셋 🚚
      toggleWindow(id);
      setTimeout(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        // 창 종류별로 살짝 겹치게 좌상단에 배치
        const offsetMap: Record<string, number> = {
          cartridge: 20,
          problem: 40,
          monitor: 60,
          solution: 80,
          blackboard: 100
        };

        const offset = offsetMap[id] || 20;

        updateWindowScale(id, { 
          x: isNarrow ? 10 : offset, 
          y: isNarrow ? 20 : offset, 
          // 크기는 기존 자기가 선호하는 비율 유지
          width: isNarrow ? vw - 20 : (id === 'blackboard' ? 850 : 750), 
          height: isNarrow ? vh - 150 : (id === 'blackboard' ? 900 : 850) 
        });
        focusWindow(id);
      }, 50);
    }
  };

  // 🕹️ [LOAD] 팩 삽입 시
  const handlePackInsert = (pack: Material) => {
    setSelectedPack(pack);
    loadCartridgeData(pack); 
    if (!windows.problem.isOpen) handleTaskbarToggle('problem');
    else focusWindow('problem');
  };

  // 📖 [번호 클릭 시] 런처 가동
  const handleLaunchProblem = useCallback((index: number) => {
    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey] || Object.values(problemMap)[index - 1];
    if (!pData) return alert(`[${index}번] 리소스를 찾을 수 없어!`);

    setCurrentIdx(index);
    setProblemData(pData);
    setSolutionData(solutionMap[`sol_${pKey}`] || solutionMap[pKey] || null);
    setCapturedImage(null);

    // 창들을 좌상단에 순차적으로 띄우기
    ['monitor', 'solution', 'blackboard'].forEach((id, i) => {
      if (!windows[id as WindowType].isOpen) {
        toggleWindow(id as WindowType);
      }
      setTimeout(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const offset = 60 + (i * 40); // 60, 100, 140 순으로 겹침

        updateWindowScale(id as WindowType, { 
          x: isNarrow ? 10 : offset, 
          y: isNarrow ? 20 : offset, 
          width: isNarrow ? vw - 20 : (id === 'blackboard' ? 850 : 750), 
          height: isNarrow ? vh - 150 : (id === 'blackboard' ? 900 : 850) 
        });
        if (id === 'blackboard') focusWindow('blackboard');
      }, 100 + (i * 50));
    });

  }, [problemMap, solutionMap, windows, toggleWindow, updateWindowScale, focusWindow, isNarrow]);

  const handleCapture = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    if (!windows.blackboard.isOpen) toggleWindow('blackboard');
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
            <div className={`handle ${isNarrow ? 'h-12 px-4' : 'h-14 px-6'} bg-slate-50/50 flex items-center justify-between border-b shrink-0 cursor-grab active:cursor-grabbing relative`}>
              <span className="font-black text-slate-800 text-[10px] md:text-sm tracking-wide uppercase italic truncate pr-2 pointer-events-none">
                {win.title} {currentIdx && !['cartridge', 'problem'].includes(win.id) ? `- Q${currentIdx}` : ''}
              </span>
              
              <div className="flex items-center gap-2 relative z-[100] pointer-events-auto">
                <button 
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }} 
                  className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors active:scale-90"
                >
                  <Minus size={isNarrow ? 18 : 18} />
                </button>
                <button 
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); toggleWindow(win.id); }} 
                  className="p-2 text-rose-400 hover:bg-rose-50 rounded-full transition-colors active:scale-90"
                >
                  <X size={isNarrow ? 18 : 18} />
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
          {/* 카트리지 버튼 */}
          <button 
            onClick={() => handleTaskbarToggle('cartridge')} 
            className={`${isNarrow ? 'p-3 rounded-2xl' : 'p-4 rounded-3xl'} transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/5 text-slate-500'}`}
          >
            <Box size={isNarrow ? 20 : 28} />
          </button>
          
          <div className="w-[1px] h-8 bg-white/10" />
          
          <div className="flex gap-2 md:gap-4">
            {(['monitor', 'solution', 'blackboard'] as WindowType[]).map(id => (
              <button 
                key={id} 
                onClick={() => handleTaskbarToggle(id)} 
                className={`${isNarrow ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-3xl'} flex items-center justify-center transition-all border ${windows[id].isOpen ? 'bg-white/10 border-white/20 text-white shadow-xl' : 'opacity-20 grayscale'}`}
              >
                {id === 'monitor' && <Monitor size={isNarrow ? 20 : 28} />}
                {id === 'solution' && <FileText size={isNarrow ? 20 : 28} />}
                {id === 'blackboard' && <PenTool size={isNarrow ? 20 : 28} />}
              </button>
            ))}
          </div>
        </div>
        {!isNarrow && (
          <div className="flex items-center gap-8 text-slate-400 text-xs font-black italic uppercase tracking-tighter">
            EDU OS v3.0 | SYNC READY
          </div>
        )}
      </footer>
    </div>
  );
}