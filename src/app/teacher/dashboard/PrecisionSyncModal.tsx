'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Check,
  ShieldCheck,
  Layers,
  FileCheck,
  UserCheck,
  Eye,
  Sliders,
  Award,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { ExamLibraryNode } from '@/lib/examLibraryTree';

const GRADES = ['고1', '고2', '고3', '중1', '중2', '중3', 'ALL'];

interface PrecisionSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export default function PrecisionSyncModal({ isOpen, onClose, onSuccess }: PrecisionSyncModalProps) {
  // 모달 스텝: 'select' (파일선택) | 'inspect' (검토/승인) | 'result' (결과리포트)
  const [step, setStep] = useState<'select' | 'inspect' | 'result'>('select');

  // 학년 및 파일 트리 상태
  const [selectedGrade, setSelectedGrade] = useState('고1');
  const [treeData, setTreeData] = useState<ExamLibraryNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');

  // 선택된 파일 상태
  const [selectedFile, setSelectedFile] = useState<ExamLibraryNode | null>(null);

  // 검토 결과 상태 (inspect)
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // 자동 재채점 옵션 (4-1)
  const [autoRegrade, setAutoRegrade] = useState(true);

  // 최종 적용 상태 (apply)
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any>(null);

  // 모달 열릴 때 트리 로드
  useEffect(() => {
    if (isOpen) {
      loadTree(selectedGrade);
      setStep('select');
      setSelectedFile(null);
      setInspectData(null);
      setInspectError(null);
      setApplyResult(null);
    }
  }, [isOpen, selectedGrade]);

