import { useState } from 'react';

/**
 * @hook useSeasonModule
 * @description 시즌 관리 본체의 탭 상태를 통제하는 로직
 */
export const useSeasonModule = () => {
  // 현재 어떤 탭이 활성화되었는지 관리 (기본값: 01_START)
  const [activeTab, setActiveTab] = useState('01_START');

  // 5대 강령 메뉴판
  const seasonTabs = [
    { id: '01_START', label: '시즌 시작 및 종료', icon: '⚡' },
    { id: '02_POINT', label: '포인트 및 XP 증감', icon: '📈' },
    { id: '03_RANK', label: '티어 및 레벨 관리', icon: '🏆' },
    { id: '04_RULE', label: '일일 규칙 및 배율', icon: '📏' },
    { id: '05_EMBLEM', label: '엠블럼 관리', icon: '🛡️' },
  ] as const;

  return {
    activeTab,
    setActiveTab,
    seasonTabs
  };
};