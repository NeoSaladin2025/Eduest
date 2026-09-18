'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getCachedContent, setCachedContent } from '@/lib/contentCache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GAS_LIBRARY_PROXY = '/api/gas/library';
const FAST_FILE_PROXY = '/api/drive/library/file';

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
        fetch(GAS_LIBRARY_PROXY, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  // --- 고속 파일 로더 (메모리 -> IndexedDB -> 고속 API) ---
  const fetchFileContent = async (fileId: string, type: 'html' | 'image' = 'html'): Promise<string | null> => {
    if (!fileId) return null;
    const cacheKey = `${fileId}_${type === 'html' ? 'solution' : 'problem'}`;
    
    // 1단계: 인메모리 캐시 확인 (즉시 0ms)
    if (dataCache.current[cacheKey]) {
      return dataCache.current[cacheKey];
    }

    // 2단계: 브라우저 영구 IndexedDB 캐시 확인 (0~2ms)
    const idbData = await getCachedContent(cacheKey);
    if (idbData) {
      dataCache.current[cacheKey] = idbData;
      return idbData;
    }

    // 3단계: 고속 API 엔드포인트 호출 (~200ms)
    try {
      const res = await fetch(`${FAST_FILE_PROXY}?fileId=${encodeURIComponent(fileId)}&type=${type}`);
      const json = await res.json();
      if (json.success && json.data) {
        let d = json.data;
        if (type === 'html') d = d.replace(/[₩¥]/g, '\\');
        dataCache.current[cacheKey] = d;
        setCachedContent(cacheKey, d); // 비동기 백그라운드 영구 캐싱
        return d;
      }
    } catch (e) {
      console.error("fetchFileContent failed:", e);
    }
    return null;
  };

  // 단일 항목 프리패치 (마우스 호버 시 즉시 호출 가능)
  const prefetchItem = async (item: any, type: 'html' | 'image' = 'html') => {
    if (!item) return;
    const fileId = type === 'html' ? (item.solutionUrl || item.id) : (item.problemUrl || item.id);
    if (!fileId) return;
    const cacheKey = `${item.id}_${type === 'html' ? 'solution' : 'problem'}`;
    if (dataCache.current[cacheKey] || prefetchQueue.current.has(cacheKey)) return;

    prefetchQueue.current.add(cacheKey);
    try {
      await fetchFileContent(fileId, type);
    } finally {
      prefetchQueue.current.delete(cacheKey);
    }
  };

  // 스마트 지능형 병렬 프리패치 (현재 문항 인근 우선 로딩 + 3개씩 병렬 청크 처리)
  const startStealthPrefetch = async (items: any[], currentIndex: number = 0, type: 'html' | 'image' = 'html') => {
    if (!items || items.length === 0) return;

    // 현재 보고 있는 문항 인근을 최우선으로 정렬 (예: 6번 보고 있다면 7, 5, 8, 4...)
    const orderedItems = [...items].sort((a, b) => {
      const idxA = items.indexOf(a);
      const idxB = items.indexOf(b);
      const distA = Math.abs(idxA - currentIndex);
      const distB = Math.abs(idxB - currentIndex);
      return distA - distB;
    });

    // 3개씩 묶어서 병렬 실행
    const CHUNK_SIZE = 3;
    for (let i = 0; i < orderedItems.length; i += CHUNK_SIZE) {
      const chunk = orderedItems.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(chunk.map(item => prefetchItem(item, type)));
    }
  };

  return {
    student,
    allRecords,
    cartridges,
    examLibrary,
    loading,
    dataCache,
    fetchFileContent,
    prefetchItem,
    startStealthPrefetch,
    extractNumber
  };
}
