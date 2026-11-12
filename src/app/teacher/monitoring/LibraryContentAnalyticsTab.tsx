'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Library,
  Folder,
  FolderOpen,
  Clock,
  Users,
  Flame,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Download,
  RotateCcw,
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  ShoppingCart,
  Trash2,
  Check,
  ArrowDown,
  FileText,
  Calendar
} from 'lucide-react';
import { formatDurationKo, StudentHomeStudyDayRecord } from '@/lib/homeStudyTypes';
import { StudentLibrarySessionRecord, LibrarySessionActivityItem } from '@/lib/libraryAnalyticsTypes';
import { supabase } from '@/lib/supabase';

interface LibraryFolderItem {
  id?: string;
  drive_id: string;
  name: string;
  grade: string;
  parent_id?: string | null;
  type?: string;
  isParent?: boolean;
  subFolderCount?: number;
  parentPath?: string;
}

interface FolderTreeNode {
  drive_id: string;
  name: string;
  grade: string;
  parent_id?: string | null;
  subFolders: FolderTreeNode[];
  isLeaf: boolean;
}

export interface StudentEngagement {
  studentId: string;
  studentName: string;
  totalDurationSec: number;
  openCount: number;
  avgDurationSec: number;
  lastViewedAt: string;
  history: Array<{
    sessionIndex: number;
    durationSec: number;
    timestamp: string;
  }>;
}

interface FileStatItem {
  fileName: string;
  displayName: string;
  durationSec: number;
  students: Set<string>;
  studentCount: number;
  studentMap: Record<string, StudentEngagement>;
  views: number;
  solutionViews: number;
  avgDurationPerStudentSec: number;
  avgDurationPerViewSec: number;
  status: 'killer' | 'hard' | 'normal' | 'skipped';
}

interface AnalyzedFolderData {
  folderKey: string;
  folderName: string;
  grade: string;
  totalDurationSec: number;
  uniqueStudents: Set<string>;
  totalSessions: number;
  files: FileStatItem[];
  maxFileDuration: number;
  killerQuestion?: FileStatItem;
  isParent?: boolean;
  subFolderCount?: number;
  parentPath?: string;
}

const GRADES = ['전체', '고2', '고1', '고3', '중3', '중2', '중1'];

