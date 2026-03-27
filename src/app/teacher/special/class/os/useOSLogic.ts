'use client';

import { useState, useCallback } from 'react';

// ✅ 1. 타입 명단
export type WindowType = 'cartridge' | 'problem' | 'monitor' | 'solution' | 'blackboard';

export interface WindowState {
  id: WindowType;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const useOSLogic = () => {
  // zIndex 관리
  const [maxZIndex, setMaxZIndex] = useState(10);
  
  // ✅ 2. 초기 윈도우 설정 (EduOS 특유의 큼직한 창 사이즈 유지)
  const [windows, setWindows] = useState<Record<WindowType, WindowState>>({
    cartridge: { id: 'cartridge', title: '📦 CARTRIDGE', isOpen: true, isMinimized: false, zIndex: 1, x: 100, y: 100, width: 700, height: 750 },
    problem: { id: 'problem', title: '🚀 LAUNCHER', isOpen: false, isMinimized: false, zIndex: 2, x: 50, y: 50, width: 500, height: 600 },
    monitor: { id: 'monitor', title: '📺 MONITOR', isOpen: false, isMinimized: false, zIndex: 3, x: 100, y: 100, width: 800, height: 850 },
    solution: { id: 'solution', title: '📄 SOLUTION', isOpen: false, isMinimized: false, zIndex: 4, x: 150, y: 150, width: 800, height: 850 },
    blackboard: { id: 'blackboard', title: '🎨 BLACKBOARD', isOpen: false, isMinimized: false, zIndex: 5, x: 200, y: 200, width: 900, height: 950 },
  });

  // 🔄 창 토글 (열기/닫기)
  const toggleWindow = useCallback((id: WindowType) => {
    setWindows(prev => {
      const isOpening = !prev[id].isOpen;
      const nextZ = isOpening ? maxZIndex + 1 : prev[id].zIndex;
      
      // ✅ 렌더링 도중 setState 방지를 위해 zIndex 업데이트 로직 최적화
      if (isOpening) setMaxZIndex(nextZ);

      return {
        ...prev,
        [id]: { 
          ...prev[id], 
          isOpen: isOpening, 
          isMinimized: false,
          zIndex: nextZ 
        }
      };
    });
  }, [maxZIndex]);

  // 🔝 창 포커스 (클릭 시 맨 위로)
  const focusWindow = useCallback((id: WindowType) => {
    setWindows(prev => {
      if (prev[id].zIndex === maxZIndex && !prev[id].isMinimized) return prev;

      const newZ = maxZIndex + 1;
      setMaxZIndex(newZ);

      return {
        ...prev,
        [id]: { ...prev[id], zIndex: newZ, isMinimized: false }
      };
    });
  }, [maxZIndex]);

  // ➖ 창 최소화
  const minimizeWindow = useCallback((id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true }
    }));
  }, []);

  // 📏 창 크기/위치 업데이트
  const updateWindowScale = useCallback((id: WindowType, scale: Partial<WindowState>) => {
    setWindows(prev => {
      const current = prev[id];
      
      // 🔥 [방어 로직] 실제로 값이 바뀌었을 때만 업데이트하여 무한 루프 차단
      const hasChanged = 
        (scale.x !== undefined && scale.x !== current.x) ||
        (scale.y !== undefined && scale.y !== current.y) ||
        (scale.width !== undefined && scale.width !== current.width) ||
        (scale.height !== undefined && scale.height !== current.height);

      if (!hasChanged) return prev;

      return {
        ...prev,
        [id]: { ...current, ...scale }
      };
    });
  }, []);

  return { windows, toggleWindow, focusWindow, minimizeWindow, updateWindowScale };
};