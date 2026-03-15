import { useState, useCallback } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive'; 
// ✅ 자기가 만든 업로드 훅/모듈 임포트
import { useProbUpload } from './upload-problem/useProbUpload'; 
// (해설 업로드 모듈도 경로에 맞춰 추가해줘!)

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

export const useDataRegLogic = () => {
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, createFolder, updateMetadata, fetchMetadata, deleteFile, accessToken } = useGoogleDrive();

  /**
   * 📂 [수동 새로고침] 자료 목록 로드
   */
  const loadMaterials = useCallback(async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await login(); 
      } catch (e) {
        return alert("구글 연결이 필요해, 자기야! ❤️");
      }
    }

    setIsLoading(true);
    try {
      const data = await fetchMetadata(token);
      setMaterials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, login, fetchMetadata]);

  /**
   * 🚀 [자료 만들기] 초기 폴더 세팅 및 장부 등록
   */
  const handleSave = async () => {
    if (!title || !count) return alert('빈칸 채워줘! ❤️');

    setIsSaving(true);
    try {
      const token = accessToken || await login();
      const specialFolderId = process.env.NEXT_PUBLIC_GOOGLE_FOLDER_ID!;

      // 1. 구글 드라이브 폴더 계층 생성
      const mainId = await createFolder(title, specialFolderId, token);
      const [probId, solId, noteId] = await Promise.all([
        createFolder('01_Problems', mainId, token),
        createFolder('02_Solutions', mainId, token),
        createFolder('03_MyNotes', mainId, token),
      ]);

      const newEntry: Material = {
        id: Date.now().toString(),
        title,
        count: parseInt(count),
        main_folder_id: mainId,
        prob_folder_id: probId,
        sol_folder_id: solId,
        note_folder_id: noteId,
        created_at: new Date().toISOString(),
      };

      // 2. 메타데이터 JSON 업데이트
      const success = await updateMetadata(newEntry, token);
      
      if (success) {
        setTitle(''); setCount('');
        // 리스트 즉시 반영을 위해 상태 업데이트
        setMaterials(prev => [newEntry, ...prev]);
        alert('구글 드라이브 세팅 완료! ✨');
      }
    } catch (error: any) {
      alert(`등록 에러: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 🗑️ [삭제] 자료 삭제
   */
  const handleDelete = async (material: Material) => {
    if (!confirm(`'${material.title}' 자료를 삭제할까?`)) return;

    setIsLoading(true);
    try {
      const token = accessToken || await login();
      if (deleteFile) await deleteFile(material.main_folder_id, token);

      const updatedList = materials.filter(m => m.id !== material.id);
      const success = await updateMetadata(updatedList, token);
      
      if (success) {
        setMaterials(updatedList);
        alert('삭제 완료! ✨');
      }
    } catch (error) {
      alert('삭제 중 문제가 생겼어.');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ [통합 포인트] 이 부분에 우리가 만든 업로드 훅을 나중에 컴포넌트에서 호출할 수 있게 브릿지를 놔줄 수도 있어!
  // 하지만 컴포넌트(DataRegMain)에서 직접 useProbUpload를 쓰는 게 더 깔끔할 거야.

  return { 
    title, setTitle, count, setCount, materials, 
    isSaving, isLoading, accessToken, login, 
    handleSave, handleDelete, loadMaterials 
  };
};