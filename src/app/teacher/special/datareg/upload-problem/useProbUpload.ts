import { useState } from 'react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

/**
 * [메커니즘 설명]
 * 1. 유저가 파일을 선택하면 validateFiles로 번호 누락을 체크합니다.
 * 2. 업로드 시작 시, Canvas API를 이용해 각 이미지를 WebP 포맷으로 변환합니다.
 * 3. 변환된 저용량 파일을 구글 드라이브의 '01_Problems' 폴더로 업로드합니다.
 * 4. 실시간으로 진행 퍼센트(%)와 현재 처리 중인 파일 인덱스를 반환합니다.
 */

export const useProbUpload = (targetFolderId: string, expectedCount: number) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 에너지바 %용
  const [currentIdx, setCurrentIdx] = useState(0); // 진행 카운트용 [n/total]
  const { accessToken, login } = useGoogleDrive();

  /**
   * 🖼️ 이미지 최적화 (WebP 변환) 메커니즘
   * 화질은 유지하되 용량을 획기적으로 줄입니다.
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
          // 퀄리티 0.8의 WebP로 변환하여 용량 다이어트
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
   * 📂 파일 검증 로직 (자기의 소중한 원본 로직 유지)
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
   * 🚀 메인 업로드 프로세스
   */
  const uploadImages = async (files: File[]) => {
    const { isValid, missingNumbers, currentCount } = validateFiles(files);

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
      
      for (let i = 0; i < files.length; i++) {
        // 1. 현재 진행 상황 업데이트
        setCurrentIdx(i + 1);
        const file = files[i];

        // 2. 내부 최적화 (유저는 모르게 WebP로 변환)
        const webpBlob = await convertToWebP(file);
        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";

        // 3. 구글 드라이브용 멀티파트 페이로드 생성
        const metadata = {
          name: newFileName,
          parents: [targetFolderId],
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', webpBlob);

        // 4. 전송
        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        // 5. 에너지바 업데이트
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      alert('모든 문제가 완벽하게 업로드됐어! 역시 지존이야! 🥂');
      return true;
    } catch (error) {
      console.error("업로드 에러:", error);
      alert("업로드 중에 문제가 생겼어.");
      return false;
    } finally {
      setIsUploading(false);
      // 작업 완료 후 상태 초기화 (필요에 따라)
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return { uploadImages, isUploading, uploadProgress, currentIdx, validateFiles };
};