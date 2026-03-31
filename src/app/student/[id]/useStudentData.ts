'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec';

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
    items.forEach(item => {
      map[item.drive_id] = { ...item, id: item.drive_id, subFolders: [], files: [] };
    });
    items.forEach(item => {
      const node = map[item.drive_id];
      if (item.parent_id && map[item.parent_id]) {
        if (item.type === 'folder') map[item.parent_id].subFolders.push(node);
        else map[item.parent_id].files.push(node);
      } else { roots.push(node); }
    });
    return roots;
  };

  // --- 데이터 초기화 및 실시간 구독 ---
  useEffect(() => {
    if (!studentId) return;

    const initPage = async () => {
      try {
        setLoading(true);
        // 1. 학생 기본 정보 로드
        const { data: studentData } = await supabase.from('students').select('*').eq('id', studentId).single();
        if (!studentData) return;
        setStudent(studentData);

        // 2. 라이브러리 트리 로드
        const { data: dbLibrary } = await supabase
          .from('exam_library')
          .select('*')
          .eq('grade', studentData.grade);

        if (dbLibrary && dbLibrary.length > 0) {
          setExamLibrary(buildTree(dbLibrary));
        }

        // 3. 복습 기록 로드 (Google Apps Script)
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

    // 📡 실시간 감시병 (락/언락 등 실시간 상태 동기화)
    const channel = supabase
      .channel(`status_monitor_${studentId}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${studentId}` }, 
        (payload) => {
          console.log("실시간 동기화 완료! ⚡", payload.new);
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
          d = d.replace(/[₩¥]/g, '\\');
          dataCache.current[cacheKey] = d;
        }
      } catch (e) {
        console.error("Prefetching failed:", e);
      }
    }
  };

  // UI에서 사용할 수 있게 포장해서 내보내기
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