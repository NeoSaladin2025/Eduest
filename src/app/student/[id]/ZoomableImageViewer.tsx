'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface ZoomableImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  resetKey?: string | number; // 문항 변경 시 자동 초기화용 키 (예: question.id 또는 index)
}

export default function ZoomableImageViewer({
  src,
  alt = '문제 이미지',
  className = '',
  containerClassName = '',
  resetKey,
}: ZoomableImageViewerProps) {
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  const touchStartRef = useRef<{
    initialDist: number;
    initialScale: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    initialDist: 0,
    initialScale: 1,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // 1. 문항 변경 시 줌 & 위치 자동 리셋
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, [resetKey, src]);

  // 2. 줌 값 수동 리셋
  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 3. 버튼 줌 인/아웃
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(3.5, Number((prev + 0.3).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.3).toFixed(2)));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // 4. 더블 클릭 (1x -> 2x / >1x -> 1x 토글)
  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2);
    }
  }, [scale, handleReset]);

  // 5. 마우스 휠 줌 (Passive: false 등록으로 페이지 스크롤 방지)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setScale((prev) => {
        const next = Math.min(3.5, Math.max(1, Number((prev + delta).toFixed(2))));
        if (next === 1) {
          setPosition({ x: 0, y: 0 });
        }
        return next;
      });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  // 6. 마우스 드래그 (이동)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 좌클릭만 허용
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    // 최대 이동 범위 제한 (안전 한계선)
    const maxBound = 600 * (scale - 0.5);
    const newX = Math.max(-maxBound, Math.min(maxBound, dragStartRef.current.initialX + dx));
    const newY = Math.max(-maxBound, Math.min(maxBound, dragStartRef.current.initialY + dy));

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (scale === 1) setPosition({ x: 0, y: 0 });
    }
  };

  // 7. 터치 제스처 (모바일/태블릿 핀치 줌 & 드래그)
  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 핀치 줌 시작
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      touchStartRef.current.initialDist = dist;
      touchStartRef.current.initialScale = scale;
    } else if (e.touches.length === 1) {
      // 1손가락 드래그 시작
      const t = e.touches[0];
      touchStartRef.current.startX = t.clientX;
      touchStartRef.current.startY = t.clientY;
      touchStartRef.current.initialX = position.x;
      touchStartRef.current.initialY = position.y;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 핀치 줌 진행
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      if (touchStartRef.current.initialDist > 0) {
        const factor = currentDist / touchStartRef.current.initialDist;
        const newScale = Math.min(3.5, Math.max(1, Number((touchStartRef.current.initialScale * factor).toFixed(2))));
        setScale(newScale);
        if (newScale === 1) setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && scale > 1 && isDragging) {
      // 1손가락 이동 (확대 상태일 때만)
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.startX;
      const dy = t.clientY - touchStartRef.current.startY;

      const maxBound = 600 * (scale - 0.5);
      const newX = Math.max(-maxBound, Math.min(maxBound, touchStartRef.current.initialX + dx));
      const newY = Math.max(-maxBound, Math.min(maxBound, touchStartRef.current.initialY + dy));

      setPosition({ x: newX, y: newY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      touchStartRef.current.initialDist = 0;
      if (scale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      // 핀치 중 손가락 하나 뗐을 때 드래그 시작점으로 갱신
      const t = e.touches[0];
      touchStartRef.current.startX = t.clientX;
      touchStartRef.current.startY = t.clientY;
      touchStartRef.current.initialX = position.x;
      touchStartRef.current.initialY = position.y;
    }
  };

  const isTransformed = scale > 1 || position.x !== 0 || position.y !== 0;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none touch-none ${
        scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
      } ${containerClassName}`}
      title={scale > 1 ? '마우스/손가락으로 드래그하여 이동 · 더블클릭 시 리셋' : '휠/핀치 또는 더블클릭으로 확대'}
    >
      {/* 🌟 플로팅 줌 컨트롤 미니 바 (우측 상단) */}
      <div
        className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-slate-900/80 hover:bg-slate-900/95 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-lg text-white transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* 이동 가능 힌트 아이콘 */}
        {scale > 1 && (
          <span className="text-[10px] text-amber-300 font-bold px-1 hidden sm:inline-flex items-center gap-0.5">
            <Move size={11} /> 드래그 이동
          </span>
        )}

        {/* 줌 아웃 (-) */}
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= 1}
          className="p-1.5 hover:bg-white/15 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
          title="축소 (-)"
        >
          <ZoomOut size={13} />
        </button>

        {/* 배율 표시 (클릭 시 100% 리셋) */}
        <button
          type="button"
          onClick={handleReset}
          className="px-1.5 py-0.5 text-[11px] font-mono font-bold hover:bg-white/15 rounded transition-colors text-slate-200 hover:text-white cursor-pointer"
          title="클릭하여 원본 배율로 리셋"
        >
          {Math.round(scale * 100)}%
        </button>

        {/* 줌 인 (+) */}
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= 3.5}
          className="p-1.5 hover:bg-white/15 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
          title="확대 (+)"
        >
          <ZoomIn size={13} />
        </button>

        {/* 리셋 버튼 (100%가 아닐 때 노출) */}
        {isTransformed && (
          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 bg-violet-600/80 hover:bg-violet-600 text-white rounded-lg transition-all ml-0.5 shadow-xs cursor-pointer"
            title="원본 비율(100%)로 리셋"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* 🌟 줌 & 드래그가 적용되는 실제 이미지 컨테이너 */}
      <div
        className="will-change-transform flex items-center justify-center max-w-full max-h-full"
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl bg-white p-2 pointer-events-none ${className}`}
        />
      </div>
    </div>
  );
}
