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

// 🌟 추가전략(.strategy-run-result) 실제 수록 여부 정밀 판별 함수
// (CSS 정의나 JS 스크립트 boilerplate 텍스트가 아닌 실제 HTML 렌더링 태그 요소 존재 여부만 정밀 검사)
export const checkContentHasStrategy = (content: string | null | undefined): boolean => {
  if (!content) return false;
  return /<[^>]+class\s*=\s*["'][^"']*\b(strategy-run-result|strategy-result-toggle|strategy-result-body)\b[^"']*["']/i.test(content);
};

export function useStudentData(studentId: string) {
  // --- 상태 관리 ---
  // 🌟 [초고속 0ms 즉시 뿅!] 이전에 접속한 기기라면 localStorage에서 프로필(이름, 비밀번호 유무 등)을 즉시 0ms 동기 복원
  const [student, setStudent] = useState<any>(() => {
    if (typeof window !== 'undefined' && studentId) {
      try {
        const cached = localStorage.getItem(`eduest_student_profile_${studentId}`);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  });
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [cartridges, setCartridges] = useState<string[]>([]);
  const [examLibrary, setExamLibrary] = useState<any[]>([]);
  const [studentLoading, setStudentLoading] = useState(() => !student);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [strategyMap, setStrategyMap] = useState<Record<string, boolean>>({});

  // 캐시 및 프리패치 큐
  const dataCache = useRef<{ [key: string]: string }>({});
  const prefetchQueue = useRef<Set<string>>(new Set());

  // --- 유틸리티 함수 ---
  const extractNumber = (name: string) => {
    const match = name.match(/(\d+)번/) || name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
  };

  const buildTree = (items: any[]) => {
    // 🌟 1. 특수 가상 레코드 및 쌍둥이 관련 데이터 원천 차단
    const EXCLUDED_IDS = new Set([
      'class_schedule_root_data',
      'student_menu_config_data',
      'test2_exam_papers_data',
      'test2_student_submissions_data',
      'test_bank_categories_data',
      'test_bank_items_data',
      'test_twin_problems_data',
    ]);

    const twinIds = new Set<string>();
    items.forEach(item => {
      if (item.name && item.name.includes('쌍둥이')) {
        twinIds.add(item.drive_id);
      }
    });

    let added = true;
    while (added) {
      added = false;
      items.forEach(item => {
        if (item.parent_id && twinIds.has(item.parent_id) && !twinIds.has(item.drive_id)) {
          twinIds.add(item.drive_id);
          added = true;
        }
      });
    }

    const filtered = items.filter(
      item => !EXCLUDED_IDS.has(item.drive_id) && !twinIds.has(item.drive_id)
    );

    const map: any = {};
    const roots: any[] = [];
    
    // 2단계: 맵 구성
    filtered.forEach(item => {
      map[item.drive_id] = { ...item, id: item.drive_id, subFolders: [], files: [] };
    });

    // 3단계: 트리 구조 연결
    filtered.forEach(item => {
      const node = map[item.drive_id];
      if (item.parent_id && map[item.parent_id]) {
        if (item.type === 'folder') map[item.parent_id].subFolders.push(node);
        else map[item.parent_id].files.push(node);
      } else if (!item.parent_id || item.parent_id === '1W1s2wPQnwXQI-i3Cwc8g1RfsajEGW-UC' || (node.name && ['고1', '고2', '고3', '중1', '중2', '중3'].some(g => node.name.includes(g)))) {
        roots.push(node);
      } else {
        // 🌟 부모가 없는 고아 노드는 루트로 승급시키지 않고 스킵
      }
    });
    return roots;
  };

  // --- 데이터 초기화 및 실시간 구독 ---
  useEffect(() => {
    if (!studentId) return;

    const initPage = async () => {
      // 🌟 [1단계: 0.05초 초고속 학생 프로필 로드]
      // 메인 화면 진입 및 4자리 PIN 입력창 표출에 필요한 학생 기본 정보만 최우선 조회
      try {
        const { data: studentData } = await supabase
          .from('students')
          .select('id, name, grade, drive_folder_id, is_unlocked, unlocked_folders')
          .eq('id', studentId)
          .single();

        if (studentData) {
          // 비밀번호 설정 여부는 전용 보안 API로 확인 (비밀번호 내용은 전송하지 않음)
          let hasPassword = false;
          try {
            const checkRes = await fetch(`/api/student/verify-password?studentId=${encodeURIComponent(studentId)}`);
            const checkData = await checkRes.json();
            hasPassword = !!checkData.hasPassword;
          } catch (e) {
            console.error('Check password status error:', e);
          }

          const profile = {
            ...studentData,
            has_password: hasPassword,
          };
          setStudent(profile);

          // 다음번 방문 시 0.00초 즉시 뿅 표출을 위해 브라우저 로컬 스토리지에 캐싱
          try {
            localStorage.setItem(`eduest_student_profile_${studentId}`, JSON.stringify(profile));
          } catch (e) {}
          setStudentLoading(false);

          // 🌟 복습 기록 로드 (Google Apps Script 연동 - 비동기 백그라운드)
          if (studentData.drive_folder_id) {
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
              if (revData?.success) {
                const records = revData.records || [];
                setAllRecords(records);
                setCartridges(Array.from(new Set(records.map((r: any) => (r.name.match(/\[(.*?)\]/) || [null, "기본"])[1]))));
              }
            })
            .catch(() => {});
          }
        }
      } catch (err) {
        console.error("Student Profile Load Error:", err);
      } finally {
        setStudentLoading(false);
      }

      // 🌟 [2단계: 백그라운드 비동기 라이브러리 트리 로드]
      // 학생이 비번을 치고 있거나 복습/숙제를 보는 동안 백그라운드에서 조용히 병렬로 가져옴! (화면 차단 0%)
      try {
        setLibraryLoading(true);
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
      } catch (err) {
        console.error("Library Load Error:", err);
      } finally {
        setLibraryLoading(false);
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
          setStudent((prev: any) => {
            const next = { ...prev, ...payload.new };
            try {
              localStorage.setItem(`eduest_student_profile_${studentId}`, JSON.stringify(next));
            } catch (e) {}
            return next;
          });
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
      const cached = dataCache.current[cacheKey];
      if (type === 'html') {
        const hasStrat = checkContentHasStrategy(cached);
        setStrategyMap(prev => prev[fileId] === hasStrat ? prev : ({ ...prev, [fileId]: hasStrat }));
      }
      return cached;
    }

    // 2단계: 브라우저 영구 IndexedDB 캐시 확인 (0~2ms)
    const idbData = await getCachedContent(cacheKey);
    if (idbData) {
      dataCache.current[cacheKey] = idbData;
      if (type === 'html') {
        const hasStrat = checkContentHasStrategy(idbData);
        setStrategyMap(prev => prev[fileId] === hasStrat ? prev : ({ ...prev, [fileId]: hasStrat }));
      }
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
        if (type === 'html') {
          const hasStrat = checkContentHasStrategy(d);
          setStrategyMap(prev => prev[fileId] === hasStrat ? prev : ({ ...prev, [fileId]: hasStrat }));
        }
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

  // 🌟 폴더 진입 시 IndexedDB/캐시에서 추가전략 존재 여부 일괄 비동기 감지
  const scanStrategyForItems = async (items: any[]) => {
    if (!items || items.length === 0) return;
    for (const item of items) {
      const fileId = item.solutionUrl || item.id;
      if (!fileId) continue;
      const cacheKey = `${fileId}_solution`;
      const cached = dataCache.current[cacheKey] || dataCache.current[`${item.id}_solution`];
      if (cached) {
        const hasStrat = checkContentHasStrategy(cached);
        setStrategyMap(prev => prev[fileId] === hasStrat && prev[item.id] === hasStrat ? prev : ({ ...prev, [fileId]: hasStrat, [item.id]: hasStrat }));
      } else {
        getCachedContent(cacheKey).then(idb => {
          if (idb) {
            const hasStrat = checkContentHasStrategy(idb);
            setStrategyMap(prev => prev[fileId] === hasStrat && prev[item.id] === hasStrat ? prev : ({ ...prev, [fileId]: hasStrat, [item.id]: hasStrat }));
          }
        }).catch(() => {});
      }
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
    loading: studentLoading,
    studentLoading,
    libraryLoading,
    dataCache,
    strategyMap,
    fetchFileContent,
    prefetchItem,
    startStealthPrefetch,
    scanStrategyForItems,
    extractNumber
  };
}
