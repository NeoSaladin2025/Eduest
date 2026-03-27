'use client';

import { useState, useCallback, useRef } from 'react';

// 🔥 [공통 설정] 우리가 만든 최종 GAS URL과 보안 키
const GAS_URL = "https://script.google.com/macros/s/AKfycbzRXwdja0xFm9wKcTG0asR5cv2mmhUDLK_S9j1VgtCcI37Dqw228mNrwNm74yzfyS05GA/exec";
const API_KEY = "eduest_super_secret_key_1234";

export const useProblemEngine = () => {
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // 💾 메모리 맵 (문제지: Base64/Blob URL, 해설지: HTML String)
  const [problemMap, setProblemMap] = useState<Record<string, string>>({});
  const [solutionMap, setSolutionMap] = useState<Record<string, string>>({});

  // 💾 원본 구글 드라이브 파일 ID (저장/복습용)
  const [problemIdMap, setProblemIdMap] = useState<Record<string, string>>({});
  const [solutionIdMap, setSolutionIdMap] = useState<Record<string, string>>({});

  // ⚡ 실시간 추적용 Ref
  const fileListRef = useRef<{ pFiles: any[], sFiles: any[] }>({ pFiles: [], sFiles: [] });
  const loadingRef = useRef<string | null>(null);

  /**
   * 🎯 [새치기 로딩] 클릭한 번호 리소스를 GAS를 통해 즉시 로드
   */
  const loadSpecificProblem = useCallback(async (index: number) => {
    const pKey = String(index).padStart(4, '0');

    // 이미 로딩되어 있다면 스킵
    if (problemMap[pKey] && solutionMap[pKey]) return;

    const targetPFile = fileListRef.current.pFiles.find((f: any) => f.name.includes(pKey));
    const targetSFile = fileListRef.current.sFiles.find((f: any) => f.name.includes(pKey) || f.name.includes(`sol_${pKey}`));

    // 1. 문제지(이미지) 즉시 로딩
    if (targetPFile && !problemMap[pKey]) {
      try {
        const res = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify({
            apiKey: API_KEY,
            action: "get_file_data",
            fileId: targetPFile.id,
            type: "image"
          })
        });
        const result = await res.json();
        if (result.success) {
          setProblemMap(prev => ({ ...prev, [pKey]: result.data })); // Base64 데이터 직접 삽입
          setProblemIdMap(prev => ({ ...prev, [pKey]: targetPFile.id }));
        }
      } catch (e) { console.error(`❌ 문제${pKey} 즉시 로드 실패`, e); }
    }

    // 2. 해설지(HTML) 즉시 로딩
    if (targetSFile && !solutionMap[pKey]) {
      try {
        const res = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify({
            apiKey: API_KEY,
            action: "get_file_data",
            fileId: targetSFile.id,
            type: "html"
          })
        });
        const result = await res.json();
        if (result.success) {
          setSolutionMap(prev => ({ ...prev, [pKey]: result.data }));
          setSolutionIdMap(prev => ({ ...prev, [pKey]: targetSFile.id }));
        }
      } catch (e) { console.error(`❌ 해설${pKey} 즉시 로드 실패`, e); }
    }
  }, [problemMap, solutionMap]);

  /**
   * 🚀 카트리지 로드 (GAS를 통해 리스트 스캔 후 백그라운드 순차 로딩)
   */
  const loadCartridgeData = useCallback(async (pack: any) => {
    if (!pack || loadingRef.current === pack.id) return;
    loadingRef.current = pack.id;

    setIsReady(false);
    setProgress(0);
    setProblemMap({});
    setSolutionMap({});
    setProblemIdMap({});
    setSolutionIdMap({});

    try {
      console.log(`📂 [엔진] '${pack.title}' GAS 스텔스 로딩 시작`);

      // Step 1: GAS를 통해 파일 리스트만 먼저 스캔
      const [pRes, sRes] = await Promise.all([
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ apiKey: API_KEY, action: "fetch_file_list", folderId: pack.prob_folder_id }) }),
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ apiKey: API_KEY, action: "fetch_file_list", folderId: pack.sol_folder_id }) })
      ]);

      const pData = await pRes.json();
      const sData = await sRes.json();

      if (!pData.success || !sData.success) throw new Error("리스트 로드 실패");

      fileListRef.current = { pFiles: pData.files, sFiles: sData.files };
      
      // Step 2: 리스트 확보 즉시 UI 개방
      setIsReady(true);
      setProgress(5);

      // Step 3: 백그라운드 스텔스 로딩 루프
      const startStealthLoading = async () => {
        const pFiles = fileListRef.current.pFiles;
        const total = pFiles.length;
        
        for (let i = 0; i < total; i++) {
          const pFile = pFiles[i];
          const pKey = pFile.name.match(/\d+/)?.[0].padStart(4, '0') || String(i + 1).padStart(4, '0');

          // 문제지 순차 로딩
          if (!problemMap[pKey]) {
            const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ apiKey: API_KEY, action: "get_file_data", fileId: pFile.id, type: "image" }) });
            const result = await res.json();
            if (result.success) {
              setProblemMap(prev => ({ ...prev, [pKey]: result.data }));
              setProblemIdMap(prev => ({ ...prev, [pKey]: pFile.id }));
            }
          }

          // 해설지 순차 로딩
          const sFile = fileListRef.current.sFiles.find((f: any) => f.name.includes(pKey));
          if (sFile && !solutionMap[pKey]) {
            const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ apiKey: API_KEY, action: "get_file_data", fileId: sFile.id, type: "html" }) });
            const result = await res.json();
            if (result.success) {
              setSolutionMap(prev => ({ ...prev, [pKey]: result.data }));
              setSolutionIdMap(prev => ({ ...prev, [pKey]: sFile.id }));
            }
          }

          setProgress(Math.round(((i + 1) / total) * 100));
        }
        console.log("✅ [엔진] 전 문항 로딩 완료");
      };

      startStealthLoading();

    } catch (error) {
      console.error("❌ [엔진] 로딩 에러:", error);
    } finally {
      loadingRef.current = null;
    }
  }, [problemMap, solutionMap]);

  return { 
    progress, 
    isReady, 
    problemMap, 
    solutionMap, 
    problemIdMap, 
    solutionIdMap, 
    loadCartridgeData,
    loadSpecificProblem 
  };
};