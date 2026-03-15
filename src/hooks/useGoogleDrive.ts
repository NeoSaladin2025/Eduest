// 1. 타입스크립트에게 전역 google 객체가 있음을 선언
declare global {
  interface Window {
    google: any;
  }
}

import { useState, useEffect, useCallback } from 'react';

export const useGoogleDrive = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // 🔑 [기능 1] 구글 로그인 및 토큰 발급
  const login = useCallback((isSilent = false) => {
    return new Promise<string>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.google) {
        reject('구글 SDK 로드 대기 중...');
        return;
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly', 
        prompt: isSilent ? 'none' : 'select_account', 
        callback: (response: any) => {
          if (response.error) {
            if (isSilent) console.log("자동 연동 세션 만료");
            reject(response.error);
            return;
          }
          
          const expiry = Date.now() + (response.expires_in * 1000);
          localStorage.setItem('google_access_token', response.access_token);
          localStorage.setItem('google_token_expiry', expiry.toString());
          localStorage.setItem('google_connected', 'true');

          setAccessToken(response.access_token);
          resolve(response.access_token);
        },
      });

      if (isSilent) {
        client.requestAccessToken({ prompt: 'none' });
      } else {
        client.requestAccessToken();
      }
    });
  }, []);

  // 🔄 자동 토큰 체크
  useEffect(() => {
    const checkConnection = async () => {
      const isConnected = localStorage.getItem('google_connected');
      const savedToken = localStorage.getItem('google_access_token');
      const expiry = localStorage.getItem('google_token_expiry');

      if (isConnected === 'true') {
        if (savedToken && expiry && Date.now() < parseInt(expiry)) {
          setAccessToken(savedToken);
        } else {
          try { await login(true); } catch (e) { console.log("자동 로그인 실패"); }
        }
      }
    };
    const timer = setTimeout(checkConnection, 1000);
    return () => clearTimeout(timer);
  }, [login]);

  // 📁 [기능 2] 폴더 생성
  const createFolder = async (folderName: string, parentId: string, token: string) => {
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) throw new Error('폴더 생성 실패');
    const data = await res.json();
    return data.id;
  };

  // 🗑️ [기능 3] 파일/폴더 삭제
  const deleteFile = async (fileId: string, token: string) => {
    if (!fileId || fileId === 'undefined') return false; 
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return true;
      return res.ok;
    } catch (error) {
      console.error("삭제 API 에러:", error);
      throw error;
    }
  };

  // 🔍 [신규 추가: 기능 4] 폴더 내 파일 목록 조회 (진짜 로딩용)
  const fetchFileList = useCallback(async (folderId: string, token: string) => {
    try {
      // 이름순으로 정렬해서 q1, q2 순서가 섞이지 않게 가져옴
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&orderBy=name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error("파일 목록 조회 에러:", error);
      return [];
    }
  }, []);

  // 📥 [신규 추가: 기능 5] 파일 진짜 데이터(Blob) 다운로드 (진짜 로딩용)
  const downloadFile = useCallback(async (fileId: string, token: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('다운로드 실패');
      return await response.blob();
    } catch (error) {
      console.error("파일 다운로드 에러:", error);
      throw error;
    }
  }, []);

  // 📂 [기능 6] metadata.json 읽어오기
  const fetchMetadata = async (passedToken?: string) => {
    try {
      let token = passedToken || accessToken;
      if (!token) return []; 
      const folderId = process.env.NEXT_PUBLIC_GOOGLE_FOLDER_ID;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='metadata.json' and '${folderId}' in parents and trashed=false&fields=files(id, name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!contentRes.ok) return [];
        return await contentRes.json();
      }
      return [];
    } catch (error) { 
      console.error("장부 읽기 에러:", error);
      return []; 
    }
  };

  // 📝 [기능 7] metadata.json 업데이트
  const updateMetadata = async (data: any, passedToken?: string) => {
    try {
      let token = passedToken || accessToken;
      if (!token) token = await login(true);
      const folderId = process.env.NEXT_PUBLIC_GOOGLE_FOLDER_ID;
      let updatedData = Array.isArray(data) ? data : [data, ...(await fetchMetadata(token))];
      
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='metadata.json' and '${folderId}' in parents and trashed=false`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const fileId = searchData.files?.length > 0 ? searchData.files[0].id : null;

      const fileMetadata = { name: 'metadata.json', mimeType: 'application/json', ...(fileId ? {} : { parents: [folderId] }) };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
      formData.append('file', new Blob([JSON.stringify(updatedData)], { type: 'application/json' }));

      const url = fileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const saveRes = await fetch(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      return saveRes.ok;
    } catch (error) { 
      console.error("장부 업데이트 에러:", error);
      return false; 
    }
  };

  return { 
    login, 
    createFolder, 
    updateMetadata, 
    fetchMetadata, 
    deleteFile, 
    fetchFileList, // 엔진에서 쓸 수 있게 추가!
    downloadFile,  // 엔진에서 쓸 수 있게 추가!
    accessToken 
  };
};