'use client';

import { useState, useCallback } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

// ✅ 자료 등록(Material) 규격
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

export const useCartridge = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<Material | null>(null);

  // ✅ 구글 드라이브 연동 도구
  const { login, fetchMetadata, accessToken } = useGoogleDrive();

  /**
   * 📂 [수동 데이터 로드 엔진]
   * 이제 이 함수는 사용자가 직접 '새로고침'이나 '로드' 버튼을 눌러야만 실행됨!
   */
  const loadPacks = useCallback(async () => {
    // 이미 로딩 중이면 중복 실행 방지
    if (isLoading) return;

    setIsLoading(true);
    try {
      let token = accessToken;
      
      // 1. 토큰이 없다면 구글 로그인 호출
      if (!token) {
        console.log("🔑 [OS 엔진] 사용 요청에 따라 구글 인증을 시작합니다...");
        token = await login();
      }

      // 2. 토큰 확보 시 장부(metadata.json) 긁어오기
      if (token) {
        console.log("🎮 [OS 엔진] 사용자가 요청한 카트리지 목록을 동기화합니다...");
        const data = await fetchMetadata(token);
        
        if (Array.isArray(data)) {
          setMaterials(data);
          console.log("✅ 동기화 완료:", data);
        } else {
          console.warn("⚠️ 데이터 형식이 올바르지 않습니다.");
          setMaterials([]);
        }
      }
    } catch (error: any) {
      console.error("❌ 팩 로드 중 에러 발생:", error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, login, fetchMetadata, isLoading]);

  // 🕹️ 팩 선택(삽입) 함수
  const insertPack = (pack: Material) => {
    setSelectedPack(pack);
    console.log(`🕹️ [${pack.title}] 카트리지 삽입됨!`);
  };

  // ✅ [중요] 기존에 있던 useEffect(자동 실행)를 아예 삭제함!

  return { 
    materials, 
    isLoading, 
    selectedPack, 
    insertPack, 
    refreshPacks: loadPacks // 이제 UI에서 이 함수를 버튼에 연결하면 끝!
  };
};