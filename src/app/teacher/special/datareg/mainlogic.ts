'use client';

import { useState, useCallback } from 'react';

// ✅ 자료 타입 정의 (기존 유지)
export interface Material {
  id: string;
  title: string;
  count: number;
  main_folder_id: string;
  prob_folder_id: string;
  sol_folder_id: string;
  note_folder_id: string;
  created_at: string;
}

// 🔥 [업데이트] 방금 배포한 최종 GAS URL 적용!
const GAS_URL = "https://script.google.com/macros/s/AKfycbzRXwdja0xFm9wKcTG0asR5cv2mmhUDLK_S9j1VgtCcI37Dqw228mNrwNm74yzfyS05GA/exec";
const API_KEY = "eduest_super_secret_key_1234";

export const useDataRegLogic = () => {
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 📂 [GAS] 자료 목록 로드 (metadata.json 조회)
   */
  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    try {
      // 🚀 헤더를 최소화하여 CORS 사전 검사(OPTIONS)를 우회합니다.
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          apiKey: API_KEY,
          action: "fetch_metadata"
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 결과가 성공이면 자료 목록 세팅
        setMaterials(result.materials || []);
      } else {
        console.error("데이터 로드 실패:", result.error);
        alert(`장부 로드 실패: ${result.error}`);
      }
    } catch (error) {
      console.error("네트워크 에러:", error);
      alert("GAS 서버와 통신할 수 없습니다. URL 및 배포 설정을 확인해주세요!");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 🚀 [GAS] 자료 만들기 (폴더 4개 생성 + metadata.json 업데이트)
   */
  const handleSave = async () => {
    if (!title || !count) return alert('빈칸 채워줘! ❤️');

    setIsSaving(true);
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          apiKey: API_KEY,
          action: "create_material_set",
          title: title,
          count: count
        })
      });
      
      const result = await response.json();

      if (result.success) {
        setTitle(''); 
        setCount('');
        // 새로 생성된 항목을 리스트 최상단에 추가
        setMaterials(prev => [result.material, ...prev]);
        alert('구글 드라이브 세팅 완료! ✨ 이제 문제를 등록해보세요.');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      alert(`등록 에러: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 🗑️ [GAS] 자료 삭제 (폴더 휴지통 이동 + metadata.json에서 제거)
   */
  const handleDelete = async (material: Material) => {
    if (!confirm(`'${material.title}' 자료를 삭제할까?`)) return;

    setIsLoading(true);
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          apiKey: API_KEY,
          action: "delete_material",
          mainFolderId: material.main_folder_id,
          materialId: material.id
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMaterials(prev => prev.filter(m => m.id !== material.id));
        alert('삭제 완료! ✨');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      alert('삭제 중 문제가 생겼어.');
    } finally {
      setIsLoading(false);
    }
  };

  return { 
    title, setTitle, count, setCount, materials, 
    isSaving, isLoading, 
    handleSave, handleDelete, loadMaterials 
  };
};