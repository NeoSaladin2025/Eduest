'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiMq-5QOCRjaqwYNyttL09WByzTcfxlwoac6mSdg-EHtXpieEd4Zsi-owUIUAu1KbH0w/exec';

export function useStudentData(studentId: string) {
  // --- 상태 관리 ---
  const [student, setStudent] = useState<any>(null);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [cartridges, setCartridges] = useState<string[]>([]);
  const [examLibrary, setExamLibrary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 캐시 및 프리패치 큐
  const dataCache = useRef<{ [key: string]: string }>({});
  const prefetchQueue = useRef<Set<string>>(new Set());

  // --- 유틸리티 함수 ---
  const extractNumber = (name: string) => {
    const match = name.match(/(\d+)번/) || name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
  };

  const buildTree = (items: any[]) => {
    const map: any = {};
    const roots: any[] = [];
    
    // 1단계: 맵 구성
    items.forEach(item => {
      map[item.drive_id] = { ...item, id: item.drive_id, subFolders: [], files: [] };
    });

    // 2단계: 트리 구조 연결
    items.forEach(item => {
      const node = map[item.drive_id];
      if (item.parent_id && map[item.parent_id]) {
        if (item.type === 'folder') map[item.parent_id].subFolders.push(node);
        else map[item.parent_id].files.push(node);
      } else { 
        roots.push(node); 
      }
    });
    return roots;
  };

  // --- 데이터 초기화 및 실시간 구독 ---
  useEffect(() => {
    if (!studentId) return;

    const initPage = async () => {
      try {
        setLoading(true);
        
        // 1. 학생 기본 정보 로드 (unlocked_folders 배열 포함)
        const { data: studentData } = await supabase
          .from('students')
          .select('*')
          .eq('id', studentId)
          .single();
          
        if (!studentData) return;
        setStudent(studentData);

        // 2. 라이브러리 트리 로드 (전체 구조를 가져와야 부모-자식 연결이 유지됨)
        // PostgREST 기본 max-rows(예: 1000) 때문에 한 번에만 select 하면 하위 폴더 행이 잘리고
        // 형제 폴더가 화면에서 사라질 수 있음 → 페이지 단위로 모두 수집
        const pageSize = 1000;
        let from = 0;
        const dbLibrary: any[] = [];
        for (;;) {
          const { data: page, error: libErr } = await supabase
            .from('exam_library')
            .select('*')
            .range(from, from + pageSize - 1);
          if (libErr) throw libErr;
          if (!page?.length) break;
          dbLibrary.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }

        if (dbLibrary.length > 0) {
          setExamLibrary(buildTree(dbLibrary));
        }

        // 3. 복습 기록 로드 (Google Apps Script 연동)
        fetch(APPS_SCRIPT_URL, { 
          method: 'POST', 
          body: JSON.stringify({ 
            action: 'get_student_records', 
            studentFolderId: studentData.drive_folder_id, 
            apiKey: "eduest_super_secret_key_1234" 
          }) 
        })
        .then(res => res.json())
        .then(revData => {
          if (revData.success) {
            const records = revData.records || [];
            setAllRecords(records);
            setCartridges(Array.from(new Set(records.map((r: any) => (r.name.match(/\[(.*?)\]/) || [null, "기본"])[1]))));
          }
        });
      } catch (err) {
        console.error("Data Load Error:", err);
      } finally {
        setLoading(false);
      }
    };

    initPage();

    // 📡 실시간 감시병 (선생님의 권한 수정을 실시간 반영)
    const channel = supabase
      .channel(`status_monitor_${studentId}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'students', 
          filter: `id=eq.${studentId}` 
        }, 
        (payload) => {
          // 🔥 실시간 업데이트: unlocked_folders 배열 포함 전체 상태 갱신
          console.log("실시간 데이터 동기화 완료 ⚡", payload.new);
          setStudent(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  // --- 프리패치 로직 ---
  const startStealthPrefetch = async (items: any[]) => {
    for (const item of items) {
      const cacheKey = `${item.id}_solution`;
      
      // 이미 캐시되었거나 대기열에 있다면 패스
      if (dataCache.current[cacheKey] || prefetchQueue.current.has(cacheKey)) continue;

      prefetchQueue.current.add(cacheKey);
      try {
        const res = await fetch(APPS_SCRIPT_URL, { 
          method: 'POST', 
          body: JSON.stringify({ 
            action: 'get_file_data', 
            fileId: item.id, 
            type: 'html', 
            apiKey: "eduest_super_secret_key_1234" 
          }) 
        });
        const resJson = await res.json();
        if (resJson.success) {
          let d = resJson.data;
          if (d) {
            d = d.replace(/[₩¥]/g, '\\');
            dataCache.current[cacheKey] = d;
          }
        }
      } catch (e) {
        console.error("Prefetching failed:", e);
      }
    }
  };

  return {
    student,
    allRecords,
    cartridges,
    examLibrary,
    loading,
    dataCache,
    startStealthPrefetch,
    extractNumber
  };
}
