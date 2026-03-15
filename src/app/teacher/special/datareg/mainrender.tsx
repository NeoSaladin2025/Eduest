'use client';

import React, { useState } from 'react';
import { 
  PlusCircle, RefreshCw, CheckCircle, 
  ListVideo, FolderOpen, AlertCircle, Database, 
  Trash2, ImagePlus, FileCode 
} from 'lucide-react';

// ✅ 로직 및 타입 임포트
import { useDataRegLogic, type Material } from './mainlogic';
// ✅ 하위 폴더에 있는 예쁜 모달 컴포넌트들 임포트
import ProbUploadModal from './upload-problem/ProbUploadModal';
import SolUploadModal from './upload-solution/SolUploadModal'; // 🔥 새로 만든 해설 모달 추가!

export default function DataRegMain() {
  const {
    title, setTitle, count, setCount, materials,
    isSaving, isLoading, accessToken, login, handleSave, handleDelete, loadMaterials
  } = useDataRegLogic();

  /**
   * 📂 모달 제어 상태
   * isProbModalOpen: 문제 업로드 모달 제어
   * isSolModalOpen: 해설 업로드 모달 제어
   * selectedMaterial: 선택된 현재 자료 정보
   */
  const [isProbModalOpen, setIsProbModalOpen] = useState(false);
  const [isSolModalOpen, setIsSolModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  /**
   * 문제 등록 버튼 클릭 시 호출
   */
  const handleProbClick = (m: Material) => {
    setSelectedMaterial(m);
    setIsProbModalOpen(true);
  };

  /**
   * 🔥 해설 등록 버튼 클릭 시 호출
   * 이제 슬픈 alert 대신, 우리가 만든 스마트 모달을 열어줍니다!
   */
  const handleSolClick = (m: Material) => {
    setSelectedMaterial(m);
    setIsSolModalOpen(true);
  };

  return (
    <div className="flex h-full min-h-[600px] bg-white overflow-hidden rounded-[48px] shadow-sm border border-slate-100 relative">
      <script src="https://accounts.google.com/gsi/client" async defer></script>

      {/* 👈 왼쪽: 자료 입력 섹션 */}
      <div className="w-[400px] border-r border-slate-100 p-10 bg-slate-50/50">
        <div className="flex items-center gap-3 mb-10 text-indigo-600">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
            <PlusCircle size={24} />
          </div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">새 자료 등록</h3>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">자료 이름</label>
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="예: 월요일 1교시 기출" 
              className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">문항 수</label>
            <input 
              type="number" 
              value={count} 
              onChange={(e) => setCount(e.target.value)} 
              placeholder="숫자만 입력" 
              className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all" 
            />
          </div>

          <div className="pt-4">
            {!accessToken ? (
              <button 
                onClick={() => login()} 
                className="w-full py-5 bg-amber-500 text-white rounded-[24px] font-black shadow-lg shadow-amber-200 hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Database size={20} /> 구글 계정 연결하기
              </button>
            ) : (
              <button 
                onClick={handleSave} 
                disabled={isSaving} 
                className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSaving ? <RefreshCw className="animate-spin" /> : <CheckCircle size={20} />}
                {isSaving ? '폴더 생성 중...' : '자료 만들기'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 👉 오른쪽: 보관함 리스트 섹션 */}
      <div className="flex-1 bg-white p-10 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <ListVideo className="text-slate-400" size={24} />
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">수업 자료 보관함</h3>
          </div>
          
          <button 
            onClick={() => loadMaterials()} 
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 active:scale-95 transition-all shadow-sm group"
          >
            <RefreshCw size={18} className={`${isLoading ? 'animate-spin' : ''} text-slate-400 group-hover:text-indigo-500`} />
            목록 불러오기
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {materials.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-slate-100 rounded-[40px] bg-slate-50/30">
              <AlertCircle size={48} className="text-slate-200 mb-4" />
              <p className="text-slate-400 font-bold italic">목록 불러오기를 눌러 자료를 확인하세요</p>
            </div>
          ) : (
            materials.map((m: Material) => (
              <div 
                key={m.id} 
                className="group flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[35px] hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                    <FolderOpen size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-700 text-lg group-hover:text-slate-900 transition-colors">{m.title}</h4>
                    <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-tight">
                      {m.count} Problems • {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleProbClick(m)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-black hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-95"
                  >
                    <ImagePlus size={14} /> 문제등록
                  </button>

                  {/* 🔥 [수정] 해설등록 버튼에 함수 연결! */}
                  <button 
                    onClick={() => handleSolClick(m)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-black hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-95"
                  >
                    <FileCode size={14} /> 해설등록
                  </button>

                  <button 
                    onClick={() => handleDelete(m)}
                    className="p-3 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 🏁 [가장 중요] 모달들 배치 */}
      
      {/* 1. 문제 이미지 업로드 모달 */}
      <ProbUploadModal 
        isOpen={isProbModalOpen} 
        onClose={() => setIsProbModalOpen(false)} 
        material={selectedMaterial} 
      />

      {/* 🔥 2. 해설 HTML 일괄 넘버링 등록 모달 (새로 추가!) */}
      <SolUploadModal 
        isOpen={isSolModalOpen} 
        onClose={() => setIsSolModalOpen(false)} 
        material={selectedMaterial} 
      />
    </div>
  );
}