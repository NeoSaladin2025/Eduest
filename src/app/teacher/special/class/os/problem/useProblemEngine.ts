'use client';

import { useState, useCallback, useRef } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

export const useProblemEngine = () => {
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // 💾 메모리 맵 (문제지: Blob URL, 해설지: HTML String)
  const [problemMap, setProblemMap] = useState<Record<string, string>>({});
  const [solutionMap, setSolutionMap] = useState<Record<string, string>>({});

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
    const pMap: Record<string, string> = {};
    const sMap: Record<string, string> = {};

    try {
      // 🚀 Step 1: 폴더 스캔 시작
      console.log(`📂 [엔진] '${pack.title}' 동기화 시작 (Blackboard 시스템 준비)`);
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

      // 🚀 Step 2: 문제지(이미지) 다운로드 -> Blackboard 배경 및 Viewer용
      for (const file of pFiles) {
        try {
          const blob = await downloadFile(file.id, accessToken);
          const url = URL.createObjectURL(blob);
          // 파일명에서 확장자 제거 후 소문자로 키 생성 (예: 0001.png -> 0001)
          const nameKey = file.name.split('.')[0].trim().toLowerCase();
          pMap[nameKey] = url;
          console.log(`🖼️ [Blackboard Resource] 문제지 등록: [${nameKey}]`);
        } catch (e) {
          console.error(`❌ 문제지 로드 실패: ${file.name}`, e);
        }
        loadedCount++;
        setProgress(10 + Math.round((loadedCount / totalFiles) * 90));
      }

      // 🚀 Step 3: 해설지(HTML) 다운로드 -> SolutionViewer용
      for (const file of sFiles) {
        try {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          
          if (!response.ok) throw new Error('HTML 로드 실패');
          
          const htmlText = await response.text();
          const nameKey = file.name.split('.')[0].trim().toLowerCase();
          
          sMap[nameKey] = htmlText; 
          console.log(`📄 [Solution Resource] 해설지 등록: [${nameKey}]`);
        } catch (e) {
          console.error(`❌ 해설지 로드 실패: ${file.name}`, e);
        }
        loadedCount++;
        setProgress(10 + Math.round((loadedCount / totalFiles) * 90));
      }

      setProblemMap(pMap);
      setSolutionMap(sMap);
      setIsReady(true);
      setProgress(100);
      console.log("✅ [엔진] 모든 리소스 동기화 완료. Blackboard 및 Viewer 로드 준비 끝.");

    } catch (error) {
      console.error("❌ [엔진] 치명적 로딩 에러:", error);
    } finally {
      loadingRef.current = null;
    }
  }, [accessToken, fetchFileList, downloadFile]);

  return { progress, isReady, problemMap, solutionMap, loadCartridgeData };
};