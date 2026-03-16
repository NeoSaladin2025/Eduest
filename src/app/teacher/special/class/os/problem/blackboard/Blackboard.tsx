'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pencil, Zap, Trash2, ClipboardPaste, Move, Highlighter } from 'lucide-react'; // Highlighter 아이콘 추가

interface Props {
  pastedImage?: string | null;
}

interface FloatingImage {
  id: number;
  img: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ✍️ 판서 경로 타입 정의
interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  isHighlighter: boolean;
}

export default function Blackboard({ pastedImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [mode, setMode] = useState<'pen' | 'laser' | 'select' | 'highlighter'>('pen'); 
  const [color, setColor] = useState('#ef4444'); 
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [images, setImages] = useState<FloatingImage[]>([]);
  const [paths, setPaths] = useState<DrawPath[]>([]); // 💾 판서 기록 저장소
  const [selectedImgId, setSelectedImgId] = useState<number | null>(null);
  const [isDraggingImg, setIsDraggingImg] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const laserPaths = useRef<{x: number, y: number, t: number}[]>([]);

  // 🎨 통합 리렌더링 시스템 (이미지 + 모든 판서 기록)
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. 이미지들 먼저 그리기 (바닥 레이어)
    images.forEach(fImg => {
      ctx.drawImage(fImg.img, fImg.x, fImg.y, fImg.w, fImg.h);
      if (selectedImgId === fImg.id) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(fImg.x - 2, fImg.y - 2, fImg.w + 4, fImg.h + 4);
      }
    });

    // 2. 저장된 모든 판서 경로 다시 그리기 (위 레이어)
    paths.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.isHighlighter ? 20 : 3; // 형광펜은 굵게!
      ctx.globalAlpha = path.isHighlighter ? 0.35 : 1.0; // 형광펜 투명도 설정
      
      path.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    ctx.globalAlpha = 1.0; // 그리기 끝나면 투명도 원복
  }, [images, selectedImgId, paths]);

  useEffect(() => { redrawAll(); }, [redrawAll]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const lCanvas = laserRef.current;
    const parent = containerRef.current;
    if (!canvas || !lCanvas || !parent) return;
    canvas.width = lCanvas.width = parent.clientWidth;
    canvas.height = lCanvas.height = parent.clientHeight;
    redrawAll();
  }, [redrawAll]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    
    const lCanvas = laserRef.current;
    const lCtx = lCanvas?.getContext('2d');
    let animFrame: number;
    const animateLaser = () => {
      if (lCtx && lCanvas) {
        lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        const now = Date.now();
        laserPaths.current = laserPaths.current.filter(p => now - p.t < 800);
        laserPaths.current.forEach((p, i) => {
          lCtx.beginPath();
          lCtx.lineWidth = 8;
          lCtx.strokeStyle = '#facc15';
          lCtx.globalAlpha = (1 - (now - p.t) / 800) * 0.6;
          if (i === 0) lCtx.moveTo(p.x, p.y);
          else lCtx.lineTo(p.x, p.y);
          lCtx.stroke();
        });
        lCtx.globalAlpha = 1;
      }
      animFrame = requestAnimationFrame(animateLaser);
    };
    animFrame = requestAnimationFrame(animateLaser);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animFrame); };
  }, [resize]);

  const handlePasteAction = useCallback(() => {
    if (!pastedImage) return alert("캡처본이 없어, 자기야! ✨");
    const img = new Image();
    img.onload = () => {
      const newImg: FloatingImage = {
        id: Date.now(),
        img,
        x: 100, y: 100,
        w: img.width * 0.5,
        h: img.height * 0.5
      };
      setImages(prev => [...prev, newImg]);
      setMode('select');
    };
    img.src = pastedImage;
  }, [pastedImage]);

  const getCoords = (e: any) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.clientX || e.touches?.[0].clientX;
    const clientY = e.clientY || e.touches?.[0].clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    const { x, y } = getCoords(e);
    
    if (mode === 'select') {
      const clickedImg = [...images].reverse().find(img => 
        x >= img.x && x <= img.x + img.w && y >= img.y && y <= img.y + img.h
      );
      if (clickedImg) {
        setSelectedImgId(clickedImg.id);
        setIsDraggingImg(true);
        dragOffset.current = { x: x - clickedImg.x, y: y - clickedImg.y };
        return;
      }
      setSelectedImgId(null);
    }

    setIsDrawing(true);
    if (mode === 'pen' || mode === 'highlighter') {
      // 새 경로 시작
      const newPath: DrawPath = {
        points: [{ x, y }],
        color: color,
        isHighlighter: mode === 'highlighter'
      };
      setPaths(prev => [...prev, newPath]);
    }
  };

  const draw = (e: any) => {
    const { x, y } = getCoords(e);

    if (isDraggingImg && selectedImgId !== null) {
      setImages(prev => prev.map(img => 
        img.id === selectedImgId 
          ? { ...img, x: x - dragOffset.current.x, y: y - dragOffset.current.y } 
          : img
      ));
      return;
    }

    if (mode === 'laser') { if (isDrawing) laserPaths.current.push({ x, y, t: Date.now() }); return; }
    if (!isDrawing) return;
    
    if (mode === 'pen' || mode === 'highlighter') {
      setPaths(prev => {
        const lastPath = prev[prev.length - 1];
        const updatedLastPath = {
          ...lastPath,
          points: [...lastPath.points, { x, y }]
        };
        return [...prev.slice(0, -1), updatedLastPath];
      });
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setIsDraggingImg(false);
  };

  const clearCanvas = () => {
    setImages([]);
    setPaths([]); // 판서도 싹 지우기
    laserPaths.current = [];
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#1e293b] overflow-hidden">
      
      {/* 🛠️ 업그레이드 툴바 */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 bg-slate-900/90 backdrop-blur-xl rounded-[24px] border border-white/10 z-30 shadow-2xl pointer-events-auto">
        <button onClick={handlePasteAction} title="이미지 붙여넣기" className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"><ClipboardPaste size={20} /></button>
        
        <div className="w-[1px] h-6 bg-white/10 mx-1" />

        <div className="flex bg-white/5 p-1 rounded-xl gap-1">
          <button onClick={() => setMode('pen')} title="일반 펜" className={`p-2 rounded-lg ${mode === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Pencil size={20}/></button>
          <button onClick={() => setMode('highlighter')} title="형광펜" className={`p-2 rounded-lg ${mode === 'highlighter' ? 'bg-yellow-500/80 text-white' : 'text-slate-400'}`}><Highlighter size={20}/></button>
          <button onClick={() => setMode('laser')} title="레이저 포인터" className={`p-2 rounded-lg ${mode === 'laser' ? 'bg-orange-500 text-white' : 'text-slate-400'}`}><Zap size={20}/></button>
          <button onClick={() => setMode('select')} title="이미지 이동" className={`p-2 rounded-lg ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Move size={20}/></button>
        </div>

        <div className="flex gap-2">
          {['#ef4444', '#3b82f6', '#22c55e', '#facc15'].map(c => (
            <button key={c} onClick={() => { setColor(c); if(mode==='select' || mode==='laser') setMode('pen'); }} className={`w-8 h-8 rounded-full border-2 ${color === c && (mode === 'pen' || mode === 'highlighter') ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
          ))}
        </div>

        <button onClick={clearCanvas} title="전체 지우기" className="p-2 text-slate-400 hover:text-rose-400"><Trash2 size={20}/></button>
      </div>

      <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} className={`absolute inset-0 z-10 touch-none ${mode === 'select' ? 'cursor-move' : 'cursor-crosshair'}`} />
      <canvas ref={laserRef} className="absolute inset-0 z-20 pointer-events-none" />
    </div>
  );
}