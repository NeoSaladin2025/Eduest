'use client';

import { useState, useCallback, useEffect } from 'react';

// ✅ 자료 등록(Material) 규격 (기존 유지)
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

// 🔥 [업데이트] 최종 GAS 설정 정보
const GAS_URL = "https://script.google.com/macros/s/AKfycbzRXwdja0xFm9wKcTG0asR5cv2mmhUDLK_S9j1VgtCcI37Dqw228mNrwNm74yzfyS05GA/exec";
const API_KEY = "eduest_super_secret_key_1234";

export const useCartridge = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<Material | null>(null);

  /**
   * 📂 [GAS 전용 데이터 로드 엔진]
   * 구글 로그인 없이 GAS API를 통해 metadata.json을 직접 가져옵니다.
   */
  const loadPacks = useCallback(async () => {
    // 중복 실행 방지
    if (isLoading) return;

    setIsLoading(true);
    try {
      console.log("🎮 [OS 엔진] GAS를 통해 카트리지 목록을 동기화합니다...");
      
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          apiKey: API_KEY,
          action: "fetch_metadata"
        })
      });

      const result = await response.json();
      
      if (result.success && Array.isArray(result.materials)) {
        setMaterials(result.materials);
        console.log("✅ 카트리지 동기화 완료:", result.materials.length, "개");
      } else {
        console.warn("⚠️ 데이터 형식이 올바르지 않거나 목록이 비어있습니다.");
        setMaterials([]);
      }
    } catch (error: any) {
      console.error("❌ 팩 로드 중 에러 발생:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // 🕹️ 팩 선택(삽입) 함수
  const insertPack = (pack: Material) => {
    setSelectedPack(pack);
    console.log(`🕹️ [${pack.title}] 카트리지 삽입됨!`);
  };

  // ✨ [자동 실행 추가] 페이지가 처음 열릴 때 자동으로 목록을 한 번 가져오게 세팅!
  useEffect(() => {
    loadPacks();
  }, []); // 의존성 배열을 비워두어 최초 1회만 실행

  return { 
    materials, 
    isLoading, 
    selectedPack, 
    insertPack, 
    refreshPacks: loadPacks 
  };
};