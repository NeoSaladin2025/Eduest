'use client';

import React, { useEffect } from 'react';
import EduOSContainer from './EduOSContainer';

export default function FullscreenOSPage() {
  // 진입 시 브라우저 타이틀 변경 (디테일!)
  useEffect(() => {
    document.title = "Eduest Class OS - 수업 모드";
  }, []);

  return (
    // w-screen, h-screen으로 브라우저 공간을 1px도 남김없이 점령!
    <div className="w-screen h-screen bg-slate-950 overflow-hidden">
      <EduOSContainer />
    </div>
  );
}