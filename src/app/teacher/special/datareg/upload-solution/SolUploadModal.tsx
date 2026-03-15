'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, FileCode, CheckCircle2, 
  Loader2, Upload, Info, AlertCircle 
} from 'lucide-react';
// 우리가 방금 만든 useSolUpload 훅 임포트
import { useSolUpload } from './useSolUpload'; 

interface SolUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: {
    id: string;
    title: string;
    count: number;
    sol_folder_id: string;
  } | null;
}

export default function SolUploadModal({ isOpen, onClose, material }: SolUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [startNumber, setStartNumber] = useState<number>(1);
  const [showConfirm, setShowConfirm] = useState(false);

  // 🛠️ 해설 전용 업로드 엔진 (HTML 처리 및 넘버링 로직 포함)
  const { uploadSolutions, isUploading, uploadProgress } = useSolUpload(
    material?.sol_folder_id || '',
    material?.count || 0
  );

  // 파일 선택 시 HTML만 필터링 (순정 유지!)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const htmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.html'));
    
    if (files.length > 0 && htmlFiles.length === 0) {
      alert("해설은 HTML 파일만 등록 가능합니다! ⚠️");
    }
    setSelectedFiles(htmlFiles);
  };

  // 모달이 닫히거나 열릴 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles([]);
      setStartNumber(1);
      setShowConfirm(false);
    }
  }, [isOpen]);

  // 최종 업로드 실행
  const handleExecute = async () => {
    const success = await uploadSolutions(selectedFiles, startNumber);
    if (success) {
      alert("모든 해설이 성공적으로 등록되었습니다! ✨");
      onClose();
    }
  };

  if (!isOpen || !material) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* 📋 헤더 섹션 */}
        <div className="p-8 border-b border-emerald-50 flex items-center justify-between bg-emerald-50/30">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <FileCode className="text-emerald-500" /> 해설 일괄 넘버링 등록
            </h3>
            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-tighter">
              대상 자료: {material.title}
            </p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isUploading}
            className="p-3 hover:bg-white rounded-2xl transition-colors text-slate-300 hover:text-slate-600 disabled:opacity-30"
          >
            <X size={24} />
          </button>
        </div>

        {/* 📥 메인 바디 */}
        <div className="p-8 space-y-6">
          
          {/* 1. 시작 번호 입력 (유저 편의성 핵심!) */}
          <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 mb-3">
              <Info size={16} className="text-indigo-500" />
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">시작 문항 번호 설정</label>
            </div>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 font-black text-2xl text-emerald-600 focus:border-emerald-500 outline-none transition-all"
              />
              <div className="px-6 py-4 bg-emerald-500 text-white rounded-2xl font-black shadow-lg shadow-emerald-100">
                {startNumber}번부터~
              </div>
            </div>
          </div>

          {/* 2. 드래그 앤 드롭 업로드 영역 */}
          <div className="relative group">
            <input 
              type="file" 
              multiple 
              accept=".html" 
              onChange={handleFileChange} 
              disabled={isUploading || showConfirm}
              className="absolute inset-0 opacity-0 cursor-pointer z-10" 
            />
            <div className={`
              border-4 border-dashed rounded-[32px] p-10 transition-all flex flex-col items-center justify-center gap-4
              ${selectedFiles.length > 0 ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-indigo-100 hover:bg-indigo-50/30'}
              ${showConfirm ? 'opacity-50 pointer-events-none' : ''}
            `}>
              <div className={`p-4 rounded-2xl ${selectedFiles.length > 0 ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="font-black text-slate-700">HTML 해설 파일들을 선택해!</p>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {selectedFiles.length > 0 ? `현재 ${selectedFiles.length}개의 파일 선택됨` : '파일 이름에 상관없이 번호순으로 정렬돼 ❤️'}
                </p>
              </div>
            </div>
          </div>

          {/* 🚨 3. 오타 방지용 최종 컨펌 섹션 */}
          {showConfirm && !isUploading && (
            <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-[32px] animate-in slide-in-from-top-4">
              <div className="flex gap-4">
                <AlertCircle className="text-amber-500 shrink-0" size={24} />
                <div>
                  <p className="font-black text-amber-900 text-lg">최종 확인!</p>
                  <p className="text-sm font-bold text-amber-700 mt-1 leading-relaxed">
                    선택한 <span className="underline">{selectedFiles.length}개</span>의 파일을<br />
                    <span className="text-lg font-black text-amber-900">sol_{startNumber.toString().padStart(4, '0')}.html</span> 부터 순서대로<br />
                    번호를 매겨서 올릴게. 맞지?
                  </p>
                  <div className="mt-5 flex gap-2">
                    <button 
                      onClick={handleExecute}
                      className="px-8 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all active:scale-95"
                    >
                      응! 올려줘
                    </button>
                    <button 
                      onClick={() => setShowConfirm(false)}
                      className="px-8 py-3 bg-white text-amber-500 border border-amber-200 rounded-2xl font-black text-sm hover:bg-white transition-all active:scale-95"
                    >
                      아니, 수정할래
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ⚡ 업로드 프로그레스 */}
          {isUploading && (
            <div className="space-y-4 p-6 bg-emerald-50 rounded-[32px] border border-emerald-100 animate-in fade-in">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin text-emerald-600" size={20} />
                  <span className="font-black text-emerald-700">구글 드라이브로 전송 중...</span>
                </div>
                <span className="text-2xl font-black text-emerald-600">{uploadProgress}%</span>
              </div>
              <div className="h-4 bg-white rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }} 
                />
              </div>
            </div>
          )}
        </div>

        {/* 🏁 푸터 버튼 */}
        <div className="p-8 bg-slate-50/50 flex gap-3">
          <button 
            onClick={onClose}
            disabled={isUploading}
            className="flex-1 py-5 bg-white border border-slate-200 text-slate-400 rounded-3xl font-black hover:bg-slate-100 transition-all disabled:opacity-30"
          >
            취소
          </button>
          <button 
            disabled={selectedFiles.length === 0 || isUploading || showConfirm}
            onClick={() => setShowConfirm(true)}
            className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl shadow-slate-200 hover:bg-emerald-600 transition-all active:scale-95 disabled:bg-slate-200 disabled:shadow-none"
          >
            {isUploading ? '업로드 진행 중' : '검토 후 일괄 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}