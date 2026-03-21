'use client';

import { useState, useCallback, useRef } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

export const useProblemEngine = () => {
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // 💾 메모리 맵 (문제지: Blob URL, 해설지: HTML String)
  const [problemMap, setProblemMap] = useState<Record<string, string>>({});
  const [solutionMap, setSolutionMap] = useState<Record<string, string>>({});

  // 🔥 [추가] 원본 구글 드라이브 파일 ID를 저장할 맵 (복습 리스트 저장용)
  const [problemIdMap, setProblemIdMap] = useState<Record<string, string>>({});
  const [solutionIdMap, setSolutionIdMap] = useState<Record<string, string>>({});

  const { fetchFileList, downloadFile, accessToken } = useGoogleDrive();
  const loadingRef = useRef<string | null>(null);

  const loadCartridgeData = useCallback(async (pack: any) => {
    // 🛑 1. 데이터 검증
    if (!pack || !pack.prob_folder_id || !pack.sol_folder_id) {
      console.warn("⚠️ [엔진] 유효하지 않은 팩 정보입니다.", pack);
      return;
    }

    // 🛑 2. 중복 호출 방지
    if (loadingRef.current === pack.id) return;
    loadingRef.current = pack.id;

    if (!accessToken) {
      console.error("🔑 [엔진] 구글 액세스 토큰이 없습니다.");
      return;
    }

    setIsReady(false);
    setProgress(0);
    
    // 임시 보관용 객체들 (루프 안에서 직접 state를 바꾸면 성능이 저하되므로)
    const pMap: Record<string, string> = {};
    const sMap: Record<string, string> = {};
    const pIdMap: Record<string, string> = {}; // 🔥 원본 ID 보관용
    const sIdMap: Record<string, string> = {}; // 🔥 원본 ID 보관용

    try {
      // 🚀 Step 1: 폴더 스캔 시작
      console.log(`📂 [엔진] '${pack.title}' 동기화 시작`);
      const [pFiles, sFiles] = await Promise.all([
        fetchFileList(pack.prob_folder_id, accessToken),
        fetchFileList(pack.sol_folder_id, accessToken)
      ]);
      
      setProgress(10);

      const totalFiles = pFiles.length + sFiles.length;
      if (totalFiles === 0) {
        setIsReady(true);
        setProgress(100);
        return;
      }

      let loadedCount = 0;

      // 🚀 Step 2: 문제지(이미지) 다운로드 및 ID 매핑
      for (const file of pFiles) {
        try {
          const blob = await downloadFile(file.id, accessToken);
          const url = URL.createObjectURL(blob);
          const nameKey = file.name.split('.')[0].trim().toLowerCase();
          
          pMap[nameKey] = url;          // 뷰어용 임시 URL
          pIdMap[nameKey] = file.id;    // 🔥 실제 구글 드라이브 ID 저장!
          
          console.log(`🖼️ 문제지 등록: [${nameKey}] -> ID: ${file.id}`);
        } catch (e) {
          console.error(`❌ 문제지 로드 실패: ${file.name}`, e);
        }
        loadedCount++;
        setProgress(10 + Math.round((loadedCount / totalFiles) * 90));
      }

      // 🚀 Step 3: 해설지(HTML) 다운로드 및 ID 매핑
      for (const file of sFiles) {
        try {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          
          if (!response.ok) throw new Error('HTML 로드 실패');
          
          const htmlText = await response.text();
          const nameKey = file.name.split('.')[0].trim().toLowerCase();
          
          sMap[nameKey] = htmlText;     // 뷰어용 HTML 텍스트
          sIdMap[nameKey] = file.id;    // 🔥 실제 구글 드라이브 ID 저장!
          
          console.log(`📄 해설지 등록: [${nameKey}] -> ID: ${file.id}`);
        } catch (e) {
          console.error(`❌ 해설지 로드 실패: ${file.name}`, e);
        }
        loadedCount++;
        setProgress(10 + Math.round((loadedCount / totalFiles) * 90));
      }

      // 🚀 최종 상태 업데이트
      setProblemMap(pMap);
      setSolutionMap(sMap);
      setProblemIdMap(pIdMap);
      setSolutionIdMap(sIdMap);
      
      setIsReady(true);
      setProgress(100);
      console.log("✅ [엔진] 모든 리소스 및 파일 ID 동기화 완료.");

    } catch (error) {
      console.error("❌ [엔진] 치명적 로딩 에러:", error);
    } finally {
      loadingRef.current = null;
    }
  }, [accessToken, fetchFileList, downloadFile]);

  // 🔥 return에 ID 맵들을 포함하여 EduOSContainer에서 쓸 수 있게 합니다.
  return { 
    progress, 
    isReady, 
    problemMap, 
    solutionMap, 
    problemIdMap, 
    solutionIdMap, 
    loadCartridgeData 
  };
};