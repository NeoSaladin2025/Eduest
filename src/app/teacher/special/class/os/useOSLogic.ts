'use client';

import { useState, useCallback } from 'react';

// ✅ 1. 타입 명단은 완벽해!
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
  const [maxZIndex, setMaxZIndex] = useState(10);
  
  // ✅ 2. 초기 윈도우 객체들 설정
  // 🚀 [수정] 초기 X 좌표를 1350 -> 20 정도로 확 당겨야 모바일에서 보여!
  const [windows, setWindows] = useState<Record<WindowType, WindowState>>({
    cartridge: { id: 'cartridge', title: 'Cartridge Library', isOpen: true, isMinimized: false, zIndex: 1, x: 20, y: 20, width: 400, height: 500 },
    problem: { id: 'problem', title: 'Problem Launcher', isOpen: false, isMinimized: false, zIndex: 2, x: 40, y: 40, width: 400, height: 500 },
    monitor: { id: 'monitor', title: 'Problem Viewer', isOpen: false, isMinimized: false, zIndex: 3, x: 60, y: 60, width: 600, height: 700 },
    solution: { id: 'solution', title: 'Solution Viewer', isOpen: false, isMinimized: false, zIndex: 4, x: 80, y: 80, width: 600, height: 700 },
    // ⚠️ 범인 검거: 1350px은 모바일에서 가출 좌표임! 20px로 안전하게 소환.
    blackboard: { id: 'blackboard', title: 'Blackboard', isOpen: false, isMinimized: false, zIndex: 5, x: 20, y: 20, width: 500, height: 700 },
  });

  const toggleWindow = useCallback((id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: !prev[id].isOpen, isMinimized: false }
    }));
  }, []);

  const focusWindow = useCallback((id: WindowType) => {
    // 🚀 [보강] 이미 최소화 상태면 최소화도 같이 풀어주는 게 국룰!
    setMaxZIndex(prev => {
      const newZ = prev + 1;
      setWindows(prevWins => ({
        ...prevWins,
        [id]: { ...prevWins[id], zIndex: newZ, isMinimized: false }
      }));
      return newZ;
    });
  }, []);

  const minimizeWindow = useCallback((id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true }
    }));
  }, []);

  const updateWindowScale = useCallback((id: WindowType, scale: Partial<WindowState>) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], ...scale }
    }));
  }, []);

  return { windows, toggleWindow, focusWindow, minimizeWindow, updateWindowScale };
};