export default function LibraryContentAnalyticsTab() {
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  
  // 📅 기간 설정: 프리셋 모드(7, 14, 30일) vs 달력 직접 설정 모드(시작일-종료일)
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset');
  const [selectedDays, setSelectedDays] = useState<number>(30); // 7, 14, 30
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Raw DB data: 전용 콘텐츠 분석 세션 + 기존 가정학습 세션(과거 호환)
  const [dedicatedSessions, setDedicatedSessions] = useState<StudentLibrarySessionRecord[]>([]);
  const [rawSessions, setRawSessions] = useState<StudentHomeStudyDayRecord[]>([]);
  const [allFolders, setAllFolders] = useState<LibraryFolderItem[]>([]);

  // Tree & Cart State
  const [selectedFoldersCart, setSelectedFoldersCart] = useState<LibraryFolderItem[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [focusedFolderKey, setFocusedFolderKey] = useState<string | null>(null);
  const [hasTriggeredAnalysis, setHasTriggeredAnalysis] = useState<boolean>(false);
  const [expandedStudent, setExpandedStudent] = useState<{ fileName: string; studentName: string } | null>(null);

  // 1. 데이터 로드 (신규 전용 세션 + 기존 가정학습 세션 + 라이브러리 전체 폴더)
  const fetchData = async () => {
    setLoading(true);
    try {
      // 쿼리 파라미터 생성
      let dateQuery = '';
      if (dateMode === 'custom' && startDate && endDate) {
        dateQuery = `startDate=${startDate}&endDate=${endDate}`;
      } else {
        dateQuery = `days=${selectedDays}`;
      }

      const [dedicatedRes, legacyRes, { data: folderData, error: folderErr }] = await Promise.all([
        fetch(`/api/monitoring/library-analytics/sessions?${dateQuery}`),
        fetch(`/api/monitoring/home-study/sessions?${dateQuery}`),
        supabase
          .from('exam_library')
          .select('drive_id, name, grade, parent_id, type')
          .eq('type', 'folder')
      ]);

      const dedicatedData = await dedicatedRes.json();
      if (dedicatedData.success && Array.isArray(dedicatedData.records)) {
        setDedicatedSessions(dedicatedData.records);
      }

      const legacyData = await legacyRes.json();
      if (legacyData.success && Array.isArray(legacyData.records)) {
        setRawSessions(legacyData.records);
      }

      if (!folderErr && folderData) {
        // 쌍둥이 폴더 제외
        const cleanFolders = folderData.filter(
          (f: any) => !f.name?.includes('쌍둥이') && f.drive_id !== 'class_schedule_root_data'
        );
        setAllFolders(cleanFolders);
      }

      const now = new Date();
      setLastRefreshedAt(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to load library analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDays, dateMode]);

  // 2. 전체 폴더에 대한 맵 (ID -> 폴더, 부모 -> 자식들, 자손 탐색, 부모 경로 생성)
  const folderMaps = useMemo(() => {
    const byId = new Map<string, LibraryFolderItem>();
    const childrenMap = new Map<string, LibraryFolderItem[]>();

    allFolders.forEach(f => {
      byId.set(f.drive_id, f);
      if (f.parent_id) {
        if (!childrenMap.has(f.parent_id)) childrenMap.set(f.parent_id, []);
        childrenMap.get(f.parent_id)!.push(f);
      }
    });

    // 특정 폴더의 모든 하위 자손 폴더 리스트 재귀 반환
    const getDescendants = (parentId: string): LibraryFolderItem[] => {
      const result: LibraryFolderItem[] = [];
      const queue = [parentId];
      const visited = new Set<string>([parentId]);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const kids = childrenMap.get(cur) || [];
        for (const k of kids) {
          if (!visited.has(k.drive_id)) {
            visited.add(k.drive_id);
            result.push(k);
            queue.push(k.drive_id);
          }
        }
      }
      return result;
    };

    // 특정 폴더의 부모 경로 문자열 반환 (예: "2학기 기말 > 미적분1 모의평가")
    const getParentPath = (folder: { parent_id?: string | null }): string => {
      const parts: string[] = [];
      let cur = folder.parent_id ? byId.get(folder.parent_id) : null;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      return parts.join(' > ');
    };

    return { byId, childrenMap, getDescendants, getParentPath };
  }, [allFolders]);

  // 3. 현재 선택된 학년의 폴더 목록
  const currentGradeFolders = useMemo(() => {
    if (selectedGrade === '전체' || selectedGrade === 'ALL') {
      return allFolders;
    }
    return allFolders.filter(f => f.grade && f.grade.startsWith(selectedGrade));
  }, [allFolders, selectedGrade]);

  // 4. 계층형 트리 구성 (상위 ➔ 하위 ➔ 최하위 단원)
  const folderTree = useMemo(() => {
    const map = new Map<string, FolderTreeNode>();
    currentGradeFolders.forEach(f => {
      map.set(f.drive_id, {
        drive_id: f.drive_id,
        name: f.name,
        grade: f.grade || selectedGrade,
        parent_id: f.parent_id,
        subFolders: [],
        isLeaf: true,
      });
    });

    const roots: FolderTreeNode[] = [];
    currentGradeFolders.forEach(f => {
      const node = map.get(f.drive_id)!;
      if (f.parent_id && map.has(f.parent_id)) {
        const parent = map.get(f.parent_id)!;
        parent.subFolders.push(node);
        parent.isLeaf = false;
      } else {
        roots.push(node);
      }
    });

    // 기본적으로 최상위 루트 노드들은 펼쳐진 상태로 초기화
    const initialExpanded = new Set<string>();
    roots.forEach(r => initialExpanded.add(r.drive_id));
    setExpandedFolderIds(prev => new Set([...prev, ...initialExpanded]));

    return roots;
  }, [currentGradeFolders, selectedGrade]);

  // 학년 변경 시 장바구니 기본값 세팅 (대표 폴더 및 그 하위폴더 자동 추천 담기)
  useEffect(() => {
    if (currentGradeFolders.length > 0 && selectedFoldersCart.length === 0) {
      // '2학기 기말' 또는 기출/모의고사 대표 상위폴더 우선 추천
      const sampleParent = currentGradeFolders.find(f => 
        f.name === '2학기 기말' || f.name.includes('기말') || f.name.includes('모의')
      );
      if (sampleParent) {
        const descendants = folderMaps.getDescendants(sampleParent.drive_id);
        setSelectedFoldersCart([sampleParent, ...descendants]);
      } else {
        const top2 = currentGradeFolders.slice(0, 2);
        const autoCart: LibraryFolderItem[] = [];
        top2.forEach(p => {
          autoCart.push(p);
          const desc = folderMaps.getDescendants(p.drive_id);
          autoCart.push(...desc);
        });
        setSelectedFoldersCart(autoCart);
      }
    }
  }, [currentGradeFolders, folderMaps]);

  // 트리 폴더 접기/펼치기 토글
  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // ★ 핵심: 상위폴더를 넣으면 하위폴더도 자동으로 쏙! 들어가고, 해제 시 함께 빠지는 토글 핸들러
  const handleToggleFolderWithDescendants = (node: FolderTreeNode) => {
    const descendants = folderMaps.getDescendants(node.drive_id);
    const selfItem: LibraryFolderItem = {
      drive_id: node.drive_id,
      name: node.name,
      grade: node.grade,
      parent_id: node.parent_id,
      type: 'folder',
      isParent: descendants.length > 0,
      subFolderCount: descendants.length,
      parentPath: folderMaps.getParentPath(node)
    };

    const allToHandle: LibraryFolderItem[] = [
      selfItem,
      ...descendants.map(d => ({
        drive_id: d.drive_id,
        name: d.name,
        grade: d.grade,
        parent_id: d.parent_id,
        type: 'folder',
        isParent: folderMaps.childrenMap.has(d.drive_id),
        subFolderCount: folderMaps.getDescendants(d.drive_id).length,
        parentPath: folderMaps.getParentPath(d)
      }))
    ];

    const allIds = new Set(allToHandle.map(item => item.drive_id));

    setSelectedFoldersCart(prev => {
      const isAlreadyInCart = prev.some(item => item.drive_id === node.drive_id);
      if (isAlreadyInCart) {
        // 상위폴더 해제 -> 상위폴더 및 그 하위 폴더들 일괄 쏙 빼기!
        return prev.filter(item => !allIds.has(item.drive_id));
      } else {
        // 상위폴더 담기 -> 상위폴더 및 그 하위 폴더들 일괄 쏙 담기!
        const existingIds = new Set(prev.map(item => item.drive_id));
        const newItems = allToHandle.filter(item => !existingIds.has(item.drive_id));
        return [...prev, ...newItems];
      }
    });

    // 하위폴더가 있다면 트리를 자동으로 활짝 펼쳐서 하위폴더가 담긴 것을 시각적으로 확인
    if (descendants.length > 0) {
      setExpandedFolderIds(prev => {
        const next = new Set(prev);
        next.add(node.drive_id);
        descendants.forEach(d => {
          if (folderMaps.childrenMap.has(d.drive_id)) next.add(d.drive_id);
        });
        return next;
      });
    }
  };

  // "다 때려넣기" 핸들러 (해당 학년 전체 폴더 일괄 담기)
  const handleAddAllFolders = () => {
    if (currentGradeFolders.length === 0) return;
    const existingIds = new Set(selectedFoldersCart.map(f => f.drive_id));
    const toAdd = currentGradeFolders.filter(f => !existingIds.has(f.drive_id));
    setSelectedFoldersCart(prev => [...prev, ...toAdd]);
  };

  // 장바구니 전체 비우기
  const handleClearCart = () => {
    setSelectedFoldersCart([]);
    setFocusedFolderKey(null);
  };

  // 장바구니 개별 삭제 (상위폴더 삭제 시 그 하위폴더들도 함께 정리)
  const handleRemoveFromCart = (driveId: string) => {
    const descendants = folderMaps.getDescendants(driveId);
    const toRemoveIds = new Set([driveId, ...descendants.map(d => d.drive_id)]);

    setSelectedFoldersCart(prev => prev.filter(f => !toRemoveIds.has(f.drive_id)));
    if (focusedFolderKey && toRemoveIds.has(focusedFolderKey)) {
      setFocusedFolderKey(null);
    }
  };

  // 5. 세션 로그 파싱 및 선택된 장바구니 폴더별/파일별 체류시간 집계 (신규 전용 세션 + 기존 과거 세션 병합)
  const analyzedResults = useMemo(() => {
    if (selectedFoldersCart.length === 0) return [];

    const resultList: AnalyzedFolderData[] = selectedFoldersCart.map(folder => {
      // 이 폴더가 매칭해야 할 대상 폴더 drive_id 목록 및 이름들
      const descendants = folderMaps.getDescendants(folder.drive_id);
      const isParent = descendants.length > 0;
      const targetFolderIds = new Set([folder.drive_id, ...descendants.map(d => d.drive_id)]);
      const targetNames = [folder.name, ...descendants.map(d => d.name)];

      let totalDurationSec = 0;
      const uniqueStudents = new Set<string>();
      let totalSessions = 0;
      const fileMap: Record<string, {
        durationSec: number;
        students: Set<string>;
        studentMap: Record<string, StudentEngagement>;
        views: number;
        solutionViews: number;
      }> = {};

      // 🌟 [트랙 A: 신규 전용 콘텐츠 분석 세션 집계 (Folder ID 기반 100% 정밀 매칭)]
      dedicatedSessions.forEach(r => {
        const stName = r.student_name;
        (r.sessions || []).forEach(ses => {
          let sessionMatched = false;
          (ses.items || []).forEach(item => {
            if (!item.folderDriveId || !targetFolderIds.has(item.folderDriveId)) return;
            const dur = item.durationSec || 0;
            const views = item.openCount || 1;
            const solViews = item.solutionViews || 0;

            totalDurationSec += dur;
            uniqueStudents.add(stName);
            sessionMatched = true;

            // 순수 폴더 탐색이 아닌 개별 문항 열람인 경우
            if (item.fileName && item.fileName !== '__folder_explore__') {
              const cleanDoc = item.fileName.replace(/\.html?$/i, '');
              if (!fileMap[cleanDoc]) {
                fileMap[cleanDoc] = {
                  durationSec: 0,
                  students: new Set<string>(),
                  studentMap: {},
                  views: 0,
                  solutionViews: 0,
                };
              }
              const fileEntry = fileMap[cleanDoc];
              fileEntry.durationSec += dur;
              fileEntry.students.add(stName);
              fileEntry.views += views;
              fileEntry.solutionViews += solViews;

              if (!fileEntry.studentMap[stName]) {
                fileEntry.studentMap[stName] = {
                  studentId: r.student_id || stName,
                  studentName: stName,
                  totalDurationSec: 0,
                  openCount: 0,
                  avgDurationSec: 0,
                  lastViewedAt: ses.started_at || r.date || '',
                  history: [],
                };
              }
              const stEntry = fileEntry.studentMap[stName];
              stEntry.totalDurationSec += dur;
              stEntry.openCount += views;
              stEntry.avgDurationSec = stEntry.openCount > 0 ? Math.round(stEntry.totalDurationSec / stEntry.openCount) : 0;
              const actTime = ses.started_at || r.date || '';
              if (actTime && (!stEntry.lastViewedAt || new Date(actTime) > new Date(stEntry.lastViewedAt))) {
                stEntry.lastViewedAt = actTime;
              }
              stEntry.history.push({
                sessionIndex: stEntry.openCount,
                durationSec: dur,
                timestamp: actTime,
              });
            }
          });
          if (sessionMatched) totalSessions += 1;
        });
      });

      // 🌟 [트랙 B: 기존 레거시 세션 데이터 호환 집계 (과거 30일치 보존)]
      rawSessions.forEach(r => {
        const stName = r.student_name;
        (r.sessions || []).forEach(ses => {
          (ses.activities || []).forEach(act => {
            if (act.mode !== 'library' || (act.duration_sec || 0) <= 0) return;
            const dur = act.duration_sec || 0;
            const title = act.title || '';
            const sub = act.sub_detail || '';

            const clean = title.replace(/^라이브러리\s*>\s*/i, '').trim();
            if (!clean || clean === '홈 화면') return;

            let targetFolder = '';
            let targetDoc = '';

            const bracketMatch = clean.match(/\[(.*?)\](?:\s*>\s*(.*?))?$/);
            if (bracketMatch) {
              targetFolder = bracketMatch[1].trim();
              if (bracketMatch[2]) targetDoc = bracketMatch[2].trim();
            } else if (clean.includes('>')) {
              const parts = clean.split('>').map(p => p.trim());
              targetFolder = parts[parts.length - 2] || parts[0];
              targetDoc = parts[parts.length - 1];
            } else {
              targetFolder = clean;
            }

            // 매칭 검사:
            // 1. targetFolder가 targetNames에 포함되거나
            // 2. clean 전체 경로에 targetNames 중 하나가 포함된 경우
            const isMatch = targetNames.some(tn => 
              targetFolder === tn || 
              targetFolder.includes(tn) || 
              tn.includes(targetFolder) ||
              clean.includes(tn)
            );

            if (isMatch) {
              totalDurationSec += dur;
              uniqueStudents.add(stName);
              totalSessions += 1;

              if (targetDoc) {
                const cleanDoc = targetDoc.replace(/\.html?$/i, '');
                if (!fileMap[cleanDoc]) {
                  fileMap[cleanDoc] = {
                    durationSec: 0,
                    students: new Set<string>(),
                    studentMap: {},
                    views: 0,
                    solutionViews: 0,
                  };
                }
                const fileEntry = fileMap[cleanDoc];
                fileEntry.durationSec += dur;
                fileEntry.students.add(stName);
                fileEntry.views += 1;
                if (sub.includes('해설')) {
                  fileEntry.solutionViews += 1;
                }

                // 학생별 인게이지먼트 누적 (다회차 열람 실시간 계산)
                if (!fileEntry.studentMap[stName]) {
                  fileEntry.studentMap[stName] = {
                    studentId: r.student_id || stName,
                    studentName: stName,
                    totalDurationSec: 0,
                    openCount: 0,
                    avgDurationSec: 0,
                    lastViewedAt: ses.started_at || r.date || '',
                    history: [],
                  };
                }
                const stEntry = fileEntry.studentMap[stName];
                stEntry.totalDurationSec += dur;
                stEntry.openCount += 1;
                stEntry.avgDurationSec = stEntry.openCount > 0 ? Math.round(stEntry.totalDurationSec / stEntry.openCount) : 0;
                
                const actTime = ses.started_at || r.date || '';
                if (actTime && (!stEntry.lastViewedAt || new Date(actTime) > new Date(stEntry.lastViewedAt))) {
                  stEntry.lastViewedAt = actTime;
                }
                stEntry.history.push({
                  sessionIndex: stEntry.openCount,
                  durationSec: dur,
                  timestamp: actTime,
                });
              }
            }
          });
        });
      });

      // 파일 리스트 정렬
      const fileList: FileStatItem[] = Object.entries(fileMap).map(([fileName, data]) => {
        let status: 'killer' | 'hard' | 'normal' | 'skipped' = 'normal';
        if (data.durationSec >= 3600 || (data.durationSec >= 1800 && data.solutionViews >= 3)) {
          status = 'killer';
        } else if (data.durationSec >= 1200) {
          status = 'hard';
        } else if (data.durationSec === 0) {
          status = 'skipped';
        }

        const numMatch = fileName.match(/(\d+)/);
        const displayName = numMatch ? `${parseInt(numMatch[1], 10)}번 문항 (${fileName}.html)` : `${fileName}.html`;
        const studentCount = data.students.size;
        const avgDurationPerStudentSec = studentCount > 0 ? Math.round(data.durationSec / studentCount) : 0;
        const avgDurationPerViewSec = data.views > 0 ? Math.round(data.durationSec / data.views) : 0;

        return {
          fileName,
          displayName,
          durationSec: data.durationSec,
          students: data.students,
          studentCount,
          studentMap: data.studentMap,
          views: data.views,
          solutionViews: data.solutionViews,
          avgDurationPerStudentSec,
          avgDurationPerViewSec,
          status,
        };
      });

      fileList.sort((a, b) => b.durationSec - a.durationSec);

      let maxFSec = 1;
      fileList.forEach(f => {
        if (f.durationSec > maxFSec) maxFSec = f.durationSec;
      });

      return {
        folderKey: folder.drive_id,
        folderName: folder.name,
        grade: folder.grade || selectedGrade,
        totalDurationSec,
        uniqueStudents,
        totalSessions,
        files: fileList,
        maxFileDuration: maxFSec,
        killerQuestion: fileList.length > 0 && fileList[0].durationSec >= 1800 ? fileList[0] : undefined,
        isParent,
        subFolderCount: descendants.length,
        parentPath: folderMaps.getParentPath(folder),
      };
    });

    // 폴더 총 체류시간 높은 순 정렬
    resultList.sort((a, b) => b.totalDurationSec - a.totalDurationSec);

    return resultList;
  }, [selectedFoldersCart, dedicatedSessions, rawSessions, selectedGrade, folderMaps]);

  // 분석 실행 및 스무스 스크롤 트리거
  const handleStartAnalysis = () => {
    if (selectedFoldersCart.length === 0) {
      alert('먼저 좌측 트리에서 분석할 폴더를 장바구니에 담아주세요!');
      return;
    }
    setHasTriggeredAnalysis(true);
    if (!focusedFolderKey && analyzedResults.length > 0) {
      setFocusedFolderKey(analyzedResults[0].folderKey);
    }
    setTimeout(() => {
      const el = document.getElementById('analysis-result-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  // 현재 포커스된 폴더 (파일 단위 미시 분석 대상)
  const currentFocusedFolder = useMemo(() => {
    if (!focusedFolderKey) return analyzedResults[0] || null;
    return analyzedResults.find(r => r.folderKey === focusedFolderKey) || analyzedResults[0] || null;
  }, [analyzedResults, focusedFolderKey]);

  // 폴더별 최대 체류시간 (프로그레스 바용)
  const maxFolderDuration = useMemo(() => {
    let max = 1;
    analyzedResults.forEach(r => {
      if (r.totalDurationSec > max) max = r.totalDurationSec;
    });
    return max;
  }, [analyzedResults]);

  // CSV 내보내기 (선택된 폴더 및 파일별 세부 통계)
  const handleExportCSV = () => {
    if (analyzedResults.length === 0) {
      alert('내보낼 분석 데이터가 없습니다.');
      return;
    }

    const headers = ['폴더구분', '폴더명', '소속경로', '문항(파일명)', '총체류(분)', '학생수(명)', '열람세션(회)', '해설열람비율(%)', '특성'];
    const rows: (string | number)[][] = [];

    analyzedResults.forEach(folder => {
      const folderType = folder.isParent ? `상위통합(${folder.subFolderCount}개)` : '단원';
      if (folder.files.length === 0) {
        rows.push([
          folderType,
          folder.folderName,
          folder.parentPath || '-',
          '세부 파일 없음(폴더열람)',
          Math.round(folder.totalDurationSec / 60),
          folder.uniqueStudents.size,
          folder.totalSessions,
          0,
          '폴더 탐색'
        ]);
      } else {
        folder.files.forEach(file => {
          const avgPerStudentMin = file.studentCount > 0 ? (file.durationSec / 60 / file.studentCount).toFixed(1) : '0';
          rows.push([
            folderType,
            folder.folderName,
            folder.parentPath || '-',
            file.displayName,
            Math.round(file.durationSec / 60),
            file.studentCount,
            file.views,
            avgPerStudentMin,
            file.status === 'killer' ? '최고난도킬러' : file.status === 'hard' ? '고난도' : '표준문항'
          ]);
        });
      }
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(',')).join('\n')];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Eduest_라이브러리_문항체류분석_${selectedGrade}_${selectedDays}일간.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 재귀적 폴더 트리 노드 렌더러
  const renderTreeNode = (node: FolderTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolderIds.has(node.drive_id);
    const isSelected = selectedFoldersCart.some(f => f.drive_id === node.drive_id);
    const descendants = folderMaps.getDescendants(node.drive_id);
    const hasChildren = node.subFolders.length > 0 || descendants.length > 0;
    const descendantCount = descendants.length;

    return (
      <div key={node.drive_id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold transition-all ${
            isSelected
              ? 'bg-violet-100/70 text-violet-900 border border-violet-300'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${Math.max(depth * 14 + 8, 8)}px` }}
        >
          <div
            onClick={() => hasChildren && toggleFolderExpand(node.drive_id)}
            className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none flex-1"
          >
            {hasChildren ? (
              <span className="text-slate-400">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : (
              <span className="w-3.5" />
            )}
            <span className={isSelected ? 'text-violet-700' : 'text-amber-600'}>
              {hasChildren ? (isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />) : <Library size={14} />}
            </span>
            <span className="truncate" title={node.name}>
              {node.name}
            </span>
            {hasChildren && (
              <span className="text-[10px] text-violet-700 bg-violet-100 px-1.5 py-0.2 rounded-md font-extrabold shrink-0">
                하위 {descendantCount}개
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleToggleFolderWithDescendants(node)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer ${
              isSelected
                ? 'bg-violet-600 text-white shadow-2xs hover:bg-violet-700'
                : hasChildren
                ? 'bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border border-violet-200'
                : 'bg-white hover:bg-violet-50 text-slate-600 hover:text-violet-700 border border-slate-200'
            }`}
          >
            {isSelected 
              ? (hasChildren ? '✓ 하위포함 담김' : '✓ 담김') 
              : (hasChildren ? `+ 하위(${descendantCount}개) 쏙 담기` : '+ 담기')}
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 border-l-2 border-slate-200 ml-4 pl-1">
            {node.subFolders.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const cartParentCount = useMemo(() => {
    return selectedFoldersCart.filter(f => folderMaps.getDescendants(f.drive_id).length > 0).length;
  }, [selectedFoldersCart, folderMaps]);

  const cartChildCount = selectedFoldersCart.length - cartParentCount;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      
      {/* 1. 상단 타이틀 배너 */}
      <div className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 text-white border border-violet-800/50 rounded-3xl p-6 sm:p-7 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <span>📚 라이브러리 컨텐츠 활용 및 이용률 분석실</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 font-extrabold border border-violet-400/30">
                v1.2 계층형 자동 연동
              </span>
            </span>
          </div>
          <p className="text-xs font-medium text-slate-300 leading-relaxed">
            상위폴더를 담으면 <strong>모든 하위폴더까지 자동으로 쏙! 들어가서 주욱 정밀 분석</strong>됩니다.
            폴더 단위 총 체류시간뿐만 아니라 <strong>그 안의 개별 문항(0001, 0012...)마다 머문 시간까지 촥!</strong> 시각화합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-300 bg-white/10 px-3 py-1.5 rounded-2xl border border-white/10">
            상위 ➔ 하위 자동 포함 분석 지원
          </span>
        </div>
      </div>

      {/* 2. 필터 툴바 (학년 선택 + 분석 기간) */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* 학년 탭 버튼 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-xs font-black text-slate-400 mr-1 shrink-0">학년:</span>
          {GRADES.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGrade(g)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition-all cursor-pointer shrink-0 ${
                selectedGrade === g
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-105'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {g === '전체' ? '전체 학년' : `${g} 라이브러리`}
            </button>
          ))}
        </div>

        {/* 기간 선택 + 달력 시작-종료 설정 + 새로고침 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 기간 템플릿 드롭다운 */}
          <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 gap-1.5">
            <Clock size={13} className="text-violet-600 shrink-0" />
            <select
              value={dateMode === 'custom' ? 'custom' : selectedDays}
              onChange={e => {
                if (e.target.value === 'custom') {
                  setDateMode('custom');
                } else {
                  setDateMode('preset');
                  setSelectedDays(Number(e.target.value));
                }
              }}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
            >
              <option value={7}>최근 7일간</option>
              <option value={14}>최근 14일간 (2주)</option>
              <option value={30}>최근 30일간 (한 달)</option>
              <option value="custom">📅 직접 기간 설정 (달력)</option>
            </select>
          </div>

          {/* 달력 날짜 범위 (시작일 ~ 종료일) 설정 인풋 */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-2xl border border-slate-200 text-xs">
            <Calendar size={13} className="text-violet-600 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setDateMode('custom');
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer"
              title="분석 시작일"
            />
            <span className="text-slate-400 font-bold">~</span>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setDateMode('custom');
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer"
              title="분석 종료일"
            />
            {dateMode === 'custom' && (
              <button
                type="button"
                onClick={fetchData}
                className="px-2 py-0.5 rounded-lg bg-violet-600 text-white text-[11px] font-black hover:bg-violet-700 transition-all cursor-pointer shadow-2xs"
              >
                조회
              </button>
            )}
          </div>

          {/* 새로고침 버튼 + 갱신 시간 */}
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1.5 p-2 px-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-all cursor-pointer shadow-2xs"
            title="최신 분석 데이터 불러오기"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin text-violet-600' : ''} />
            <span className="text-[11px] font-bold hidden sm:inline">
              {lastRefreshedAt ? `${lastRefreshedAt} 갱신` : '새로고침'}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 상단 2분할 섹션: 좌측 계층형 폴더 트리 vs 우측 분석 장바구니 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 좌측: 계층형 라이브러리 폴더 트리 (7열) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Folder size={16} className="text-violet-600" />
                <span>[{selectedGrade === '전체' ? '전체' : selectedGrade}] 라이브러리 폴더 트리 탐색</span>
              </div>
              <span className="text-[11px] font-extrabold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md">
                상위 클릭 시 하위 자동 포함
              </span>
            </div>

            {/* 트리 스크롤 영역 */}
            <div className="max-h-80 overflow-y-auto pt-3 pr-1 space-y-1">
              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 size={24} className="animate-spin text-violet-600" />
                  <span className="text-xs font-bold">폴더 트리를 구성하는 중...</span>
                </div>
              ) : folderTree.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">
                  해당 학년에 등록된 폴더가 없습니다.
                </div>
              ) : (
                folderTree.map(node => renderTreeNode(node))
              )}
            </div>
          </div>

          {/* 치트키 버튼: "다 때려넣기" */}
          <button
            type="button"
            onClick={handleAddAllFolders}
            className="w-full py-2.5 rounded-2xl bg-slate-50 hover:bg-violet-50 text-violet-700 hover:text-violet-900 border-1.5 border-dashed border-violet-300 font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles size={14} className="text-violet-600" />
            <span>✨ {selectedGrade === '전체' ? '전체' : selectedGrade} 폴더 장바구니에 '다 때려넣기' ({currentGradeFolders.length}개 일괄 담기 🧺)</span>
          </button>
        </div>

        {/* 우측: 분석 대상 장바구니 (5열) */}
        <div className="lg:col-span-5 bg-white border-2 border-violet-500/80 rounded-3xl p-5 sm:p-6 shadow-md shadow-violet-100 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-violet-100">
              <div className="text-sm font-black text-violet-950 flex items-center gap-2">
                <ShoppingCart size={16} className="text-violet-600" />
                <span>분석 대상 장바구니 ({selectedFoldersCart.length}개)</span>
              </div>
              {selectedFoldersCart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>전체 비우기</span>
                </button>
              )}
            </div>

            {/* 담긴 폴더 칩 스크롤 */}
            <div className="max-h-72 overflow-y-auto pt-3 pr-1 space-y-2">
              {selectedFoldersCart.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-400 flex items-center justify-center mx-auto">
                    <ShoppingCart size={20} />
                  </div>
                  <div className="text-xs font-black text-slate-700">장바구니가 비어 있습니다.</div>
                  <div className="text-[11px] font-bold text-slate-400 leading-relaxed">
                    좌측 트리에서 상위폴더의 <strong>[+ 하위 쏙 담기]</strong> 버튼을 누르면 모든 하위폴더까지 함께 쏙 들어옵니다!
                  </div>
                </div>
              ) : (
                selectedFoldersCart.map(f => {
                  const descendants = folderMaps.getDescendants(f.drive_id);
                  const isParent = descendants.length > 0;
                  const parentPath = folderMaps.getParentPath(f);

                  return (
                    <div
                      key={f.drive_id}
                      className={`p-3 border rounded-2xl flex items-center justify-between gap-2 text-xs transition-all ${
                        isParent
                          ? 'bg-purple-100/70 border-purple-300 shadow-2xs'
                          : 'bg-violet-50/70 border-violet-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={isParent ? 'text-purple-700' : 'text-violet-600'}>
                          {isParent ? <FolderOpen size={16} /> : <Library size={14} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 truncate" title={f.name}>
                              {f.name}
                            </span>
                            {isParent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-600 text-white font-extrabold shrink-0">
                                상위 (+하위 {descendants.length}개)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold truncate">
                            {parentPath ? `${parentPath} > ` : ''}{f.grade} 라이브러리
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(f.drive_id)}
                        className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                        title={isParent ? '상위 및 하위폴더 함께 장바구니에서 빼기' : '장바구니에서 빼기'}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 장바구니 요약 & 메인 액션 버튼 */}
          <div className="space-y-2.5 pt-2">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-2xl text-[11px] font-bold text-purple-900 text-center">
              💡 선택된 <strong>총 {selectedFoldersCart.length}개 폴더</strong> (상위 {cartParentCount}개 · 하위 단원 {cartChildCount}개)를 하단에 주욱 분석합니다.
            </div>

            <button
              type="button"
              onClick={handleStartAnalysis}
              disabled={selectedFoldersCart.length === 0}
              className={`w-full py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedFoldersCart.length > 0
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-violet-200 scale-100 hover:scale-101'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              <span>🚀 선택한 폴더 심층 분석 시작 (하단으로 쪼로록 이동)</span>
              <ArrowDown size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 4. 하단 분석 결과 섹션 (쪼로록 자동 이동 스크롤 위치) */}
      {/* ========================================================================= */}
      <div id="analysis-result-section" className="space-y-5 pt-4">
        
        {/* 섹션 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-slate-200">
          <div>
            <div className="text-base font-black text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-violet-600" />
              <span>📊 선택 폴더 분석 결과 & 파일(문항) 단위 미시 체류시간 시각화</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold border border-violet-200">
                {selectedFoldersCart.length}개 폴더 분석
              </span>
            </div>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              폴더를 클릭하면 그 안에서 <strong>학생들이 가장 오래 고민한 킬러 문항과 건너뛴 문항</strong>이 우측에 실시간으로 펼쳐집니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-all cursor-pointer shadow-2xs"
            >
              <Download size={13} className="text-violet-600" />
              <span>세부 CSV 내보내기</span>
            </button>
          </div>
        </div>

        {/* 2분할 결과 그리드 (좌측: 폴더간 체류 랭킹 5열 + 우측: 파일/문항 미시 분석 7열) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* 하단 좌측: 선택된 폴더 간 총 체류시간 랭킹 (5열) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Library size={15} className="text-violet-600" />
                  선택 폴더 간 총 체류시간 랭킹
                </span>
                <span className="text-[10px] font-extrabold text-violet-700">
                  폴더 클릭 시 우측 파일 전환!
                </span>
              </div>

              {analyzedResults.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">
                  장바구니에 담긴 폴더가 없습니다.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {analyzedResults.map((folder, idx) => {
                    const isFocused = currentFocusedFolder?.folderKey === folder.folderKey;
                    const pct = Math.max(Math.round((folder.totalDurationSec / maxFolderDuration) * 100), folder.totalDurationSec > 0 ? 8 : 2);

                    return (
                      <div
                        key={folder.folderKey}
                        onClick={() => setFocusedFolderKey(folder.folderKey)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                          isFocused
                            ? 'border-violet-500 bg-violet-50/50 shadow-sm shadow-violet-100'
                            : 'border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                              idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-slate-900 truncate" title={folder.folderName}>
                                  {folder.folderName}
                                </span>
                                {folder.isParent && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 font-bold border border-purple-200 shrink-0">
                                    📂 상위 통합 ({folder.subFolderCount}개)
                                  </span>
                                )}
                              </div>
                              {folder.parentPath && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  소속: {folder.parentPath}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs font-black shrink-0 ${isFocused ? 'text-violet-700' : 'text-slate-800'}`}>
                            {formatDurationKo(folder.totalDurationSec)}
                          </span>
                        </div>

                        {/* 프로그레스 바 */}
                        <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              idx === 0
                                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600'
                                : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* 하단 메타정보 */}
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-0.5">
                          <span>이용 학생: <strong className="text-slate-800">{folder.uniqueStudents.size}명</strong> · {folder.totalSessions}회</span>
                          <span className={isFocused ? 'text-violet-700 font-extrabold' : 'text-slate-400'}>
                            {isFocused ? '👉 우측에 문항 분석 중' : '클릭하여 문항 보기'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] font-medium text-slate-600 leading-relaxed">
              💡 <strong>선생님 요약:</strong> 상위폴더를 넣으면 하위 모든 단원 폴더가 자동 포함되어, 각 단원별 체류시간 순위 및 미이용 단원이 한눈에 비교됩니다.
            </div>
          </div>

          {/* 하단 우측: 최하위 파일(문항) 단위 미시 체류시간 시각화 (7열) */}
          <div className="lg:col-span-7 bg-white border-2 border-purple-300 rounded-3xl p-5 sm:p-6 shadow-md shadow-purple-50 space-y-4 flex flex-col justify-between">
            <div>
              {/* 포커스된 폴더 배너 */}
              <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                    <FileText size={14} className="text-purple-700" />
                    <span>
                      [{currentFocusedFolder?.folderName || '선택된 폴더'}]
                      {currentFocusedFolder?.isParent ? ' (하위 통합)' : ''} ➔ 문항(파일)별 머문 시간 랭킹
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-purple-700/80 mt-0.5">
                    총 {currentFocusedFolder?.files.length || 0}개 파일 열람 기록 · {currentFocusedFolder?.isParent ? '전체 하위 단원 통합 ' : ''}학생들이 가장 오래 고민한 킬러 문항 분석
                  </div>
                </div>
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-purple-200 text-purple-900">
                  {currentFocusedFolder?.isParent ? 'Aggregate Drill-Down' : 'Micro Drill-Down'}
                </span>
              </div>

              {/* 파일 목록 테이블 */}
              {!currentFocusedFolder || currentFocusedFolder.files.length === 0 ? (
                <div className="py-16 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-xs font-black text-slate-700">이 폴더에는 아직 세부 파일 열람 기록이 없습니다.</div>
                  <div className="text-[11px] font-bold text-slate-400">
                    학생들이 이 폴더 내 문항(HTML)을 열람하면 실시간으로 여기에 순위가 집계됩니다.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {currentFocusedFolder.files.map((file, fIdx) => {
                    const fPct = Math.max(Math.round((file.durationSec / currentFocusedFolder.maxFileDuration) * 100), file.durationSec > 0 ? 8 : 2);
                    const isKiller = file.status === 'killer';
                    const isHard = file.status === 'hard';

                    return (
                      <div
                        key={file.fileName}
                        className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                          isKiller
                            ? 'bg-rose-50/50 border-rose-200 shadow-2xs'
                            : isHard
                            ? 'bg-amber-50/40 border-amber-200'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                              isKiller ? 'bg-rose-200 text-rose-900' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {fIdx + 1}
                            </span>
                            <span className="text-xs font-black text-slate-900 truncate">
                              {file.displayName}
                            </span>
                            {isKiller && (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shrink-0">
                                🔥 최고 난도 킬러 문항
                              </span>
                            )}
                            {isHard && (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                                ⚡ 오답 고난도
                              </span>
                            )}
                          </div>

                          {/* 우측 시간 영역: 상단 총 누적시간, 하단 학생평균 */}
                          <div className="text-right shrink-0">
                            <div className={`text-xs font-black ${isKiller ? 'text-rose-700' : 'text-slate-900'}`}>
                              총 {formatDurationKo(file.durationSec)}
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                              학생 평균: <span className="font-extrabold text-slate-700">{formatDurationKo(file.avgDurationPerStudentSec)}</span>
                            </div>
                          </div>
                        </div>

                        {/* 파일 체류 바 */}
                        <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isKiller ? 'bg-rose-500' : isHard ? 'bg-amber-500' : 'bg-violet-500'
                            }`}
                            style={{ width: `${fPct}%` }}
                          />
                        </div>

                        {/* 파일 세부 통계 & 학생 클릭 인터랙티브 칩 */}
                        <div className="space-y-2 pt-0.5">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold text-slate-500">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-600 font-extrabold">
                                이용 학생 <strong className="text-slate-900 font-black">{file.studentCount}명</strong>:
                              </span>
                              {Object.values(file.studentMap || {}).map((st) => {
                                const isSelected = expandedStudent?.fileName === file.fileName && expandedStudent?.studentName === st.studentName;
                                const isRepeat = st.openCount >= 2;

                                return (
                                  <button
                                    key={st.studentName}
                                    type="button"
                                    onClick={() => {
                                      setExpandedStudent(prev =>
                                        prev?.fileName === file.fileName && prev?.studentName === st.studentName
                                          ? null
                                          : { fileName: file.fileName, studentName: st.studentName }
                                      );
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-violet-600 text-white shadow-2xs ring-1 ring-violet-400 font-black'
                                        : 'bg-white border border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/60'
                                    }`}
                                    title="클릭하여 학생의 누적 열람시간 및 횟수 확인"
                                  >
                                    <span>👤</span>
                                    <span>{st.studentName}</span>
                                    <span className={`text-[9px] px-1 py-0.2 rounded ${
                                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 font-semibold'
                                    }`}>
                                      {formatDurationKo(st.totalDurationSec)} · {st.openCount}회{isRepeat ? ' 🔥' : ''}
                                    </span>
                                    <span className="text-[8px] opacity-75">{isSelected ? '▲' : '▾'}</span>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="text-[10px] font-bold text-slate-400 shrink-0">
                              누적 열람: <strong className="text-slate-700">{file.views}회</strong>
                              {file.views > 0 && (
                                <span className="ml-1 text-slate-400">(회당 평균 {formatDurationKo(file.avgDurationPerViewSec)})</span>
                              )}
                            </div>
                          </div>

                          {/* 학생 클릭 시 인라인으로 열리는 정밀 인게이지먼트 카드 */}
                          {expandedStudent?.fileName === file.fileName && file.studentMap[expandedStudent.studentName] && (() => {
                            const st = file.studentMap[expandedStudent.studentName];
                            const isRepeat = st.openCount >= 2;
                            return (
                              <div className="p-3 bg-white rounded-xl border border-violet-200 shadow-2xs space-y-2 text-[11px]">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-violet-950 flex items-center gap-1">
                                      🎯 <strong>{st.studentName}</strong> 학생 열람 정밀 리포트
                                    </span>
                                    {isRepeat ? (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800">
                                        반복 학습형 🔥 ({st.openCount}회 열람)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                        1회 열람
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStudent(null)}
                                    className="text-[10px] text-slate-400 hover:text-slate-600 font-bold px-1 cursor-pointer"
                                  >
                                    닫기 ✕
                                  </button>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5 text-center">
                                  <div className="bg-violet-50/70 p-1.5 rounded-lg border border-violet-100">
                                    <div className="text-[9px] font-bold text-violet-700">총 누적 열람시간</div>
                                    <div className="text-xs font-black text-violet-950 mt-0.5">{formatDurationKo(st.totalDurationSec)}</div>
                                  </div>
                                  <div className="bg-indigo-50/70 p-1.5 rounded-lg border border-indigo-100">
                                    <div className="text-[9px] font-bold text-indigo-700">누적 열람 횟수</div>
                                    <div className="text-xs font-black text-indigo-950 mt-0.5">{st.openCount}회</div>
                                  </div>
                                  <div className="bg-amber-50/70 p-1.5 rounded-lg border border-amber-100">
                                    <div className="text-[9px] font-bold text-amber-700">회당 평균 체류</div>
                                    <div className="text-xs font-black text-amber-950 mt-0.5">{formatDurationKo(st.avgDurationSec)}</div>
                                  </div>
                                </div>

                                {st.history.length > 1 && (
                                  <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center gap-2 overflow-x-auto">
                                    <span className="font-bold text-slate-700 shrink-0">📌 회차별:</span>
                                    {st.history.map((h, hIdx) => (
                                      <span key={hIdx} className="inline-flex items-center gap-1 shrink-0">
                                        <span className="font-semibold text-slate-600">{hIdx + 1}회차:</span>
                                        <strong className={hIdx === st.history.length - 1 ? 'text-violet-700 font-black' : 'text-slate-800'}>
                                          {formatDurationKo(h.durationSec)}
                                        </strong>
                                        {hIdx < st.history.length - 1 && <span className="text-slate-300">➔</span>}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 선생님 코칭 인사이트 박스 */}
            {currentFocusedFolder && currentFocusedFolder.files.length > 0 && currentFocusedFolder.files[0].durationSec >= 1800 && (
              <div className="p-3.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl text-[11px] font-bold text-purple-950 leading-relaxed shadow-2xs">
                🎯 <strong>선생님 코칭 인사이트:</strong>{' '}
                <strong>{currentFocusedFolder.files[0].displayName}</strong>에 학생들이 총{' '}
                <strong className="text-rose-600">{formatDurationKo(currentFocusedFolder.files[0].durationSec)}</strong>을 머물며 해설을 집중 열람했습니다.{' '}
                <strong>다음 정규 수업 시 이 문항에 대한 심화 변형 풀이</strong>를 진행하시는 것을 적극 추천합니다!
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
