'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pencil, Zap, Trash2, ClipboardPaste, Move } from 'lucide-react';

interface Props {
  pastedImage?: string | null;
}

// 🖼️ 이미지 객체 타입 정의
interface FloatingImage {
  id: number;
  img: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function Blackboard({ pastedImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [mode, setMode] = useState<'pen' | 'laser' | 'select'>('pen'); // 'select' 모드 추가
  const [color, setColor] = useState('#ef4444'); 
  const [isDrawing, setIsDrawing] = useState(false);
  
  // 💾 이미지 객체들 관리
  const [images, setImages] = useState<FloatingImage[]>([]);
  const [selectedImgId, setSelectedImgId] = useState<number | null>(null);
  const [isDraggingImg, setIsDraggingImg] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const laserPaths = useRef<{x: number, y: number, t: number}[]>([]);

  // 1. 초기화 및 리사이즈
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const lCanvas = laserRef.current;
    const parent = containerRef.current;
    if (!canvas || !lCanvas || !parent) return;
    canvas.width = lCanvas.width = parent.clientWidth;
    canvas.height = lCanvas.height = parent.clientHeight;
    redrawAll(); // 리사이즈 시 다시 그리기
  }, [images]); // 이미지 상태가 바뀔 때마다 리사이즈 로직 대응

  // 🎨 모든 것을 다시 그리는 핵심 함수 (이미지 + 판서 동기화)
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. 이미지들 먼저 그리기
    images.forEach(fImg => {
      ctx.drawImage(fImg.img, fImg.x, fImg.y, fImg.w, fImg.h);
      if (selectedImgId === fImg.id) {
        // 선택된 이미지 강조 표시
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(fImg.x - 2, fImg.y - 2, fImg.w + 4, fImg.h + 4);
        // 모서리 리사이즈 핸들 (우측 하단)
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(fImg.x + fImg.w - 5, fImg.y + fImg.h - 5, 10, 10);
      }
    });
  }, [images, selectedImgId]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    
    // 레이저 애니메이션 (기존과 동일)
    const lCanvas = laserRef.current;
    const lCtx = lCanvas?.getContext('2d');
    let animFrame: number;
    const animateLaser = () => {
      if (lCtx && lCanvas) {
        lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        lCtx.globalCompositeOperation = 'lighter';
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
        lCtx.globalCompositeOperation = 'source-over';
      }
      animFrame = requestAnimationFrame(animateLaser);
    };
    animFrame = requestAnimationFrame(animateLaser);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animFrame); };
  }, [resize]);

  // 🚀 이미지 붙여넣기 (객체로 등록)
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
      setMode('select'); // 붙여넣으면 바로 선택 모드로!
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

  // 👆 클릭 시작
  const startDrawing = (e: any) => {
    const { x, y } = getCoords(e);
    
    if (mode === 'select') {
      // 이미지 클릭 체크 (역순으로 체크해서 위에 있는 거 먼저)
      const clickedImg = [...images].reverse().find(img => 
        x >= img.x && x <= img.x + img.w && y >= img.y && y <= img.y + img.h
      );

      if (clickedImg) {
        setSelectedImgId(clickedImg.id);
        setIsDraggingImg(true);
        dragOffset.current = { x: x - clickedImg.x, y: y - clickedImg.y };
        return;
      } else {
        setSelectedImgId(null);
      }
    }

    setIsDrawing(true);
    if (mode === 'pen') {
      const ctx = canvasRef.current?.getContext('2d');
      ctx?.beginPath();
      ctx?.moveTo(x, y);
    }
  };

  // 🖱️ 움직일 때
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
    
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && mode === 'pen') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setIsDraggingImg(false);
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setImages([]);
    laserPaths.current = [];
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#1e293b] overflow-hidden">
      
      {/* 🛠️ 지존급 툴바 */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 bg-slate-900/90 backdrop-blur-xl rounded-[24px] border border-white/10 z-30 shadow-2xl pointer-events-auto">
        <button onClick={handlePasteAction} className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"><ClipboardPaste size={20} /></button>
        
        <div className="w-[1px] h-6 bg-white/10 mx-1" />

        <div className="flex bg-white/5 p-1 rounded-xl gap-1">
          <button onClick={() => setMode('pen')} className={`p-2 rounded-lg ${mode === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Pencil size={20}/></button>
          <button onClick={() => setMode('laser')} className={`p-2 rounded-lg ${mode === 'laser' ? 'bg-yellow-500 text-white' : 'text-slate-400'}`}><Zap size={20}/></button>
          <button onClick={() => setMode('select')} className={`p-2 rounded-lg ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Move size={20}/></button>
        </div>

        <div className="flex gap-2">
          {['#ef4444', '#3b82f6', '#22c55e'].map(c => (
            <button key={c} onClick={() => { setColor(c); setMode('pen'); }} className={`w-8 h-8 rounded-full border-2 ${color === c && mode === 'pen' ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
          ))}
        </div>

        <button onClick={clearCanvas} className="p-2 text-slate-400 hover:text-rose-400"><Trash2 size={20}/></button>
      </div>

      <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} className={`absolute inset-0 z-10 touch-none ${mode === 'select' ? 'cursor-move' : 'cursor-crosshair'}`} />
      <canvas ref={laserRef} className="absolute inset-0 z-20 pointer-events-none" />
    </div>
  );
}