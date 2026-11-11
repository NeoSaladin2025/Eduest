'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Microscope,
  FolderTree,
  Folder,
  FolderOpen,
  FileCode,
  Flame,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  Loader2,
  BookOpen,
  Layers,
  Compass,
  FileText
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import QuestionDeepReportModal, { QuestionReportItem } from './QuestionDeepReportModal';

interface LibraryFolderItem {
  id?: string;
  drive_id: string;
  name: string;
  grade: string;
  parent_id?: string | null;
  type?: string;
}

interface FolderTreeNode {
  drive_id: string;
  name: string;
  grade: string;
  parent_id?: string | null;
  subFolders: FolderTreeNode[];
  isLeaf: boolean;
}

interface FolderArchiveData {
  folderDriveId: string;
  folderName: string;
  grade: string;
  totalQuestions: number;
  killerCount: number;
  semiKillerCount: number;
  standardCount: number;
  basicCount: number;
  killerRatio: number;
  semiKillerRatio: number;
  avgScore: number;
  examRating: string;
  questions: QuestionReportItem[];
  analyzedAt: string;
}

const GRADES = ['고2', '고1', '고3', '중3', '중2', '중1', '전체'];

export default function LibraryDeepAnalysisMain() {
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  const [loadingFolders, setLoadingFolders] = useState<boolean>(true);
  const [allFolders, setAllFolders] = useState<LibraryFolderItem[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // 선택된 대상 폴더
  const [selectedFolder, setSelectedFolder] = useState<LibraryFolderItem | null>(null);

  // 아카이브 조회 상태 및 데이터 (Web UI는 순수 뷰어 역할)
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [archiveData, setArchiveData] = useState<FolderArchiveData | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  // 상세 모달
  const [modalQuestion, setModalQuestion] = useState<QuestionReportItem | null>(null);

  // 1. 전체 폴더 로드
  const fetchFolders = async () => {
    setLoadingFolders(true);
    try {
      const { data, error } = await supabase
        .from('exam_library')
        .select('drive_id, name, grade, parent_id, type')
        .eq('type', 'folder');

      if (!error && data) {
        const clean = data.filter((f: any) => !f.name?.includes('쌍둥이') && f.drive_id !== 'class_schedule_root_data');
        setAllFolders(clean);
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // 2. 현재 학년 폴더 및 계층 트리
  const currentGradeFolders = useMemo(() => {
    if (selectedGrade === '전체' || selectedGrade === 'ALL') return allFolders;
    return allFolders.filter(f => f.grade && f.grade.startsWith(selectedGrade));
  }, [allFolders, selectedGrade]);

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

    const initExp = new Set<string>();
    roots.forEach(r => initExp.add(r.drive_id));
    setExpandedFolderIds(prev => new Set([...prev, ...initExp]));

    return roots;
  }, [currentGradeFolders, selectedGrade]);

  // 학년 변경 시 대표 기출 폴더(예: 4차) 자동 선택
  useEffect(() => {
    if (currentGradeFolders.length > 0 && !selectedFolder) {
      const target = currentGradeFolders.find(f => f.name === '4차' || f.name.includes('4차')) ||
        currentGradeFolders.find(f => f.name.includes('기출') || f.name.includes('모의')) ||
        currentGradeFolders[0];

      if (target) {
        setSelectedFolder(target);
      }
    }
  }, [currentGradeFolders, selectedFolder]);

  // 3. 선택된 폴더의 아카이빙된 분석 데이터 조회 (Web UI는 순수 조회만 수행)
  const fetchAnalysis = async (folder: LibraryFolderItem) => {
    setLoadingAnalysis(true);
    try {
      const url = `/api/monitoring/library-deep-analysis?folderId=${folder.drive_id}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.archive) {
        setArchiveData(json.archive);
      } else {
        setArchiveData(null);
      }
    } catch (err) {
      console.error('Failed to fetch analysis:', err);
      setArchiveData(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    if (selectedFolder) {
      fetchAnalysis(selectedFolder);
    }
  }, [selectedFolder]);

  // 트리 노드 토글
  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // 필터링된 문항 목록
  const filteredQuestions = useMemo(() => {
    if (!archiveData?.questions) return [];
    if (activeFilter === 'KILLER') return archiveData.questions.filter(q => q.aiTier === 'KILLER');
    if (activeFilter === 'SEMI_KILLER') return archiveData.questions.filter(q => q.aiTier === 'SEMI_KILLER');
    if (activeFilter === 'STANDARD') return archiveData.questions.filter(q => q.aiTier === 'STANDARD' || q.aiTier === 'BASIC');
    return archiveData.questions;
  }, [archiveData, activeFilter]);

  // CSV 내보내기
  const handleExportCSV = () => {
    if (!archiveData || archiveData.questions.length === 0) {
      alert('내보낼 분석 데이터가 없습니다.');
      return;
    }

    const headers = ['문항번호', '파일명', 'AI난이도(점수)', '난이도등급', '풀이단계', '핵심개념', '오답함정', '수업코칭팁'];
    const rows = archiveData.questions.map(q => [
      q.qNum,
      q.fileName,
      q.aiScore,
      q.aiTier === 'KILLER' ? '최고난도킬러' : q.aiTier === 'SEMI_KILLER' ? '준킬러' : '표준',
      `${q.stepsCount}단계`,
      q.coreConcepts.join(' / '),
      q.trapPoint.replace(/,/g, ' '),
      q.coachingTip.replace(/,/g, ' ')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(',')).join('\n')];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Eduest_문항난이도진단_${archiveData.folderName}_${selectedGrade}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 재귀적 폴더 트리 노드 렌더러
  const renderTreeNode = (node: FolderTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolderIds.has(node.drive_id);
    const isSelected = selectedFolder?.drive_id === node.drive_id;
    const hasChildren = node.subFolders.length > 0;

    return (
      <div key={node.drive_id} className="space-y-1">
        <div
          onClick={() => {
            setSelectedFolder({
              drive_id: node.drive_id,
              name: node.name,
              grade: node.grade,
              parent_id: node.parent_id,
            });
            if (hasChildren) toggleFolderExpand(node.drive_id);
          }}
          className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            isSelected
              ? 'bg-violet-600 text-white shadow-xs scale-101'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${Math.max(depth * 14 + 8, 8)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <span className={isSelected ? 'text-violet-200' : 'text-slate-400'}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : (
              <span className="w-3.5" />
            )}
            <span className={isSelected ? 'text-white' : hasChildren ? 'text-amber-500' : 'text-violet-600'}>
              {hasChildren ? (isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileCode size={14} />}
            </span>
            <span className="truncate" title={node.name}>
              {node.name}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {hasChildren && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${
                isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {node.subFolders.length}
              </span>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 border-l-2 border-slate-200 ml-4 pl-1">
            {node.subFolders.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      
      {/* 1. 상단 타이틀 배너 */}
      <div className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 text-white border border-violet-800/50 rounded-3xl p-6 sm:p-7 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <Microscope size={24} className="text-violet-300" />
              <span>라이브러리 및 모의평가 문제 AI 난이도 정밀 분석 센터</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/30 text-violet-200 font-extrabold border border-violet-400/30">
              MCP Analysis Viewer
            </span>
          </div>
          <p className="text-xs font-medium text-slate-300 leading-relaxed">
            대화창에서 AI(MCP)에게 문제 분석을 지시하면, AI가 구글 드라이브 HTML 문제(수식, 핵심개념, 함정, 풀이단계)를 심층 분석하여
            이곳에 아카이빙합니다. 웹 화면은 아카이빙된 정밀 진단서를 언제든지 열람하고 인쇄할 수 있는 전용 뷰어입니다.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-[11px] font-bold text-violet-200 bg-violet-900/60 border border-violet-700/50 px-3.5 py-2 rounded-2xl flex items-center gap-1.5">
            <Sparkles size={14} className="text-violet-300" />
            <span>AI MCP 연동 아카이브</span>
          </div>
        </div>
      </div>

      {/* 2. 학년 필터 바 */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-2xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-xs font-black text-slate-400 mr-1 shrink-0">학년:</span>
          {GRADES.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setSelectedGrade(g);
                setSelectedFolder(null);
              }}
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

        <button
          type="button"
          onClick={() => {
            fetchFolders();
            if (selectedFolder) fetchAnalysis(selectedFolder);
          }}
          className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
          title="새로고침"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* 3. 메인 그리드: 좌측 트리(4열) vs 우측 분석 아카이브(8열) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 좌측: 폴더 탐색 트리 (4열) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FolderTree size={16} className="text-violet-600" />
                <span>라이브러리 및 모의평가 폴더</span>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                {currentGradeFolders.length}개 폴더
              </span>
            </div>

            {/* 트리 스크롤 영역 */}
            <div className="space-y-1.5 text-xs max-h-[580px] overflow-y-auto pr-1">
              {loadingFolders ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 size={24} className="animate-spin text-violet-600" />
                  <span className="text-xs font-bold">폴더 목록을 불러오는 중...</span>
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

          <div className="p-3 bg-violet-50 border border-violet-200/80 rounded-2xl text-[11px] font-bold text-violet-900 leading-relaxed">
            💡 <strong>안내:</strong> 폴더를 클릭하시면 해당 폴더의 아카이빙된 AI 문항 난이도 진단서를 즉시 열람하실 수 있습니다.
          </div>
        </div>

        {/* 우측: 선택 폴더 AI 난이도 & 아카이빙 대시보드 (8열) */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* 폴더 요약 & KPI 배너 */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-md">
                    선택 폴더
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {selectedGrade} 라이브러리 &gt; {selectedFolder?.name || '폴더 선택 필요'}
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
                  <span>[{selectedFolder?.name || '폴더를 선택해주세요'}] 문항별 AI 난이도 정밀 진단서</span>
                  {archiveData && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200">
                      아카이빙 완료 ({archiveData.totalQuestions}문항)
                    </span>
                  )}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={!archiveData}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Download size={13} className="text-slate-600" />
                  <span>CSV 내보내기</span>
                </button>
              </div>
            </div>

            {/* 로딩 / 빈 상태 / KPI 4분할 카드 */}
            {loadingAnalysis ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={28} className="animate-spin text-violet-600" />
                <span className="text-xs font-bold text-slate-700">분석 아카이브를 불러오는 중...</span>
              </div>
            ) : !archiveData ? (
              <div className="py-14 px-6 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center shadow-xs">
                  <BookOpen size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800">
                    아직 등록된 AI 분석 리포트가 없습니다
                  </h3>
                  <p className="text-xs text-slate-500 font-medium max-w-md">
                    선택하신 <strong>[{selectedFolder?.name || '폴더'}]</strong>는 아직 MCP 문항 정밀 분석이 수행되지 않은 상태입니다.
                  </p>
                </div>
                <div className="mt-2 p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 max-w-lg shadow-2xs">
                  💡 대화창에서 <strong>&ldquo;‘{selectedFolder?.name || '해당'}’ 폴더 문제 분석해줘&rdquo;</strong>라고 요청하시면,<br />
                  AI가 구글 드라이브 문제 HTML을 정밀 분석하여 이곳에 결과가 자동으로 아카이빙됩니다.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80">
                  <div className="text-[11px] font-bold text-rose-700 flex items-center justify-between">
                    <span>🔥 킬러 문항</span>
                    <span className="text-[9px] bg-rose-200 px-1.5 rounded text-rose-900 font-extrabold">{archiveData.killerRatio}%</span>
                  </div>
                  <div className="text-xl font-black text-rose-950 mt-1">
                    {archiveData.killerCount}개 <span className="text-xs font-bold text-rose-600">({archiveData.killerRatio}%)</span>
                  </div>
                  <div className="text-[10px] text-rose-600 mt-0.5 truncate">
                    {archiveData.questions.filter(q => q.aiTier === 'KILLER').map(q => `${q.qNum}번`).join(', ') || '없음'}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80">
                  <div className="text-[11px] font-bold text-amber-700 flex items-center justify-between">
                    <span>⚡ 준킬러 문항</span>
                    <span className="text-[9px] bg-amber-200 px-1.5 rounded text-amber-900 font-extrabold">{archiveData.semiKillerRatio}%</span>
                  </div>
                  <div className="text-xl font-black text-amber-950 mt-1">
                    {archiveData.semiKillerCount}개 <span className="text-xs font-bold text-amber-600">({archiveData.semiKillerRatio}%)</span>
                  </div>
                  <div className="text-[10px] text-amber-600 mt-0.5 truncate">
                    {archiveData.questions.filter(q => q.aiTier === 'SEMI_KILLER').map(q => `${q.qNum}번`).join(', ') || '없음'}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200/80">
                  <div className="text-[11px] font-bold text-indigo-700 flex items-center justify-between">
                    <span>🌱 표준 문항</span>
                    <span className="text-[9px] bg-indigo-200 px-1.5 rounded text-indigo-900 font-extrabold">기출 표준</span>
                  </div>
                  <div className="text-xl font-black text-indigo-950 mt-1">
                    {archiveData.standardCount}개
                  </div>
                  <div className="text-[10px] text-indigo-600 mt-0.5">3점 기출 표준 배점</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>📊 종합 시험 난이도</span>
                    <Flame size={14} className="text-rose-500" />
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1 truncate">
                    {archiveData.examRating}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">평균 {archiveData.avgScore}점</div>
                </div>
              </div>
            )}
          </div>

          {/* 문항별 카드 그리드 */}
          {archiveData && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers size={15} className="text-violet-600" />
                  <span>문항별 AI 난이도 &amp; 핵심 개념 분석 목록</span>
                </span>
                
                {/* 필터 칩 */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeFilter === 'ALL' ? 'bg-violet-600 text-white font-extrabold shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    전체 ({archiveData.questions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('KILLER')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeFilter === 'KILLER' ? 'bg-rose-600 text-white font-extrabold shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    🔥 킬러 문항 ({archiveData.killerCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('SEMI_KILLER')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeFilter === 'SEMI_KILLER' ? 'bg-amber-500 text-white font-extrabold shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    ⚡ 준킬러 문항 ({archiveData.semiKillerCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('STANDARD')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeFilter === 'STANDARD' ? 'bg-indigo-600 text-white font-extrabold shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    🌱 표준 문항 ({archiveData.standardCount})
                  </button>
                </div>
              </div>

              {/* 카드 그리드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[540px] overflow-y-auto pr-1">
                {filteredQuestions.map(question => {
                  const isKiller = question.aiTier === 'KILLER';
                  const isSemiKiller = question.aiTier === 'SEMI_KILLER';

                  return (
                    <div
                      key={question.fileDriveId}
                      className={`bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all space-y-3 border-2 ${
                        isKiller
                          ? 'border-rose-200 hover:border-rose-300'
                          : isSemiKiller
                          ? 'border-amber-200 hover:border-amber-300'
                          : 'border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${
                              isKiller ? 'bg-rose-100 text-rose-900' : isSemiKiller ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {question.qNum}
                            </span>
                            <span className="text-xs font-black text-slate-900 truncate">
                              {question.displayName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold mt-1 truncate">
                            {question.coreConcepts.slice(0, 2).join(' · ')}
                          </div>
                        </div>

                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                          isKiller
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : isSemiKiller
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isKiller ? '🔥 킬러급' : isSemiKiller ? '⚡ 준킬러급' : '🌱 표준 기출'} ({question.aiScore}점)
                        </span>
                      </div>

                      {/* 난이도 & 풀이 단계 요약 박스 */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-slate-600">풀이 요구 단계:</span>
                          <span className="font-extrabold text-slate-800">
                            {question.stepsCount}단계 {question.stepsCount >= 4 ? '(다단계 복합 추론)' : '(표준 논리)'}
                          </span>
                        </div>
                        <div className="text-[10px] text-rose-700 pt-1 border-t border-slate-200 leading-relaxed truncate">
                          ⚠️ <strong>함정 요인:</strong> {question.trapPoint}
                        </div>
                      </div>

                      {/* 하단 태그 & 모달 버튼 */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold truncate max-w-[60%]">
                          {question.coreConcepts.map((c, i) => (
                            <span key={i}>#{c.slice(0, 8)} </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setModalQuestion(question)}
                          className="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white text-[11px] font-black transition-all cursor-pointer shrink-0"
                        >
                          상세 진단서 &amp; 문제보기 ↗
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 문항 상세 진단서 모달 */}
      <QuestionDeepReportModal
        isOpen={Boolean(modalQuestion)}
        onClose={() => setModalQuestion(null)}
        question={modalQuestion}
        folderName={selectedFolder?.name}
        grade={selectedGrade}
      />

    </div>
  );
}
