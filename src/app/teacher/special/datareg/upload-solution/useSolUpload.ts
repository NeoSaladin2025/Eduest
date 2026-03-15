'use client';

import { useState } from 'react';

/**
 * 해설 파일 업로드를 관리하는 커스텀 훅
 */
export const useSolUpload = (solFolderId: string, totalCount: number) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  /**
   * 실제 업로드 실행 함수
   * @param files 선택된 HTML 파일 배열
   * @param startNumber 시작 문항 번호 (예: 1001)
   */
  const uploadSolutions = async (files: File[], startNumber: number) => {
    if (!solFolderId) {
      console.error("❌ 해설 폴더 ID가 설정되지 않았습니다.");
      return false;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 🛠️ 타입 에러 해결: window as any를 사용하여 gapi 접근 허용
      const gapi = (window as any).gapi;
      const token = gapi?.auth2?.getAuthInstance()?.currentUser.get().getAuthResponse().access_token 
                 || localStorage.getItem('google_access_token');

      if (!token) {
        throw new Error("구글 인증 토큰을 찾을 수 없습니다.");
      }

      // 1️⃣ 파일 정렬: 파일명 내 숫자를 기준으로 오름차순 정렬
      const sortedFiles = [...files].sort((a, b) => {
        const numA = parseInt(a.name.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.name.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      });

      // 2️⃣ 순차 업로드 실행
      for (let i = 0; i < sortedFiles.length; i++) {
        const file = sortedFiles[i];
        
        // 🔥 시작 번호 기준 넘버링 (천 단위 0001 패딩)
        const currentNum = startNumber + i;
        const fileName = `sol_${currentNum.toString().padStart(4, '0')}.html`;

        const metadata = {
          name: fileName,
          parents: [solFolderId],
          mimeType: 'text/html',
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!response.ok) throw new Error(`${fileName} 업로드 실패`);

        setUploadProgress(Math.round(((i + 1) / sortedFiles.length) * 100));
      }

      return true;
    } catch (error) {
      console.error('⚠️ 해설 업로드 중 오류:', error);
      alert('업로드 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadSolutions, isUploading, uploadProgress };
};