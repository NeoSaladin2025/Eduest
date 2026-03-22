'use client';

import { useState } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive'; // ✅ 인증 훅 활용

/**
 * 해설 파일 업로드를 관리하는 커스텀 훅
 */
export const useSolUpload = (solFolderId: string, totalCount: number) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { accessToken, login } = useGoogleDrive(); // ✅ 구글 드라이브 훅 연결

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
      // 🛠️ 인증 강화: 기존 훅의 토큰을 사용하거나 없으면 로그인을 시도해
      const token = accessToken || await login();

      if (!token) {
        throw new Error("구글 인증 토큰을 획득하지 못했습니다.");
      }

      // 1️⃣ 파일 정렬: 파일명 내 숫자를 기준으로 오름차순 정렬 (정교한 정규식 적용)
      const sortedFiles = [...files].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || "0", 10);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || "0", 10);
        return numA - numB;
      });

      // 2️⃣ 순차 업로드 실행
      for (let i = 0; i < sortedFiles.length; i++) {
        const file = sortedFiles[i];
        
        // 🔥 자릿수 보정: sol_0001.html 형식 (천 단위 대응)
        // 만약 startNumber가 1이라면 1, 2, 3... 순서대로 0001, 0002...
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

        // 🚀 전송 (멀티파트 업로드)
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!response.ok) throw new Error(`${fileName} 업로드 실패`);

        // 진행도 업데이트
        setUploadProgress(Math.round(((i + 1) / sortedFiles.length) * 100));
      }

      alert(`모든 해설지가 완벽하게 저장됐어! (시작번호: ${startNumber}번) 🥂`);
      return true;
    } catch (error: any) {
      console.error('⚠️ 해설 업로드 중 오류:', error.message);
      alert('업로드 중 오류가 발생했습니다: ' + error.message);
      return false;
    } finally {
      setIsUploading(false);
      // 성공 후 퍼센트 초기화 지연
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return { uploadSolutions, isUploading, uploadProgress };
};