'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Pencil, Zap, Trash2, ClipboardPaste, Move, Highlighter, Eraser } from 'lucide-react';

interface Props {
  pastedImage?: string | null;
}

interface FloatingImage {
  id: number; img: HTMLImageElement; x: number; y: number; w: number; h: number;
}

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  isHighlighter: boolean;
  isEraser: boolean;
}

export default function Blackboard({ pastedImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [mode, setMode] = useState<'pen' | 'laser' | 'select' | 'highlighter' | 'eraser'>('pen'); 
  const [color, setColor] = useState('#ef4444'); 
  const [isDrawing, setIsDrawing] = useState(false);
  const [images, setImages] = useState<FloatingImage[]>([]);
  const [paths, setPaths] = useState<DrawPath[]>([]); 
  const [selectedImgId, setSelectedImgId] = useState<number | null>(null);
  const [isDraggingImg, setIsDraggingImg] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const laserPaths = useRef<{x: number, y: number, t: number}[]>([]);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || canvas.width === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    images.forEach(fImg => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fImg.img, fImg.x, fImg.y, fImg.w, fImg.h);
      if (selectedImgId === fImg.id) {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
        ctx.strokeRect(fImg.x - 2, fImg.y - 2, fImg.w + 4, fImg.h + 4);
      }
    });

    paths.forEach(path => {
      if (path.points.length < 1) return;
      ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (path.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 40;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.isHighlighter ? 20 : 3;
        ctx.globalAlpha = path.isHighlighter ? 0.35 : 1.0;
      }
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) { ctx.lineTo(path.points[i].x, path.points[i].y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0;
    });
  }, [images, selectedImgId, paths]);

  const forceSyncSize = useCallback(() => {
    const canvas = canvasRef.current;
    const lCanvas = laserRef.current;
    const parent = containerRef.current;
    if (!canvas || !lCanvas || !parent) return;

    // 🚀 [리사이즈 핸들 확보] 부모보다 상하좌우 8px(총 16px) 작게 설정
    const finalW = parent.clientWidth - 16; 
    const finalH = parent.clientHeight - 16;

    if (finalW > 0 && finalH > 0) {
      canvas.width = finalW;
      canvas.height = finalH;
      lCanvas.width = finalW;
      lCanvas.height = finalH;
      redrawAll();
    }
  }, [redrawAll]);

  useLayoutEffect(() => { forceSyncSize(); }, [forceSyncSize]);

  useEffect(() => {
    forceSyncSize();
    const timers = [10, 50, 150, 300, 500].map(ms => setTimeout(forceSyncSize, ms));
    window.addEventListener('resize', forceSyncSize);
    return () => { window.removeEventListener('resize', forceSyncSize); timers.forEach(clearTimeout); };
  }, [forceSyncSize]);

  const handlePaste = useCallback((imgUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const newImg = { id: Date.now(), img, x: 50, y: 50, w: img.width * 0.5, h: img.height * 0.5 };
      setImages(prev => [...prev, newImg]);
      setMode('select');
    };
    img.src = imgUrl;
  }, []);

  useEffect(() => { if (pastedImage) handlePaste(pastedImage); }, [pastedImage, handlePaste]);

  // (레이저 애니메이션 생략 - 이전과 동일)
  useEffect(() => {
    const lCanvas = laserRef.current;
    const lCtx = lCanvas?.getContext('2d');
    let animFrame: number;
    const animateLaser = () => {
      if (lCtx && lCanvas) {
        lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        const now = Date.now();
        laserPaths.current = laserPaths.current.filter(p => now - p.t < 800);
        if (laserPaths.current.length > 1) {
          lCtx.lineCap = 'round'; lCtx.lineJoin = 'round'; lCtx.lineWidth = 10; lCtx.strokeStyle = '#facc15';
          for (let i = 1; i < laserPaths.current.length; i++) {
            const p1 = laserPaths.current[i - 1]; const p2 = laserPaths.current[i];
            const alpha = (1 - (now - p2.t) / 800) * 0.8;
            lCtx.globalAlpha = Math.max(0, alpha);
            lCtx.beginPath(); lCtx.moveTo(p1.x, p1.y); lCtx.lineTo(p2.x, p2.y); lCtx.stroke();
          }
        }
      }
      animFrame = requestAnimationFrame(animateLaser);
    };
    animFrame = requestAnimationFrame(animateLaser);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const getCoords = (e: any) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    const { x, y } = getCoords(e);
    setIsDrawing(true);
    if (mode === 'select') {
      const clickedImg = [...images].reverse().find(img => x >= img.x && x <= img.x + img.w && y >= img.y && y <= img.y + img.h);
      if (clickedImg) { setSelectedImgId(clickedImg.id); setIsDraggingImg(true); dragOffset.current = { x: x - clickedImg.x, y: y - clickedImg.y }; return; }
      setSelectedImgId(null);
    }
    setPaths(prev => [...prev, { points: [{ x, y }], color, isHighlighter: mode === 'highlighter', isEraser: mode === 'eraser' }]);
    if (mode === 'laser') { laserPaths.current = [{ x, y, t: Date.now() }]; }
  };

  const draw = (e: any) => {
    const { x, y } = getCoords(e);
    if (!isDrawing) return;
    if (isDraggingImg && selectedImgId !== null) {
      setImages(prev => prev.map(img => img.id === selectedImgId ? { ...img, x: x - dragOffset.current.x, y: y - dragOffset.current.y } : img));
      return;
    }
    if (mode === 'laser') { laserPaths.current.push({ x, y, t: Date.now() }); return; }
    setPaths(prev => {
      const newPaths = [...prev];
      const last = newPaths[newPaths.length - 1];
      if (last) last.points.push({ x, y });
      return newPaths;
    });
  };

  const stopDrawing = () => { setIsDrawing(false); setIsDraggingImg(false); };
  const clearCanvas = () => { setImages([]); setPaths([]); laserPaths.current = []; redrawAll(); };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#1e293b] overflow-hidden select-none">
      {/* 🛠️ 툴바 - z-index 최상위 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-slate-900/95 backdrop-blur-xl rounded-[20px] border border-white/10 z-[50] shadow-2xl pointer-events-auto shrink-0">
        <button onClick={() => pastedImage && handlePaste(pastedImage)} className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"><ClipboardPaste size={18} /></button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <div className="flex bg-white/5 p-1 rounded-lg gap-0.5">
          <button onClick={() => setMode('pen')} className={`p-2 rounded-md ${mode === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Pencil size={18}/></button>
          <button onClick={() => setMode('highlighter')} className={`p-2 rounded-md ${mode === 'highlighter' ? 'bg-yellow-500 text-white' : 'text-slate-400'}`}><Highlighter size={18}/></button>
          <button onClick={() => setMode('eraser')} className={`p-2 rounded-md ${mode === 'eraser' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}><Eraser size={18}/></button>
          <button onClick={() => setMode('laser')} className={`p-2 rounded-md ${mode === 'laser' ? 'bg-orange-500 text-white' : 'text-slate-400'}`}><Zap size={18}/></button>
          <button onClick={() => setMode('select')} className={`p-2 rounded-md ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Move size={18}/></button>
        </div>
        <button onClick={clearCanvas} className="p-2 text-slate-400 hover:text-rose-400"><Trash2 size={18}/></button>
      </div>

      {/* 🚀 [중요] inset-2 (8px 여백)로 상하좌우 리사이즈 핸들 영역을 완전히 비워줌 */}
      <div className="absolute inset-2 z-10 overflow-hidden">
        <canvas 
          ref={canvasRef} 
          onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} 
          onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
          className="w-full h-full touch-none cursor-crosshair outline-none" 
        />
        <canvas ref={laserRef} className="absolute inset-0 z-20 pointer-events-none" />
      </div>
    </div>
  );
}