'use client';

import React, { useMemo } from 'react';
import { FileText, AlertCircle } from 'lucide-react';

interface Props {
  sourceData: string | null; // 엔진에서 읽어온 HTML 텍스트 데이터
}

export default function SolutionViewer({ sourceData }: Props) {
  
  // 💡 HTML 내용이 바뀔 때만 iframe을 새로 그리도록 메모이제이션
  const content = useMemo(() => {
    if (!sourceData) return null;
    return sourceData;
  }, [sourceData]);

  // 1️⃣ 해설 데이터가 없을 때
  if (!content) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-3">
        <AlertCircle size={48} className="opacity-20" />
        <p className="text-sm font-bold uppercase tracking-widest">No Solution Data</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* 상단 작은 안내바 (옵션) */}
      <div className="h-8 bg-slate-100/50 border-b border-slate-200 flex items-center px-4 gap-2 shrink-0">
        <FileText size={12} className="text-slate-400" />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
          HTML Document Viewer
        </span>
      </div>

      {/* 🌐 HTML 렌더링 핵심 영역 */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        <iframe
          srcDoc={content} // 엔진에서 가져온 HTML 소스를 그대로 주입!
          title="Solution Viewer"
          className="w-full h-full border-none bg-white"
          // 보안 설정: 스크립트 허용 및 같은 출처 정책 허용
          sandbox="allow-scripts allow-same-origin"
          // iframe 내부의 스크롤바 스타일을 위해 스타일 속성 추가 가능
          style={{ display: 'block' }}
        />
      </div>

      {/* 하단 장식선 */}
      <div className="h-1 bg-indigo-500/20" />
    </div>
  );
}