'use client';

import { useState, useCallback } from 'react';

// ✅ 1. 'blackboard'를 공식 타입 명단에 추가 (이게 없어서 에러나는 거야!)
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
  
  // ✅ 2. 초기 윈도우 객체들 설정 (여기에 'blackboard' 데이터가 들어있어야 함)
  const [windows, setWindows] = useState<Record<WindowType, WindowState>>({
    cartridge: { id: 'cartridge', title: 'Cartridge Library', isOpen: true, isMinimized: false, zIndex: 1, x: 50, y: 50, width: 400, height: 500 },
    problem: { id: 'problem', title: 'Problem Launcher', isOpen: false, isMinimized: false, zIndex: 2, x: 470, y: 50, width: 400, height: 500 },
    monitor: { id: 'monitor', title: 'Problem Viewer', isOpen: false, isMinimized: false, zIndex: 3, x: 50, y: 50, width: 600, height: 700 },
    solution: { id: 'solution', title: 'Solution Viewer', isOpen: false, isMinimized: false, zIndex: 4, x: 700, y: 50, width: 600, height: 700 },
    blackboard: { id: 'blackboard', title: 'Blackboard', isOpen: false, isMinimized: false, zIndex: 5, x: 1350, y: 50, width: 500, height: 700 },
  });

  const toggleWindow = useCallback((id: WindowType) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: !prev[id].isOpen, isMinimized: false }
    }));
  }, []);

  const focusWindow = useCallback((id: WindowType) => {
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