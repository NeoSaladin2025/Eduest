'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Scissors, ZoomIn, ZoomOut, Copy, Image as ImageIcon } from 'lucide-react';

interface Props {
  // ✅ 이제 URL이 아니라 브라우저에 이미 로드된 이미지 데이터(Base64 또는 Blob URL)를 직접 받아
  sourceData: string | null; 
  onCapture?: (capturedData: string) => void; 
}

export default function ProblemViewer({ sourceData, onCapture }: Props) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // --- 드래그 캡처 로직 ---
  const handleStart = (clientX: number, clientY: number) => {
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;

    setIsSelecting(true);
    const x = (clientX - container.left) / zoom; // 줌 상태 고려한 좌표 계산
    const y = (clientY - container.top) / zoom;
    
    setStartPos({ x, y });
    setRect({ x, y, w: 0, h: 0 });
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isSelecting) return;
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;

    const currentX = (clientX - container.left) / zoom;
    const currentY = (clientY - container.top) / zoom;

    setRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(startPos.x - currentX),
      h: Math.abs(startPos.y - currentY),
    });
  };

  // --- 영역 잘라내기 엔진 ---
  const executeCapture = () => {
    if (!imgRef.current || rect.w < 5) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 실제 이미지 해상도 비율 계산 (원본 화질 유지)
    const scale = imgRef.current.naturalWidth / imgRef.current.width;

    canvas.width = rect.w * scale;
    canvas.height = rect.h * scale;

    ctx.drawImage(
      imgRef.current,
      rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale,
      0, 0, canvas.width, canvas.height
    );

    const capturedBase64 = canvas.toDataURL('image/png');
    if (onCapture) onCapture(capturedBase64);
    
    // 캡처 후 가이드 박스 제거
    setRect({ x: 0, y: 0, w: 0, h: 0 });
  };

  // 데이터가 없을 때의 예외 처리
  if (!sourceData) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
        <ImageIcon size={48} className="mb-4 opacity-20" />
        <p className="font-black italic uppercase tracking-tighter">No Data Loaded</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-200 flex flex-col overflow-hidden select-none">
      {/* 컨트롤 툴바 */}
      <div className="h-10 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-full px-2">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:text-indigo-600"><ZoomOut size={16}/></button>
            <span className="text-[10px] font-black w-12 text-center text-slate-500">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 hover:text-indigo-600"><ZoomIn size={16}/></button>
          </div>
        </div>
        
        {rect.w > 5 && (
          <button 
            onClick={executeCapture}
            className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-2 hover:bg-emerald-500 transition-colors animate-in fade-in slide-in-from-right-2"
          >
            <Copy size={12}/> COPY TO BLACKBOARD
          </button>
        )}
      </div>

      {/* 이미지 캔버스 영역 */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto touch-none relative"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={() => setIsSelecting(false)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={() => setIsSelecting(false)}
      >
        <div 
          style={{ 
            transform: `scale(${zoom})`, 
            transformOrigin: '0 0',
            width: '100%' 
          }}
          className="relative"
        >
          <img 
            ref={imgRef}
            src={sourceData} 
            alt="Problem"
            className="w-full h-auto pointer-events-none"
            onLoad={() => console.log("이미지 로드 완료 (From Memory)")}
          />
          
          {/* 선택 영역 점선 박스 */}
          {rect.w > 0 && (
            <div 
              className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10 pointer-events-none"
              style={{ 
                left: rect.x, 
                top: rect.y, 
                width: rect.w, 
                height: rect.h 
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}