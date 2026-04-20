'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  buildExamLibraryTree,
  type ExamLibraryNode,
  type ExamLibraryRow,
} from '@/lib/examLibraryTree';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fetchAllExamLibraryRows(): Promise<ExamLibraryRow[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: ExamLibraryRow[] = [];
  for (;;) {
    const { data: page, error } = await supabase
      .from('exam_library')
      .select('drive_id,parent_id,name,type,grade,question_image_drive_id')
      .order('name')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!page?.length) break;
    rows.push(...(page as ExamLibraryRow[]));
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export function useExamLibraryForOs() {
  const [roots, setRoots] = useState<ExamLibraryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<ExamLibraryNode[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const flat = await fetchAllExamLibraryRows();
      setRoots(buildExamLibraryTree(flat));
      setPath([]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'exam_library 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const gradeOptions = useMemo(() => {
    const names = new Set<string>();
    roots.forEach((r) => {
      if (r.type === 'folder' && r.name) names.add(r.name);
    });
    return Array.from(names).sort();
  }, [roots]);

  const gradeRoot = useCallback(
    (gradeLabel: string) => roots.find((r) => r.name.includes(gradeLabel) || r.grade === gradeLabel) || null,
    [roots]
  );

  const displayNodes = useMemo((): ExamLibraryNode[] => {
    if (path.length === 0) return [];
    const last = path[path.length - 1];
    return [...last.subFolders, ...last.files];
  }, [path]);

  const enterFolder = (folder: ExamLibraryNode) => {
    if (folder.type !== 'folder') return;
    setPath((p) => [...p, folder]);
  };

  const goBack = () => {
    setPath((p) => p.slice(0, -1));
  };

  const pickGrade = (gradeLabel: string) => {
    const root = gradeRoot(gradeLabel);
    if (root) setPath([root]);
  };

  return {
    loading,
    error,
    gradeOptions,
    path,
    displayNodes,
    pickGrade,
    enterFolder,
    goBack,
    refresh,
  };
}
