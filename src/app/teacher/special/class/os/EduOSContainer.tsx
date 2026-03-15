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

  // 🕹️ [LOAD] 팩 삽입 시
  const handlePackInsert = (pack: Material) => {
    setSelectedPack(pack);
    loadCartridgeData(pack); 
    if (!windows.problem.isOpen) toggleWindow('problem');
    focusWindow('problem');
  };

  // 📖 [번호 클릭 시] 3개 창을 자연스럽게 겹치며 띄우는 로직
  const handleLaunchProblem = useCallback((index: number) => {
    console.log("🔥 [ACTION] 런처 가동! 손풀이창 포함 3종 세트 발사");

    const pKey = String(index).padStart(4, '0');
    const pData = problemMap[pKey] || Object.values(problemMap)[index - 1];
    
    if (!pData) {
      alert(`[${index}번] 리소스를 찾을 수 없어!`);
      return;
    }

    // 데이터 셋업
    setCurrentIdx(index);
    setProblemData(pData);
    setSolutionData(solutionMap[`sol_${pKey}`] || solutionMap[pKey] || null);
    setCapturedImage(null);

    // 🚀 창 열기 (닫혀있는 애들만 골라서 토글)
    if (!windows.monitor.isOpen) toggleWindow('monitor');
    if (!windows.solution.isOpen) toggleWindow('solution');
    if (!windows.blackboard.isOpen) toggleWindow('blackboard');

    // 🚀 겹치듯 자연스러운 배치 (자기가 드래그하기 편하게!)
    setTimeout(() => {
      // 1. 문제 뷰어: 살짝 왼쪽 위
      updateWindowScale('monitor', { x: 80, y: 60, width: 750, height: 850 });
      
      // 2. 해설 뷰어: 중간에 슥 겹치게
      updateWindowScale('solution', { x: 180, y: 100, width: 750, height: 850 });
      
      // 3. 블랙보드(손풀이): 가장 잘 보이게 맨 위로 & 약간 오른쪽 아래 겹침
      updateWindowScale('blackboard', { x: 300, y: 140, width: 850, height: 900 });
      
      // 🔥 포커스를 블랙보드로 줘서 맨 위로 올림
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
      <div className="flex-1 relative p-6 overflow-hidden">
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
            className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-2xl border border-white/20 overflow-hidden"
          >
            {/* 타이틀바 */}
            <div className="handle h-14 bg-slate-50/50 flex items-center justify-between px-6 border-b shrink-0 cursor-grab active:cursor-grabbing">
              <span className="font-black text-slate-800 text-sm tracking-wide uppercase italic">
                {win.title} {currentIdx && !['cartridge', 'problem'].includes(win.id) ? `- Q${currentIdx}` : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => minimizeWindow(win.id)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"><Minus size={18} /></button>
                <button onClick={() => toggleWindow(win.id)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-full transition-colors"><X size={18} /></button>
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
      <footer className="h-20 bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between px-10 z-[99999]">
        <div className="flex items-center gap-6">
          <button onClick={() => toggleWindow('cartridge')} className={`p-4 rounded-3xl transition-all ${windows.cartridge.isOpen ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-white/5 text-slate-500'}`}>
            <Box size={28} />
          </button>
          <div className="w-[1px] h-10 bg-white/10" />
          <div className="flex gap-4">
            {(['monitor', 'solution', 'blackboard'] as WindowType[]).map(id => (
              <button 
                key={id} 
                onClick={() => {
                  if (!windows[id].isOpen) toggleWindow(id);
                  focusWindow(id);
                }} 
                className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all border ${windows[id].isOpen ? 'bg-white/10 border-white/20 text-white shadow-xl' : 'opacity-20 grayscale'}`}
              >
                {id === 'monitor' && <Monitor size={28} />}
                {id === 'solution' && <FileText size={28} />}
                {id === 'blackboard' && <PenTool size={28} />}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-8 text-slate-400 text-xs font-black italic uppercase tracking-tighter">
          EDU OS v3.0 | SYNC READY
        </div>
      </footer>
    </div>
  );
}