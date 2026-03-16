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

  // 🚀 문제 로딩 엔진
  const { progress, isReady, problemMap, solutionMap, loadCartridgeData } = useProblemEngine();

  // 🕹️ [반응형 감지] 폴드 및 모바일 체크
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🕹️ [LOAD] 팩 삽입 시 (여기가 수정 포인트! 🛠️)
  const handlePackInsert = (pack: Material) => {
    setSelectedPack(pack);
    loadCartridgeData(pack); 
    
    // 1. 창 열기
    if (!windows.problem.isOpen) toggleWindow('problem');
    
    // 2. 창 위치를 카트리지 근처로 "강제 배달" 🚚
    setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (vw < 1024) {
        // 📱 모바일/폴드: 상단에 꽉 차게 (엣지에서 안 보일 걱정 끝!)
        updateWindowScale('problem', { 
          x: 10, 
          y: 20, 
          width: vw - 20, 
          height: vh - 150 
        });
      } else {
        // 💻 데스크탑: 카트리지 창(보통 왼쪽)에서 살짝 오른쪽 위로 겹치게 배치
        // 카트리지 위치가 고정적이라면 아래 값을 조절해서 딱 맞출 수 있어!
        updateWindowScale('problem', { 
          x: 120, 
          y: 80, 
          width: 550, 
          height: 650 
        });
      }
      focusWindow('problem');
    }, 100);
  };

  // 📖 [번호 클릭 시] 반응형 대응 런처
  const handleLaunchProblem = useCallback((index: number) => {
    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey] || Object.values(problemMap)[index - 1];
    
    if (!pData) return alert(`[${index}번] 리소스를 찾을 수 없어!`);

    setCurrentIdx(index);
    setProblemData(pData);
    setSolutionData(solutionMap[`sol_${pKey}`] || solutionMap[pKey] || null);
    setCapturedImage(null);

    if (!windows.monitor.isOpen) toggleWindow('monitor');
    if (!windows.solution.isOpen) toggleWindow('solution');
    if (!windows.blackboard.isOpen) toggleWindow('blackboard');

    setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (vw < 1024) {
        const mobileW = vw - 20;
        const mobileH = vh - 140;
        updateWindowScale('monitor', { x: 10, y: 10, width: mobileW, height: mobileH });
        updateWindowScale('solution', { x: 10, y: 10, width: mobileW, height: mobileH });
        updateWindowScale('blackboard', { x: 10, y: 10, width: mobileW, height: mobileH });
      } else {
        updateWindowScale('monitor', { x: 80, y: 60, width: 750, height: 850 });
        updateWindowScale('solution', { x: 180, y: 100, width: 750, height: 850 });
        updateWindowScale('blackboard', { x: 300, y: 140, width: 850, height: 900 });
      }
      focusWindow('blackboard');
    }, 150);

  }, [problemMap, solutionMap, windows, toggleWindow, updateWindowScale, focusWindow]);

  const handleCapture = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    focusWindow('blackboard');
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#020617] overflow-hidden flex flex-col z-[9999]">
      
      {/* 🪟 윈도우 레이어 */}
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
            {/* 타이틀바 */}
            <div className={`handle ${isNarrow ? 'h-10 px-4' : 'h-14 px-6'} bg-slate-50/50 flex items-center justify-between border-b shrink-0 cursor-grab active:cursor-grabbing`}>
              <span className="font-black text-slate-800 text-[10px] md:text-sm tracking-wide uppercase italic truncate">
                {win.title} {currentIdx && !['cartridge', 'problem'].includes(win.id) ? `- Q${currentIdx}` : ''}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => minimizeWindow(win.id)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"><Minus size={isNarrow ? 14 : 18} /></button>
                <button onClick={() => toggleWindow(win.id)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-full transition-colors"><X size={isNarrow ? 14 : 18} /></button>
              </div>
            </div>

            {/* 창 내용물 */}
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

      {/* 📟 태스크바 */}
      <footer className={`${isNarrow ? 'h-16 px-4' : 'h-20 px-10'} bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between z-[99999]`}>
        <div className="flex items-center gap-3 md:gap-6">
          <button onClick={() => toggleWindow('cartridge')} className={`${isNarrow ? 'p-3 rounded-2xl' : 'p-4 rounded-3xl'} transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/5 text-slate-500'}`}>
            <Box size={isNarrow ? 20 : 28} />
          </button>
          <div className="w-[1px] h-8 bg-white/10" />
          <div className="flex gap-2 md:gap-4">
            {(['monitor', 'solution', 'blackboard'] as WindowType[]).map(id => (
              <button 
                key={id} 
                onClick={() => {
                  if (!windows[id].isOpen) toggleWindow(id);
                  focusWindow(id);
                }} 
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