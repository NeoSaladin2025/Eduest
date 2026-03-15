'use client';

import React, { useState } from 'react';
import { 
  X, Upload, AlertTriangle, 
  CheckCircle2, Loader2, Image as ImageIcon 
} from 'lucide-react';
import { useProbUpload } from './useProbUpload';

interface ProbUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: {
    id: string;
    title: string;
    count: number;
    prob_folder_id: string;
  } | null;
}

export default function ProbUploadModal({ isOpen, onClose, material }: ProbUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validation, setValidation] = useState<{
    isValid: boolean;
    missingNumbers: number[];
    currentCount: number;
  } | null>(null);

  /**
   * 🛠️ 최적화 업로드 엔진 장착!
   * currentIdx: 현재 몇 번째 파일이 처리 중인지 알려줍니다.
   */
  const { uploadImages, isUploading, uploadProgress, currentIdx, validateFiles } = useProbUpload(
    material?.prob_folder_id || '',
    material?.count || 0
  );

  /**
   * 파일 선택 시 실시간 검증 수행
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFiles(files);
    
    if (material) {
      const result = validateFiles(files);
      setValidation(result);
    }
  };

  /**
   * 최종 업로드 실행
   */
  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    
    // 내부적으로 WebP 변환 및 전송이 진행됩니다.
    const success = await uploadImages(selectedFiles);
    if (success) {
      setSelectedFiles([]);
      setValidation(null);
      onClose(); // 성공 시 모달 닫기
    }
  };

  if (!isOpen || !material) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* 📋 헤더 영역 */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <ImageIcon className="text-indigo-500" /> 문제 이미지 등록
            </h3>
            <p className="text-sm font-bold text-slate-400 mt-1">{material.title} (총 {material.count}문항)</p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isUploading}
            className="p-3 hover:bg-white rounded-2xl transition-colors text-slate-300 hover:text-slate-600 disabled:opacity-30"
          >
            <X size={24} />
          </button>
        </div>

        {/* 📥 바디 영역 */}
        <div className="p-8 space-y-6">
          
          {/* 드롭존 / 파일 선택 */}
          <div className="relative">
            <input 
              type="file" 
              multiple 
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={isUploading}
            />
            <div className={`
              border-4 border-dashed rounded-[32px] p-10 transition-all flex flex-col items-center justify-center gap-4
              ${selectedFiles.length > 0 ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100 bg-white hover:border-indigo-100 hover:bg-indigo-50/30'}
              ${isUploading ? 'opacity-50 grayscale' : ''}
            `}>
              <div className={`p-4 rounded-2xl ${selectedFiles.length > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="font-black text-slate-700">이미지 파일을 선택하거나 끌어다 놔!</p>
                <p className="text-xs font-bold text-slate-400 mt-1">파일명에 포함된 숫자로 번호를 인식해 ❤️</p>
              </div>
            </div>
          </div>

          {/* 🔍 검증 리포트 (우리 자기의 지존급 센스) */}
          {validation && !isUploading && (
            <div className={`p-6 rounded-3xl border-2 animate-in slide-in-from-top-2 ${validation.isValid ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-100 bg-amber-50/50'}`}>
              <div className="flex items-start gap-4">
                {validation.isValid ? (
                  <CheckCircle2 className="text-emerald-500 mt-1" size={24} />
                ) : (
                  <AlertTriangle className="text-amber-500 mt-1" size={24} />
                )}
                <div className="flex-1">
                  <p className={`font-black ${validation.isValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {validation.isValid ? '완벽해! 모든 번호가 준비됐어.' : '잠깐! 확인이 필요해.'}
                  </p>
                  <p className="text-sm font-bold text-slate-500 mt-1">
                    현재 선택: {selectedFiles.length}개 / 목표: {material.count}개
                  </p>
                  
                  {validation.missingNumbers.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-xs font-black text-amber-600 w-full">누락된 번호:</span>
                      {validation.missingNumbers.map(num => (
                        <span key={num} className="px-3 py-1 bg-white border border-amber-200 rounded-lg text-xs font-black text-amber-500">
                          {num}번
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ⚡ 실시간 업로드 에너지바 */}
          {isUploading && (
            <div className="space-y-4 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 animate-in fade-in">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-sm font-black text-indigo-600 flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> 
                    이미지 최적화 및 전송 중...
                  </p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Processing: {currentIdx} / {selectedFiles.length}
                  </p>
                </div>
                <p className="text-2xl font-black text-indigo-600">{uploadProgress}%</p>
              </div>
              <div className="h-4 bg-white rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300 ease-out shadow-lg"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-center font-bold text-indigo-400 animate-pulse">
                화질은 선명하게, 용량은 가볍게 줄이고 있어 ✨
              </p>
            </div>
          )}
        </div>

        {/* 🏁 푸터 영역 */}
        <div className="p-8 bg-slate-50/50 flex gap-3">
          <button 
            onClick={onClose}
            disabled={isUploading}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black hover:bg-slate-100 transition-all disabled:opacity-30"
          >
            취소
          </button>
          <button 
            disabled={!validation?.isValid || isUploading || selectedFiles.length === 0}
            onClick={handleUpload}
            className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <> <Loader2 className="animate-spin" size={20} /> 업로드 중... </>
            ) : (
              '구글 드라이브에 저장하기'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}