  const loadTree = async (grade: string) => {
    try {
      setLoadingTree(true);
      const res = await fetch(`/api/test2/raw-library?grade=${grade}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tree)) {
        setTreeData(data.tree);
        // 최상위 1레벨 폴더 자동 펼침
        const initialExpanded = new Set<string>();
        data.tree.forEach((node: ExamLibraryNode) => {
          if (node.type === 'folder') initialExpanded.add(node.id);
        });
        setExpandedFolders(initialExpanded);
      }
    } catch (e) {
      console.error('Failed to load raw library tree:', e);
    } finally {
      setLoadingTree(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // 평면 파일 검색 필터링
  const flattenedFiles = useMemo(() => {
    const list: Array<{ file: ExamLibraryNode; path: string }> = [];
    const traverse = (nodes: ExamLibraryNode[], currentPath: string) => {
      nodes.forEach((node) => {
        const nextPath = currentPath ? `${currentPath} > ${node.name}` : node.name;
        if (node.type === 'file') {
          list.push({ file: node, path: currentPath });
        }
        if (node.subFolders && node.subFolders.length > 0) {
          traverse(node.subFolders, nextPath);
        }
        if (node.files && node.files.length > 0) {
          traverse(node.files, nextPath);
        }
      });
    };
    traverse(treeData, '');
    return list;
  }, [treeData]);

  const searchResults = useMemo(() => {
    if (!searchKeyword.trim()) return null;
    const kw = searchKeyword.toLowerCase().trim();
    return flattenedFiles.filter(
      (item) => item.file.name.toLowerCase().includes(kw) || item.path.toLowerCase().includes(kw)
    );
  }, [flattenedFiles, searchKeyword]);

  // 구글 드라이브 최신 감지 및 검토 실행
  const handleInspect = async () => {
    if (!selectedFile) return;
    setIsInspecting(true);
    setInspectError(null);

    try {
      const res = await fetch('/api/drive/library/precision-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inspect',
          targetDriveId: selectedFile.drive_id,
          fileName: selectedFile.name,
          parentId: selectedFile.parent_id,
          grade: selectedFile.grade,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInspectData(data);
        setStep('inspect');
      } else {
        setInspectError(data.error || '구글 드라이브 파일 분석 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setInspectError(err?.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsInspecting(false);
    }
  };

  // 최종 승인 및 도미노 동기화 적용
  const handleApply = async () => {
    if (!inspectData || !selectedFile) return;
    setIsApplying(true);

    try {
      const res = await fetch('/api/drive/library/precision-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          targetDriveId: inspectData.currentRecord.drive_id,
          newDriveId: inspectData.newDriveFile.drive_id,
          newQuestionImageDriveId: inspectData.newDriveFile.new_question_image_drive_id,
          fileName: inspectData.currentRecord.name,
          parentId: inspectData.currentRecord.parent_id,
          grade: inspectData.currentRecord.grade,
          autoRegrade,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setApplyResult(data);
        setStep('result');
        if (onSuccess) {
          onSuccess(`[${inspectData.currentRecord.name}] 파일이 최신 구글 드라이브 파일로 성공적으로 교체 및 연동되었습니다.`);
        }
      } else {
        alert(`적용 중 오류 발생: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e: any) {
      alert(`네트워크 오류: ${e?.message || '적용에 실패했습니다.'}`);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[36px] w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-100">
        
        {/* 상단 헤더 */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">라이브러리 단일 파일 세밀수정</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-[11px] uppercase tracking-wider">
                  Precision Sync & Auto-Grading
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                오류가 난 특정 문항 파일만 교체하여 [원천DB ➔ 시험지 ➔ 학생 성적]까지 도미노로 일괄 연동합니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ======================================================== */}
        {/* STEP 1: 파일 탐색 및 선택 (원천DB 스타일) */}
        {/* ======================================================== */}
        {step === 'select' && (
          <div className="flex-1 flex flex-col min-h-0 p-8 space-y-6">
            
            {/* 학년 알약 탭 & 실시간 검색창 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setSelectedGrade(g);
                      setSelectedFile(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                      selectedGrade === g
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {g === 'ALL' ? '전체' : g}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="파일명 또는 폴더명 빠른 검색..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* 에러 알림창 */}
            {inspectError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-xs font-bold">
                <AlertCircle size={18} className="shrink-0" />
                <span>{inspectError}</span>
              </div>
            )}

            {/* 좌/우 분할 레이아웃: 트리/검색결과 + 선택 정보 미리보기 */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 overflow-hidden">
              
              {/* 좌측: 폴더 트리 / 검색 결과 리스트 */}
              <div className="md:col-span-7 bg-slate-50/70 border border-slate-200/80 rounded-3xl p-4 overflow-y-auto min-h-[340px]">
                {loadingTree ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                    <RefreshCw size={28} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-bold">라이브러리 트리를 불러오는 중...</span>
                  </div>
                ) : searchResults ? (
                  /* 검색 결과 목록 */
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">
                      검색 결과 {searchResults.length}건
                    </div>
                    {searchResults.length === 0 ? (
                      <p className="text-center py-10 text-xs text-slate-400 font-bold">일치하는 파일이 없습니다.</p>
                    ) : (
                      searchResults.map(({ file, path }) => (
                        <div
                          key={file.drive_id}
                          onClick={() => setSelectedFile(file)}
                          className={`p-3 rounded-2xl cursor-pointer border transition-all flex items-center justify-between ${
                            selectedFile?.drive_id === file.drive_id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                              : 'bg-white hover:bg-slate-100 border-slate-200/70 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText size={16} className={selectedFile?.drive_id === file.drive_id ? 'text-indigo-200' : 'text-slate-400'} />
                            <div className="truncate">
                              <p className="text-xs font-black truncate">{file.name}</p>
                              <p className={`text-[10px] truncate ${selectedFile?.drive_id === file.drive_id ? 'text-indigo-100' : 'text-slate-400'}`}>
                                {path || '루트 폴더'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0 ${
                            selectedFile?.drive_id === file.drive_id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {file.grade || selectedGrade}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* 계층형 폴더 트리 */
                  <div className="space-y-1">
                    {treeData.map((node) => (
                      <TreeNodeItem
                        key={node.id}
                        node={node}
                        expandedFolders={expandedFolders}
                        toggleFolder={toggleFolder}
                        selectedFile={selectedFile}
                        onSelectFile={setSelectedFile}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 우측: 선택 파일 정보 패널 */}
              <div className="md:col-span-5 flex flex-col justify-between bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    <FileCheck size={14} className="text-indigo-600" />
                    선택된 파일 정보
                  </h3>

                  {selectedFile ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">File Name</span>
                        <h4 className="text-base font-black text-slate-900 mt-0.5 break-all">{selectedFile.name}</h4>
                        <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                          <span className="px-2 py-0.5 bg-white rounded-md border border-indigo-200/60 text-indigo-700 font-extrabold text-[11px]">
                            {selectedFile.grade || '공통'}
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-500 text-[11px] truncate">ID: {selectedFile.drive_id.slice(0, 14)}...</span>
                        </div>
                      </div>

                      <div className="space-y-2.5 text-xs font-semibold text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">짝꿍 이미지 (PNG)</span>
                          <span className="font-bold text-slate-800">
                            {selectedFile.question_image_drive_id ? '연결됨 (자동 감지)' : '이미지 없음'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">소속 폴더 ID</span>
                          <span className="font-bold text-slate-800 truncate max-w-[150px]">
                            {selectedFile.parent_id || '루트'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-[11px] font-bold text-amber-800 leading-relaxed">
                        💡 <strong>알림:</strong> 구글 드라이브에서 이미 동일한 이름으로 새 파일을 덮어쓰거나 교체 업로드하셨다면, 아래 버튼을 눌러 즉시 변경사항을 검토할 수 있습니다.
                      </div>
                    </div>
                  ) : (
                    <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <FileText size={36} className="text-slate-300 mb-2 stroke-1" />
                      <p className="text-xs font-bold">좌측 목록에서 교체할 파일을 선택해 주세요.</p>
                      <p className="text-[11px] text-slate-400 mt-1">예: 모의평가 01.html, 개별질문 5.html 등</p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!selectedFile || isInspecting}
                  onClick={handleInspect}
                  className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                >
                  {isInspecting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      드라이브 최신 파일 스캔 중...
                    </>
                  ) : (
                    <>
                      구글 드라이브 최신 감지 및 검토
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: 변경사항 비교(Diff) 및 최종 승인 모달 */}
        {/* ======================================================== */}
        {step === 'inspect' && inspectData && (
          <div className="flex-1 flex flex-col min-h-0 p-8 space-y-6 overflow-y-auto">
            
            {/* 상태 요약 배지 */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800">구글 드라이브 최신 파일 감지 완료</h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    드라이브 최종 수정: {new Date(inspectData.newDriveFile.modified_time).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                  inspectData.diff.is_id_changed
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {inspectData.diff.is_id_changed ? '새 Drive ID 부여됨' : '기존 Drive ID 유지됨'}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-black">
                  {inspectData.newDriveFile.new_question_image_drive_id ? '짝꿍 이미지 연동됨' : '이미지 없음'}
                </span>
              </div>
            </div>

            {/* 정답 비교 카드 (Diff) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 기존 정답 박스 */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Before (현재 DB 상태)</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-700">
                    {inspectData.diff.old_answer || '기존 정답 미등록'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                  원문: {inspectData.currentRecord.existing_raw_answer || inspectData.diff.old_answer || '없음'}
                </p>
              </div>

              {/* 새 파일 정답 박스 */}
              <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 relative overflow-hidden">
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-black">
                  NEW 최신 드라이브
                </div>
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">After (교체될 새 정답)</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-indigo-700">
                    {inspectData.diff.new_answer || '정답 정보 없음'}
                  </span>
                  {inspectData.diff.is_answer_changed && (
                    <span className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-black animate-pulse">
                      정답 변경됨!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-indigo-600/80 font-medium mt-1 truncate">
                  원문: {inspectData.diff.new_raw_answer || '없음'}
                </p>
              </div>
            </div>

            {/* 영향받는 시험지 목록 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  자동 동기화될 시험지 ({inspectData.affectedExams.length}건)
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  시험지 내 문항 정답 및 배점 스냅샷이 자동 갱신됩니다.
                </span>
              </h4>

              {inspectData.affectedExams.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold py-2">현재 이 문항을 포함하고 있는 생성된 시험지가 없습니다.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {inspectData.affectedExams.map((exam: any) => (
                    <div
                      key={exam.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700"
                    >
                      <span className="truncate max-w-[70%]">
                        [{exam.grade}] {exam.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-indigo-600 font-black">{exam.question_index}번 문항</span>
                        <span className="text-[11px] text-slate-400">({exam.points}점)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 🌟 4-1 핵심 옵션: 학생 제출 답안 자동 재채점 토글 스위치 */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Award size={18} className="text-violet-600" />
                  <span className="text-sm font-black text-slate-900">
                    기존 학생 제출 답안 자동 재채점 & 성적 변동 리포트 확인
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  이 시험지를 이미 제출한 학생들(총 {inspectData.totalSubmissionsCount}건)의 답안을 새 정답 기준으로 즉시 재채점하고,
                  <strong> 몇 점이 올랐는지/내렸는지 변동 리포트</strong>를 제공합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAutoRegrade(!autoRegrade)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoRegrade ? 'bg-violet-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                    autoRegrade ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 하단 버튼 바 */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-600 font-black text-xs hover:bg-slate-50 transition-colors"
              >
                다른 파일 선택
              </button>

              <button
                type="button"
                disabled={isApplying}
                onClick={handleApply}
                className="px-8 py-3.5 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white font-black text-sm rounded-2xl shadow-xl flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                {isApplying ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    도미노 동기화 및 재채점 처리 중...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    최종 승인 및 도미노 동기화 적용
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: 결과 화면 및 성적 변동 리포트 (4-1) */}
        {/* ======================================================== */}
        {step === 'result' && applyResult && (
          <div className="flex-1 flex flex-col min-h-0 p-8 space-y-6 overflow-y-auto">
            
            {/* 상단 축하 배너 */}
            <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-900">세밀수정 및 도미노 동기화 완료!</h3>
                  <p className="text-xs text-emerald-700 font-medium mt-0.5">
                    구글 드라이브 최신 파일이 시스템 전체에 안전하게 반영되었습니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-black text-emerald-800">
                  원천DB {applyResult.updatedBankCount}건
                </span>
                <span className="px-3 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-black text-emerald-800">
                  시험지 {applyResult.updatedExamsCount}건
                </span>
                <span className="px-3 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-black text-emerald-800">
                  재채점 {applyResult.regradedSubmissionsCount}건
                </span>
              </div>
            </div>

            {/* 📊 성적 변동 리포트 (4-1 요구사항 핵심 구현) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award size={18} className="text-violet-600" />
                  <h4 className="text-sm font-black text-slate-900">
                    학생 성적 변동 리포트 ({applyResult.scoreChanges ? applyResult.scoreChanges.length : 0}명 변동)
                  </h4>
                </div>
                <span className="text-[11px] font-bold text-slate-400">
                  점수가 변동된 학생들만 자동으로 모아 표시합니다.
                </span>
              </div>

              {applyResult.scoreChanges && applyResult.scoreChanges.length > 0 ? (
                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider sticky top-0 border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">학생 이름</th>
                        <th className="py-3 px-4">시험지</th>
                        <th className="py-3 px-4">변경 전 점수</th>
                        <th className="py-3 px-4">변경 후 점수</th>
                        <th className="py-3 px-4 text-center">점수 변동</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {applyResult.scoreChanges.map((item: any, i: number) => {
                        const isUp = item.diff > 0;
                        return (
                          <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-black text-slate-900 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">
                                {item.student_name?.[0] || '학'}
                              </div>
                              {item.student_name}
                            </td>
                            <td className="py-3 px-4 truncate max-w-[200px] text-slate-500 font-medium">
                              {item.exam_title}
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {item.old_score}점
                            </td>
                            <td className="py-3 px-4 font-black text-slate-900">
                              {item.new_score}점
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black ${
                                  isUp
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {isUp ? `+${item.diff}점` : `${item.diff}점`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <UserCheck size={36} className="text-slate-300 mb-2 stroke-1" />
                  <p className="text-xs font-bold text-slate-600">점수가 변동된 학생이 없습니다.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    기존 학생들의 답안 채점 상태에 영향이 없거나(모두 동일 점수 유지), 아직 응시자가 없는 시험지입니다.
                  </p>
                </div>
              )}
            </div>

            {/* 닫기 버튼 */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// 트리 노드 재귀 렌더러
function TreeNodeItem({
  node,
  expandedFolders,
  toggleFolder,
  selectedFile,
  onSelectFile,
}: {
  node: ExamLibraryNode;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  selectedFile: ExamLibraryNode | null;
  onSelectFile: (file: ExamLibraryNode) => void;
}) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFile?.drive_id === node.drive_id;

  if (isFolder) {
    const hasChildren = (node.subFolders && node.subFolders.length > 0) || (node.files && node.files.length > 0);

    return (
      <div className="space-y-0.5">
        <div
          onClick={() => toggleFolder(node.id)}
          className="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-slate-200/60 cursor-pointer text-slate-700 text-xs font-bold transition-colors select-none"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />
          ) : (
            <span className="w-3.5 inline-block shrink-0" />
          )}

          {isExpanded ? (
            <FolderOpen size={16} className="text-indigo-500 shrink-0" />
          ) : (
            <Folder size={16} className="text-indigo-400 shrink-0" />
          )}

          <span className="truncate">{node.name}</span>
        </div>

        {isExpanded && hasChildren && (
          <div className="pl-4 ml-2 border-l border-slate-200 space-y-0.5">
            {node.subFolders?.map((sub) => (
              <TreeNodeItem
                key={sub.id}
                node={sub}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
              />
            ))}
            {node.files?.map((f) => (
              <TreeNodeItem
                key={f.id}
                node={f}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 파일 노드
  return (
    <div
      onClick={() => onSelectFile(node)}
      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs font-bold transition-all ${
        isSelected
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
          : 'hover:bg-slate-200/60 text-slate-600'
      }`}
    >
      <div className="flex items-center gap-2 truncate min-w-0">
        <FileText size={15} className={isSelected ? 'text-indigo-200' : 'text-slate-400'} />
        <span className="truncate">{node.name}</span>
      </div>
      {node.question_image_drive_id && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
          PNG
        </span>
      )}
    </div>
  );
}
