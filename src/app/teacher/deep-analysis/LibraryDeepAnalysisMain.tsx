'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  FileText,
  Printer,
  Eye,
  LayoutGrid,
  LayoutList
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
  const [folderSearch, setFolderSearch] = useState<string>('');
  const [loadingFolders, setLoadingFolders] = useState<boolean>(true);
  const [allFolders, setAllFolders] = useState<LibraryFolderItem[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // 선택된 대상 폴더
  const [selectedFolder, setSelectedFolder] = useState<LibraryFolderItem | null>(null);

  // 아카이브 조회 상태 및 데이터 (Web UI는 순수 뷰어)
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [archiveData, setArchiveData] = useState<FolderArchiveData | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  // 뷰 모드: 'list' (스마트 일람표) vs 'card' (카드 뷰)
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  // 포커스된 문항 (히트맵 클릭 시)
  const [highlightedQNum, setHighlightedQNum] = useState<number | null>(null);

  // 상세 진단서 모달
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
    let list = allFolders;
    if (selectedGrade !== '전체' && selectedGrade !== 'ALL') {
      list = list.filter(f => f.grade && f.grade.startsWith(selectedGrade));
    }
    if (folderSearch.trim()) {
      const q = folderSearch.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    return list;
  }, [allFolders, selectedGrade, folderSearch]);

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

  // 학년 변경 시 대표 기출 폴더(5차 또는 4차) 자동 선택
  useEffect(() => {
    if (currentGradeFolders.length > 0 && !selectedFolder) {
      const target = currentGradeFolders.find(f => f.name === '5차') ||
        currentGradeFolders.find(f => f.name === '4차') ||
        currentGradeFolders.find(f => f.name.includes('기출') || f.name.includes('모의')) ||
        currentGradeFolders[0];

      if (target) {
        setSelectedFolder(target);
      }
    }
  }, [currentGradeFolders, selectedFolder]);

  // 3. 선택된 폴더의 아카이빙된 분석 데이터 조회
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

  // 히트맵 칩 클릭 시 해당 행으로 스크롤 & 하이라이트
  const handleHeatmapClick = (q: QuestionReportItem) => {
    setHighlightedQNum(q.qNum);
    const rowEl = document.getElementById(`q-row-${q.qNum}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setModalQuestion(q);
    }
    setTimeout(() => setHighlightedQNum(null), 3000);
  };

  // CSV 내보내기
  const handleExportCSV = () => {
    if (!archiveData || archiveData.questions.length === 0) {
      alert('내보낼 분석 데이터가 없습니다.');
      return;
    }

    const headers = ['문항번호', '파일명', 'AI난이도(점수)', '난이도등급', '추론단계', '핵심개념', '오답함정', '수업코칭팁'];
    const rows = archiveData.questions.map(q => [
      q.qNum,
      q.fileName,
      q.aiScore,
      q.aiTier === 'KILLER' ? '최고난도킬러' : q.aiTier === 'SEMI_KILLER' ? '준킬러' : '표준/기본',
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
    link.setAttribute('download', `Eduest_AI정밀진단_${archiveData.folderName}_${selectedGrade}.csv`);
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
      <div key={node.drive_id} className="space-y-0.5">
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
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-200'
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
            {hasChildren ? (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${
                isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {node.subFolders.length}
              </span>
            ) : (
              isSelected && (
                <span className="text-[9px] bg-white/25 text-white px-1.5 py-0.5 rounded font-extrabold">
                  선택됨
                </span>
              )
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 border-l-2 border-violet-100 ml-4 pl-1">
            {node.subFolders.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1520px] mx-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-200">
      
      {/* 1. 최상단 타이틀 & 헤더 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-900 to-indigo-950 text-white shadow-md shadow-violet-900/20">
            <Microscope size={22} className="text-violet-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">라이브러리 문제 난이도 AI 정밀 분석 센터</h1>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 font-black border border-violet-200">
                High-End Diagnostic V2
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              구글 드라이브 원본 문제 HTML을 AI가 직접 열어 조건식과 요구 역량을 정밀 진단한 아카이브 뷰어입니다.
            </p>
          </div>
        </div>

        {/* 우측 액션 바 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!archiveData}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            <Download size={14} className="text-slate-600" />
            <span>CSV 내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!archiveData}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-black hover:from-violet-500 hover:to-indigo-500 shadow-md shadow-violet-200 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            <Printer size={14} />
            <span>진단 리포트 일괄 인쇄</span>
          </button>
        </div>
      </div>

      {/* 2단 그리드: 좌측 탐색 트리(3.5열) vs 우측 고품격 분석 콘솔(8.5열) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* [좌측] 학년 탭 및 폴더 계층 트리 (3.5열) */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-4">
          {/* 학년 필터 세그먼트 */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            {GRADES.slice(0, 4).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setSelectedGrade(g);
                  setSelectedFolder(null);
                }}
                className={`flex-1 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                  selectedGrade === g
                    ? 'bg-white text-violet-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* 폴더 검색 인풋 */}
          <div className="relative">
            <input
              type="text"
              value={folderSearch}
              onChange={e => setFolderSearch(e.target.value)}
              placeholder="폴더명 검색..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-500 pl-8"
            />
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
          </div>

          {/* 트리 구조 영역 */}
          <div className="space-y-1 text-xs font-bold text-slate-700 max-h-[620px] overflow-y-auto pr-1">
            {loadingFolders ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={24} className="animate-spin text-violet-600" />
                <span className="text-xs font-bold">폴더 목록 로딩 중...</span>
              </div>
            ) : folderTree.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                등록된 폴더가 없습니다.
              </div>
            ) : (
              folderTree.map(node => renderTreeNode(node))
            )}
          </div>

          <div className="p-3 bg-violet-50/70 border border-violet-100 rounded-2xl text-[11px] text-violet-900 leading-relaxed font-bold">
            💡 <strong>AI 실시간 연동:</strong> 대화창에서 AI(마누라)에게 새로운 폴더 분석을 요청하면 이 목록에 실시간 아카이빙됩니다.
          </div>
        </aside>

        {/* [우측] 고품격 AI 정밀 분석 콘솔 본체 (8.5열) */}
        <div className="lg:col-span-9 space-y-4">
          
          {/* 1. 메인 분석 콘솔 헤더 (High-End Glassmorphism Panel) */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
            
            {/* 은은한 배경 광원 효과 */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-violet-600/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute right-40 -bottom-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 space-y-4">
              
              {/* 상단 폴더 경로 & 등급 배지 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
                    <span>{selectedGrade} 라이브러리</span>
                    <span>&gt;</span>
                    <span>{selectedFolder?.name || '폴더 선택'}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
                    <span>[{selectedFolder?.name || '폴더를 선택해주세요'}] 수능형 실전 모의평가</span>
                    {archiveData && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/40">
                        아카이빙 완료 ({archiveData.totalQuestions}문항)
                      </span>
                    )}
                  </h2>
                </div>

                {/* 시험 종합 난이도 배지 */}
                {archiveData && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-xl">
                      ⚡
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-300">시험지 종합 난이도</div>
                      <div className="text-base font-black text-amber-300">
                        {archiveData.examRating} <span className="text-xs font-bold text-slate-200">(평균 {archiveData.avgScore}점)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ★ [핵심 혁신 1] 1번 ~ 22번 문항 난이도 히트맵 레일 (OMR 스펙트럼) */}
              {archiveData && (
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <span>🗺️</span>
                      <span>전체 문항 난이도 히트맵 스펙트럼 (1 ~ {archiveData.totalQuestions}번 원클릭 이동)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      초록/파랑: 기본/표준 | 주황: 준킬러(75~84점) | <span className="text-rose-400 font-bold">빨강: 킬러(90점 이상)</span>
                    </span>
                  </div>

                  {/* 22개 문항 히트맵 칩스 (가로 레일) */}
                  <div className="grid grid-cols-11 sm:grid-cols-22 gap-1.5 pt-1">
                    {archiveData.questions.map(q => {
                      const isKiller = q.aiTier === 'KILLER';
                      const isSemi = q.aiTier === 'SEMI_KILLER';

                      return (
                        <div
                          key={q.fileDriveId}
                          onClick={() => handleHeatmapClick(q)}
                          className={`p-1.5 rounded-lg text-center cursor-pointer transition-all transform hover:scale-110 ${
                            isKiller
                              ? 'bg-rose-600/40 hover:bg-rose-600/70 border-2 border-rose-400 shadow-md shadow-rose-900/40 scale-105'
                              : isSemi
                              ? 'bg-amber-500/25 hover:bg-amber-500/50 border border-amber-400'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/30'
                          }`}
                          title={`${q.qNum}번: ${q.coreConcepts[0] || ''} (${q.aiScore}점)`}
                        >
                          <div className={`text-[10px] font-black ${isKiller ? 'text-rose-100 flex items-center justify-center gap-0.5' : isSemi ? 'text-amber-300' : 'text-emerald-300'}`}>
                            {isKiller && <span>🔥</span>}
                            <span>{q.qNum}</span>
                          </div>
                          <div className={`text-[8px] font-semibold ${isKiller ? 'text-rose-200' : 'text-slate-300'}`}>
                            {q.aiScore}점
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ★ [핵심 혁신 2] 수평 난이도 스펙트럼 비율 바 & 서머리 스트립 */}
              {archiveData && (
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold text-slate-300">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-xs"></span>
                      <span>🔥 킬러: <strong className="text-white">{archiveData.killerCount}개 ({archiveData.killerRatio}%)</strong> [{archiveData.questions.filter(q => q.aiTier === 'KILLER').map(q => `${q.qNum}번`).join(', ')}]</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                      <span>⚡ 준킬러: <strong className="text-white">{archiveData.semiKillerCount}개 ({archiveData.semiKillerRatio}%)</strong></span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                      <span>🌱 기본·표준: <strong className="text-white">{archiveData.standardCount + archiveData.basicCount}개</strong></span>
                    </span>
                  </div>

                  {/* 미니 프로그레스 바 */}
                  <div className="w-full sm:w-64 h-2.5 rounded-full bg-white/10 overflow-hidden flex shadow-inner">
                    <div className="bg-rose-500 h-full" style={{ width: `${archiveData.killerRatio}%` }} title={`킬러 ${archiveData.killerRatio}%`}></div>
                    <div className="bg-amber-400 h-full" style={{ width: `${archiveData.semiKillerRatio}%` }} title={`준킬러 ${archiveData.semiKillerRatio}%`}></div>
                    <div className="bg-emerald-400 h-full" style={{ width: `${100 - archiveData.killerRatio - archiveData.semiKillerRatio}%` }} title="기본/표준"></div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* 2. 필터 칩 & 뷰 전환 컨트롤 바 */}
          {archiveData && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              {/* 필터 칩 */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setActiveFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeFilter === 'ALL'
                      ? 'bg-violet-600 text-white font-black shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  전체 ({archiveData.questions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('KILLER')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeFilter === 'KILLER'
                      ? 'bg-rose-600 text-white font-black shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🔥 킬러 문항 ({archiveData.killerCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('SEMI_KILLER')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeFilter === 'SEMI_KILLER'
                      ? 'bg-amber-500 text-white font-black shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  ⚡ 준킬러 문항 ({archiveData.semiKillerCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('STANDARD')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeFilter === 'STANDARD'
                      ? 'bg-emerald-600 text-white font-black shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🌱 기본·표준 문항 ({archiveData.standardCount + archiveData.basicCount})
                </button>
              </div>

              {/* 뷰 모드 토글 (스마트 일람표 vs 카드 뷰) */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-violet-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutList size={13} />
                  <span>스마트 일람표</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-white text-violet-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>카드 뷰</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. 본체: 로딩 / 빈 상태 / 일람표 / 카드 뷰 */}
          {loadingAnalysis ? (
            <div className="py-24 bg-white border border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-2 shadow-2xs">
              <Loader2 size={32} className="animate-spin text-violet-600" />
              <span className="text-xs font-bold text-slate-700">분석 아카이브를 불러오는 중...</span>
            </div>
          ) : !archiveData ? (
            <div className="py-20 px-6 bg-white border border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 shadow-2xs">
              <div className="w-14 h-14 rounded-3xl bg-violet-100 text-violet-600 flex items-center justify-center shadow-xs">
                <BookOpen size={28} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-900">
                  아직 등록된 AI 분석 리포트가 없습니다
                </h3>
                <p className="text-xs text-slate-500 font-medium max-w-md">
                  선택하신 <strong>[{selectedFolder?.name || '폴더'}]</strong>는 아직 MCP 문항 정밀 분석이 수행되지 않은 상태입니다.
                </p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 max-w-lg shadow-2xs leading-relaxed">
                💡 대화창에서 <strong>&ldquo;‘{selectedFolder?.name || '해당'}’ 폴더 문제 분석해줘&rdquo;</strong>라고 요청하시면,<br />
                AI(마누라)가 구글 드라이브 문제 HTML을 직접 뜯어보고 분석하여 이곳에 자동으로 아카이빙합니다.
              </div>
            </div>
          ) : viewMode === 'list' ? (
            /* ★ [핵심 혁신 3] 시원시원한 [스마트 리포트 일람표 (Table View)] */
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[11px]">
                      <th className="py-3.5 px-4 w-16 text-center">번호</th>
                      <th className="py-3.5 px-4 w-32">AI 난이도 등급</th>
                      <th className="py-3.5 px-4 w-28">추론 단계</th>
                      <th className="py-3.5 px-4 w-60">출제 핵심 개념 (원문)</th>
                      <th className="py-3.5 px-4">오답 유발 치명적 함정 (Trap Point)</th>
                      <th className="py-3.5 px-4 w-28 text-center">정밀 진단</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredQuestions.map(q => {
                      const isKiller = q.aiTier === 'KILLER';
                      const isSemi = q.aiTier === 'SEMI_KILLER';
                      const isHighlighted = highlightedQNum === q.qNum;

                      return (
                        <tr
                          key={q.fileDriveId}
                          id={`q-row-${q.qNum}`}
                          className={`transition-all ${
                            isHighlighted
                              ? 'bg-violet-100 ring-2 ring-violet-500'
                              : isKiller
                              ? 'bg-rose-50/30 hover:bg-rose-50/60'
                              : isSemi
                              ? 'bg-amber-50/20 hover:bg-amber-50/50'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3.5 px-4 text-center">
                            <span className={`w-7 h-7 rounded-lg font-black text-xs inline-flex items-center justify-center ${
                              isKiller
                                ? 'bg-rose-600 text-white shadow-xs'
                                : isSemi
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {q.qNum}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full font-black text-[11px] inline-flex items-center gap-1 shadow-2xs ${
                              isKiller
                                ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                : isSemi
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              <span>{isKiller ? '🔥 킬러' : isSemi ? '⚡ 준킬러' : '🌱 기본'}</span>
                              <span className="text-slate-400">|</span>
                              <span>{q.aiScore}점</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              q.stepsCount >= 4 ? 'bg-rose-100 text-rose-900 font-extrabold' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {q.stepsCount}단계 {q.stepsCount >= 4 ? '(복합)' : '(표준)'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 truncate" title={q.coreConcepts[0]}>
                              {q.coreConcepts[0] || '단원 종합'}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium truncate" title={q.coreConcepts.slice(1).join(', ')}>
                              {q.coreConcepts.slice(1).join(', ') || q.fileName}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className={`p-2 rounded-xl text-[11px] border leading-relaxed ${
                              isKiller
                                ? 'bg-rose-100/70 text-rose-950 border-rose-200 font-semibold'
                                : isSemi
                                ? 'bg-amber-100/60 text-amber-950 border-amber-200 font-semibold'
                                : 'bg-slate-50 text-slate-600 border-slate-200/60'
                            }`}>
                              {q.trapPoint}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setModalQuestion(q)}
                              className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition-all cursor-pointer shadow-2xs ${
                                isKiller
                                  ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
                                  : 'bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white'
                              }`}
                            >
                              문제보기 ↗
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 테이블 하단 푸터 바 */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-bold">
                <div>
                  표시 중: 전체 {archiveData.totalQuestions}문항 중 {filteredQuestions.length}문항
                </div>
                <div className="flex items-center gap-2">
                  <span>정렬: 문항 번호순 (1 ~ {archiveData.totalQuestions})</span>
                </div>
              </div>
            </div>
          ) : (
            /* 카드 뷰 모드 (개선된 와이드 카드 그리드) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQuestions.map(q => {
                const isKiller = q.aiTier === 'KILLER';
                const isSemi = q.aiTier === 'SEMI_KILLER';

                return (
                  <div
                    key={q.fileDriveId}
                    id={`q-row-${q.qNum}`}
                    className={`bg-white rounded-3xl p-5 shadow-2xs hover:shadow-md transition-all space-y-3.5 border-2 ${
                      isKiller
                        ? 'border-rose-300 bg-rose-50/15'
                        : isSemi
                        ? 'border-amber-200 bg-amber-50/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center shrink-0 ${
                          isKiller
                            ? 'bg-rose-600 text-white shadow-xs'
                            : isSemi
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {q.qNum}
                        </span>
                        <div>
                          <h4 className="text-xs font-black text-slate-900">{q.displayName}</h4>
                          <p className="text-[11px] text-slate-500 font-bold truncate max-w-[240px]">
                            {q.coreConcepts[0] || '단원 종합'}
                          </p>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full font-black text-[11px] inline-flex items-center gap-1 shrink-0 ${
                        isKiller
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : isSemi
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        <span>{isKiller ? '🔥 킬러' : isSemi ? '⚡ 준킬러' : '🌱 기본'}</span>
                        <span className="text-slate-400">|</span>
                        <span>{q.aiScore}점</span>
                      </span>
                    </div>

                    {/* 단계 & 개념 */}
                    <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 font-bold">
                      <span className="text-slate-500">추론 논리 단계:</span>
                      <span className="text-slate-800 font-extrabold">{q.stepsCount}단계 {q.stepsCount >= 4 ? '(다단계 복합 추론)' : '(표준 논리)'}</span>
                    </div>

                    {/* 함정 포인트 (말줄임 없이 풀텍스트) */}
                    <div className={`p-3 rounded-xl text-xs border leading-relaxed ${
                      isKiller
                        ? 'bg-rose-100/70 text-rose-950 border-rose-200 font-semibold'
                        : isSemi
                        ? 'bg-amber-100/60 text-amber-950 border-amber-200 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200/60'
                    }`}>
                      ⚠️ <strong>함정 요인:</strong> {q.trapPoint}
                    </div>

                    {/* 푸터 버튼 */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[10px] text-slate-400 font-bold truncate max-w-[65%]">
                        {q.coreConcepts.slice(0, 2).map((c, i) => (
                          <span key={i}>#{c.slice(0, 10)} </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalQuestion(q)}
                        className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition-all cursor-pointer ${
                          isKiller
                            ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
                            : 'bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white'
                        }`}
                      >
                        문제보기 ↗
                      </button>
                    </div>
                  </div>
                );
              })}
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
