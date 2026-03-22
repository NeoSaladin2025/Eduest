import { useState } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

/**
 * [메커니즘 설명 - 4자리 넘버링 & 정렬 보정판]
 * 1. 유저가 선택한 파일들을 파일명 내 숫자를 기준으로 '사전 정렬'합니다. (1, 2, 10 순서 보장)
 * 2. 업로드 직전, 숫자를 4자리 문자열(예: 0001)로 변환하여 구글 드라이브 정렬 꼬임을 방지합니다.
 * 3. Canvas API를 이용해 WebP로 변환 후 저용량 업로드를 수행합니다.
 */

export const useProbUpload = (targetFolderId: string, expectedCount: number) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [currentIdx, setCurrentIdx] = useState(0); 
  const { accessToken, login } = useGoogleDrive();

  /**
   * 🖼️ 이미지 최적화 (WebP 변환)
   */
  const convertToWebP = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas 생성 실패'));
          
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('WebP 변환 실패'));
          }, 'image/webp', 0.8);
        };
      };
      reader.onerror = reject;
    });
  };

  /**
   * 📂 파일 검증 로직 (숫자 기반)
   */
  const validateFiles = (files: File[]) => {
    const fileNumbers = files
      .map(file => {
        const match = file.name.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
      })
      .filter((num): num is number => num !== null)
      .sort((a, b) => a - b);

    const uniqueNumbers = Array.from(new Set(fileNumbers));
    const missingNumbers: number[] = [];
    for (let i = 1; i <= expectedCount; i++) {
      if (!uniqueNumbers.includes(i)) missingNumbers.push(i);
    }

    return {
      isValid: missingNumbers.length === 0 && uniqueNumbers.length === expectedCount,
      missingNumbers,
      currentCount: uniqueNumbers.length
    };
  };

  /**
   * 🚀 메인 업로드 프로세스 (정렬 및 4자리 보정 추가)
   */
  const uploadImages = async (files: File[]) => {
    // 🔥 1. 사전 정렬: 파일 이름의 숫자를 기준으로 오름차순 정렬
    const sortedFiles = [...files].sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+/)?.[0] || "0", 10);
      const numB = parseInt(b.name.match(/\d+/)?.[0] || "0", 10);
      return numA - numB;
    });

    const { isValid, missingNumbers, currentCount } = validateFiles(sortedFiles);

    if (!isValid) {
      const msg = missingNumbers.length > 0 
        ? `누락된 번호가 있어, 자기야! 💦\n[${missingNumbers.join(', ')}번] 이미지가 없네?`
        : `문항 수는 ${expectedCount}개인데, 이미지는 ${currentCount}개야. 다시 확인해줘!`;
      alert(msg);
      return false;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentIdx(0);

    try {
      const token = accessToken || await login();
      
      for (let i = 0; i < sortedFiles.length; i++) {
        setCurrentIdx(i + 1);
        const file = sortedFiles[i];

        // 🔥 2. 넘버링 보정: 숫자를 추출해 4자리(0001) 포맷으로 변경
        const match = file.name.match(/\d+/);
        const fileNum = match ? match[0] : "0";
        const paddedFileName = fileNum.padStart(4, '0') + ".webp";

        // 3. 최적화 (WebP 변환)
        const webpBlob = await convertToWebP(file);

        // 4. 구글 드라이브 페이로드 생성
        const metadata = {
          name: paddedFileName, // 보정된 이름 사용
          parents: [targetFolderId],
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', webpBlob);

        // 5. 전송
        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        // 6. 에너지바 업데이트
        setUploadProgress(Math.round(((i + 1) / sortedFiles.length) * 100));
      }

      alert('천 단위 문제도 거뜬해! 4자리 넘버링으로 완벽하게 저장됐어! 🥂');
      return true;
    } catch (error: any) {
      console.error("업로드 에러:", error);
      alert("업로드 중에 문제가 생겼어: " + error.message);
      return false;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return { uploadImages, isUploading, uploadProgress, currentIdx, validateFiles };
};