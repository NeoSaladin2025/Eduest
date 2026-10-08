'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Clock, 
  BookOpen, 
  User, 
  Loader2, 
  ExternalLink, 
  MessageSquare, 
  HelpCircle, 
  ShieldAlert, 
  Volume2, 
  VolumeX, 
  Layers, 
  RefreshCw,
  FileCheck,
  Inbox,
  Send,
  AlertTriangle,
  Search
} from 'lucide-react';

export interface PendingGradingItem {
  submission_id: string;
  student_id: string;
  student_name: string;
  exam_id: string;
  exam_title: string;
  question_id: string;
  question_number: number;
  question_name: string;
  image_url: string;
  user_answer: string;
  correct_answer: string;
  raw_answer: string;
  solution_drive_id: string;
  points: number;
  submitted_at: string;
  proof_image_url?: string;
}

interface NotificationHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingGradingCount: number;
  onGradedChange?: (remainingCount: number) => void;
  adminName?: string;
}

type NotificationTab = 'all' | 'grading' | 'questions' | 'feedback' | 'security';

export default function NotificationHubModal({
  isOpen,
  onClose,
  pendingGradingCount,
  onGradedChange,
  adminName = '선생님'
}: NotificationHubModalProps) {
  const [activeTab, setActiveTab] = useState<NotificationTab>('grading');
  const [isFocusMode, setIsFocusMode] = useState(false); // 수업 집중 모드 (방해 금지)
  
  // 서술형 채점 관련 상태
  const [loadingGrading, setLoadingGrading] = useState(false);
  const [gradingItems, setGradingItems] = useState<PendingGradingItem[]>([]);
  const [selectedGradingIndex, setSelectedGradingIndex] = useState<number>(0);
  const [showSolutionCheck, setShowSolutionCheck] = useState<boolean>(true);
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, previewImage, onClose]);

  // 서술형 채점 목록 조회
  const fetchGradingItems = async () => {
    try {
      setLoadingGrading(true);
      const res = await fetch('/api/test2/descriptive-grading');
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setGradingItems(data.items);
        setSelectedGradingIndex(0);
        if (onGradedChange) {
          onGradedChange(data.items.length);
        }
      }
    } catch (e) {
      console.error('Failed to fetch grading items:', e);
    } finally {
      setLoadingGrading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGradingItems();
      setShowSolutionCheck(true);
      // 대기 건수가 있으면 바로 채점 탭으로, 없으면 all 탭 기본
      if (pendingGradingCount > 0) {
        setActiveTab('grading');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentGradingItem = gradingItems[selectedGradingIndex] || null;
  const totalCount = gradingItems.length;

  // 채점 승인/오답 처리
  const handleGrade = async (isCorrect: boolean) => {
    if (!currentGradingItem) return;

    try {
      setIsSubmittingGrade(true);
      const res = await fetch('/api/test2/descriptive-grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: currentGradingItem.student_id,
          exam_id: currentGradingItem.exam_id,
          question_id: currentGradingItem.question_id,
          is_correct: isCorrect,
          show_solution: showSolutionCheck,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updated = gradingItems.filter((_, idx) => idx !== selectedGradingIndex);
        setGradingItems(updated);
        const nextIdx = Math.min(selectedGradingIndex, Math.max(0, updated.length - 1));
        setSelectedGradingIndex(nextIdx);

        if (onGradedChange) {
          onGradedChange(updated.length);
        }
      } else {
        alert(`채점 반영 실패: ${data.error || '오류 발생'}`);
      }
    } catch (e) {
      console.error('Grade error:', e);
      alert('채점 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingGrade(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
      
      {/* 🌟 통합 알림창 메인 컨테이너 */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-7xl h-[92vh] max-h-[960px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* 1. 상단 마스터 헤더 */}
        <header className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md shadow-violet-500/20">
              <Bell size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                  통합 알림 센터
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 tracking-wider">
                    Notification Hub
                  </span>
                </h2>
                {totalCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                    미처리 {totalCount}건
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    모두 완료됨
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                서술형 채점, 학생 질문, 건의사항 등 선생님의 조치가 필요한 모든 알림을 한곳에서 관리합니다.
              </p>
            </div>
          </div>

          {/* 우측 유틸리티 & 닫기 버튼 */}
          <div className="flex items-center gap-3">
            {/* 수업 집중 모드 토글 */}
            <button
              type="button"
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isFocusMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title="수업 중 방해 알림 소리/팝업을 끕니다"
            >
              {isFocusMode ? <VolumeX size={14} className="text-amber-400" /> : <Volume2 size={14} />}
              <span className="hidden sm:inline">수업 집중 모드</span>
              <span className={`w-2 h-2 rounded-full ${isFocusMode ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
            </button>

            {/* 새로고침 */}
            <button
              type="button"
              onClick={fetchGradingItems}
              disabled={loadingGrading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="알림 새로고침"
            >
              <RefreshCw size={17} className={loadingGrading ? 'animate-spin text-violet-400' : ''} />
            </button>

            <div className="h-6 w-[1px] bg-slate-800"></div>

            {/* 창 닫기 */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer group flex items-center gap-1"
              title="닫기 (ESC)"
            >
              <span className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-300 hidden md:inline">ESC</span>
              <X size={20} />
            </button>
          </div>
        </header>

        {/* 2. 본문 2단 분할 레이아웃 (좌측 세로 메뉴 + 우측 상세 워크스페이스) */}
        <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-slate-200">
          
          {/* =========================================
              [좌측 세로 메뉴 영역] (w-72 md:w-80 shrink-0)
             ========================================= */}
          <aside className="w-64 md:w-80 bg-slate-50/70 p-4 flex flex-col justify-between overflow-y-auto select-none border-r border-slate-200/80">
            <div className="space-y-6">
              
              {/* 상단: 전체 피드 */}
              <div>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'all'
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Inbox size={16} className={activeTab === 'all' ? 'text-violet-400' : 'text-slate-400'} />
                    <span>전체 알림 모아보기</span>
                  </div>
                  {totalCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      activeTab === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {totalCount}
                    </span>
                  )}
                </button>
              </div>

              {/* 1. 즉각 조치 필요 (Action Required) */}
              <div className="space-y-1.5">
                <div className="px-2 text-[10px] font-black text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  즉각 조치 필요 (Action Required)
                </div>

                {/* 서술형 문항 채점 */}
                <button
                  type="button"
                  onClick={() => setActiveTab('grading')}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'grading'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileCheck size={16} className={activeTab === 'grading' ? 'text-white' : 'text-violet-600'} />
                    <div className="text-left">
                      <p className="leading-snug">서술형 문항 채점</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'grading' ? 'text-violet-200' : 'text-slate-400'}`}>
                        학생 주관식 검토 및 승인
                      </p>
                    </div>
                  </div>
                  {gradingItems.length > 0 ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      activeTab === 'grading' ? 'bg-white text-violet-700' : 'bg-rose-500 text-white animate-pulse'
                    }`}>
                      {gradingItems.length}
                    </span>
                  ) : (
                    <span className={`text-[10px] font-medium ${activeTab === 'grading' ? 'text-violet-200' : 'text-slate-400'}`}>
                      0
                    </span>
                  )}
                </button>

                {/* 실시간 학생 질문 (Q&A) */}
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'questions'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare size={16} className={activeTab === 'questions' ? 'text-white' : 'text-indigo-500'} />
                    <div className="text-left">
                      <p className="leading-snug">실시간 학생 질문</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'questions' ? 'text-violet-200' : 'text-slate-400'}`}>
                        수업/시험 중 질문 (Q&A)
                      </p>
                    </div>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-600 text-[9px] font-extrabold">
                    준비중
                  </span>
                </button>
              </div>

              {/* 2. 학생 소통 및 피드백 (Feedback) */}
              <div className="space-y-1.5">
                <div className="px-2 text-[10px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  학생 피드백 및 의견
                </div>

                {/* 학생 건의사항 */}
                <button
                  type="button"
                  onClick={() => setActiveTab('feedback')}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'feedback'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HelpCircle size={16} className={activeTab === 'feedback' ? 'text-white' : 'text-amber-500'} />
                    <div className="text-left">
                      <p className="leading-snug">학생 건의함 / 의견</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'feedback' ? 'text-violet-200' : 'text-slate-400'}`}>
                        시스템·수업 개선 건의
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">0</span>
                </button>
              </div>

              {/* 3. 시스템 & 모니터링 관제 */}
              <div className="space-y-1.5">
                <div className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  보안 및 시스템 관제
                </div>

                {/* 부정행위 / 화면이탈 감지 */}
                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'security'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert size={16} className={activeTab === 'security' ? 'text-white' : 'text-rose-500'} />
                    <div className="text-left">
                      <p className="leading-snug">시험 화면이탈 감지</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'security' ? 'text-violet-200' : 'text-slate-400'}`}>
                        실시간 부정행위 로그
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">0</span>
                </button>
              </div>

            </div>

            {/* 하단 시스템 안내 배너 */}
            <div className="mt-4 p-3 bg-white rounded-2xl border border-slate-200/80 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <Sparkles size={13} className="text-violet-600" />
                <span>스마트 알림 자동 집계</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                학생 앱과 실시간 연동되어 질문, 건의, 시험 채점 대기 건수가 본 화면으로 자동 집계됩니다.
              </p>
            </div>
          </aside>

          {/* =========================================
              [우측 메인 상세 워크스페이스]
             ========================================= */}
          <main className="flex-1 bg-white flex flex-col min-h-0 overflow-hidden">
            
            {/* 1. 서술형 문항 채점 탭 */}
            {activeTab === 'grading' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {loadingGrading ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-16 space-y-3">
                    <Loader2 size={36} className="animate-spin text-violet-600" />
                    <p className="text-sm font-bold text-slate-600">서술형 채점 대기 목록을 불러오는 중...</p>
                  </div>
                ) : gradingItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-16 text-center space-y-3 bg-slate-50/30">
                    <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                      <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-base font-black text-slate-800">모든 서술형 채점이 완료되었습니다!</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      현재 대기 중인 학생 답안이 없습니다. 새로운 답안이 제출되면 알림 센터에 자동으로 나타납니다.
                    </p>
                    <button
                      type="button"
                      onClick={fetchGradingItems}
                      className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      다시 확인하기
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    
                    {/* 좌측 서브목록: 채점 대기 문항 카드들 (4 cols) */}
                    <div className="md:col-span-4 bg-slate-50/80 p-4 overflow-y-auto space-y-2 scrollbar-thin">
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>채점 대기 목록 ({gradingItems.length})</span>
                        <span className="text-[10px] text-violet-600 font-bold">항목 클릭 시 선택</span>
                      </div>

                      {gradingItems.map((it, idx) => {
                        const isSelected = idx === selectedGradingIndex;
                        return (
                          <div
                            key={`${it.submission_id}_${it.question_id}`}
                            onClick={() => setSelectedGradingIndex(idx)}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none text-xs space-y-1.5 ${
                              isSelected
                                ? 'bg-white border-violet-500 shadow-md shadow-violet-100 ring-2 ring-violet-500/10'
                                : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-black text-slate-800">
                                <User size={13} className="text-violet-600" />
                                <span>{it.student_name}</span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 font-black text-[10px]">
                                문항 {it.question_number}번
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 truncate font-medium" title={it.exam_title}>
                              {it.exam_title}
                            </p>

                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                              <span>배점: {it.points}점</span>
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(it.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 우측 상세: 답안 비교 및 판정 뷰 (8 cols) */}
                    {currentGradingItem && (
                      <div className="md:col-span-8 p-6 overflow-y-auto space-y-5 bg-white flex flex-col justify-between">
                        <div className="space-y-5">
                          {/* 문항 헤더 정보 */}
                          <div className="flex items-center justify-between bg-violet-50/60 p-4 rounded-2xl border border-violet-100">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-violet-600 text-white font-black flex items-center justify-center text-xs">
                                  {currentGradingItem.question_number}
                                </span>
                                <h4 className="text-sm font-black text-slate-800">
                                  {currentGradingItem.student_name} 학생의 답안 검토
                                </h4>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 font-medium">
                                시험지: <span className="font-bold text-slate-700">{currentGradingItem.exam_title}</span> (배점: {currentGradingItem.points}점)
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {currentGradingItem.image_url && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(currentGradingItem.image_url)}
                                  className="px-3 py-1.5 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-xs font-black flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                                >
                                  <Eye size={14} />
                                  문제 원본 보기
                                </button>
                              )}
                              {currentGradingItem.solution_drive_id && (
                                <a
                                  href={`https://lh3.googleusercontent.com/d/${currentGradingItem.solution_drive_id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-violet-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                                >
                                  <ExternalLink size={13} />
                                  해설 파일
                                </a>
                              )}
                            </div>
                          </div>

                          {/* 2단 비교: 학생 답안 vs 시스템 모범 정답 */}
                          <div className="grid grid-cols-1 gap-4">
                            
                            {/* 1. 학생 제출 답안 */}
                            <div className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                  <span className="text-xs font-black text-indigo-900 uppercase tracking-wider">
                                    🧑‍🎓 학생이 실제 제출한 답안
                                  </span>
                                </div>
                                <span className="text-[10px] text-indigo-600 font-bold bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                                  학생: {currentGradingItem.student_name}
                                </span>
                              </div>

                              <div className="p-3.5 bg-white rounded-xl border border-indigo-100 text-slate-900 font-black text-sm whitespace-pre-wrap leading-relaxed shadow-2xs">
                                {currentGradingItem.user_answer ? currentGradingItem.user_answer : (
                                  <span className="text-slate-400 italic font-normal">(제출된 텍스트 답안 없음)</span>
                                )}
                              </div>

                              {currentGradingItem.proof_image_url && (
                                <div className="pt-2 flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-600">풀이 사진 첨부됨:</span>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(currentGradingItem.proof_image_url!)}
                                    className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                                  >
                                    <Eye size={12} />
                                    학생 풀이 노트 확인
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* 2. 시스템 추출 모범 정답 */}
                            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <BookOpen size={14} className="text-violet-600" />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                                    📖 모범 정답 및 해설 가이드
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  채점 기준
                                </span>
                              </div>

                              <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-slate-800 font-bold text-xs whitespace-pre-wrap leading-relaxed shadow-2xs">
                                {currentGradingItem.correct_answer || currentGradingItem.raw_answer}
                              </div>

                              {currentGradingItem.raw_answer && currentGradingItem.raw_answer !== currentGradingItem.correct_answer && (
                                <div className="text-[11px] text-slate-400 px-1 truncate" title={currentGradingItem.raw_answer}>
                                  해설 원문: {currentGradingItem.raw_answer}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 하단 판정 액션 바 */}
                        <div className="pt-4 border-t border-slate-200 space-y-3.5 mt-4">
                          <div className="flex items-center justify-between bg-violet-50/70 p-3 rounded-xl border border-violet-200">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-violet-900">
                              <input
                                type="checkbox"
                                checked={showSolutionCheck}
                                onChange={(e) => setShowSolutionCheck(e.target.checked)}
                                className="w-4 h-4 text-violet-600 rounded focus:ring-violet-500 accent-violet-600 cursor-pointer"
                              />
                              <span>학생에게 모범 정답 및 원본 해설 페이지 열람 허용</span>
                            </label>
                            <span className="text-[11px] text-violet-600 font-medium hidden sm:inline">
                              * 채점 완료 시 학생 결과 화면에 풀이가 공개됩니다.
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              disabled={isSubmittingGrade}
                              onClick={() => handleGrade(true)}
                              className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 hover:shadow-none transition-all cursor-pointer"
                            >
                              {isSubmittingGrade ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 size={18} />
                                  <span>⭕ 정답 인정 ({currentGradingItem.points}점 부여)</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isSubmittingGrade}
                              onClick={() => handleGrade(false)}
                              className="py-3.5 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-200 hover:shadow-none transition-all cursor-pointer"
                            >
                              {isSubmittingGrade ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  <XCircle size={18} />
                                  <span>❌ 오답 처리 (0점)</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2. 전체 알림 모아보기 탭 */}
            {activeTab === 'all' && (
              <div className="flex-1 p-8 overflow-y-auto space-y-6">
                <div>
                  <h3 className="text-base font-black text-slate-800">전체 알림 피드</h3>
                  <p className="text-xs text-slate-400">모든 알림의 상태와 우선순위를 한눈에 확인합니다.</p>
                </div>

                <div className="space-y-3">
                  {/* 서술형 채점 요약 카드 */}
                  <div 
                    onClick={() => setActiveTab('grading')}
                    className="p-4 bg-violet-50/60 rounded-2xl border border-violet-100 flex items-center justify-between hover:bg-violet-50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-sm">
                        <FileCheck size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-slate-800">서술형 문항 채점 대기</h4>
                          {gradingItems.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                              {gradingItems.length}건 대기
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {gradingItems.length > 0
                            ? `최근 제출자: ${gradingItems[0].student_name} 학생 외 ${gradingItems.length - 1}명`
                            : '현재 모든 서술형 채점이 완료되었습니다.'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-violet-600 group-hover:translate-x-1 transition-transform">
                      채점하러 가기 →
                    </span>
                  </div>

                  {/* 실시간 질문 요약 카드 */}
                  <div 
                    onClick={() => setActiveTab('questions')}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between hover:bg-slate-100/70 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                        <MessageSquare size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-slate-800">실시간 학생 질문 (Q&A)</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                            0건 대기
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">현재 대기 중인 학생 질문이 없습니다.</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">
                      열기 →
                    </span>
                  </div>

                  {/* 건의사항 요약 카드 */}
                  <div 
                    onClick={() => setActiveTab('feedback')}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between hover:bg-slate-100/70 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                        <HelpCircle size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-slate-800">학생 건의함 및 피드백</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                            0건
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">새로운 건의사항이 없습니다.</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-amber-600 transition-colors">
                      열기 →
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 학생 실시간 질문 탭 (준비/확장 슬롯) */}
            {activeTab === 'questions' && (
              <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/40">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                  <MessageSquare size={32} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">실시간 학생 질문 채널 (Q&A)</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    학생 태블릿 앱의 질문하기 기능과 실시간 WebSocket으로 연동될 예정입니다. 학생이 문제를 풀다 질문을 남기면 즉시 이곳에 푸시 알림으로 등록됩니다.
                  </p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2 text-left max-w-md w-full shadow-2xs">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" />
                    예정된 연동 기능:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-500 text-[11px]">
                    <li>학생이 질문한 시험 문항 및 풀이 화면 즉시 공유</li>
                    <li>선생님 텍스트/음성 답변 실시간 전송</li>
                    <li>자주 묻는 질문(FAQ) 등록 및 일괄 답변</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 4. 학생 건의함 탭 (준비/확장 슬롯) */}
            {activeTab === 'feedback' && (
              <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/40">
                <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
                  <HelpCircle size={32} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">학생 건의 및 소통함</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    학생들이 수업, 교재, 학원 생활에 대해 남긴 익명/실명 건의사항이 수집됩니다.
                  </p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2 text-left max-w-md w-full shadow-2xs">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-500" />
                    수신 대기 상태:
                  </p>
                  <p className="text-[11px] text-slate-400">
                    현재 등록된 건의사항이 없습니다. 신규 접수 시 뱃지와 함께 목록이 활성화됩니다.
                  </p>
                </div>
              </div>
            )}

            {/* 5. 이상행동 / 부정감지 탭 */}
            {activeTab === 'security' && (
              <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/40">
                <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner">
                  <ShieldAlert size={32} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">시험 화면 이탈 및 보안 감지</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    온라인 테스트 응시 중 학생 태블릿의 브라우저 이탈, 다른 앱 전환, 비정상적 조작 로그가 기록됩니다.
                  </p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>현재 시험 진행 중인 모든 학생의 세션이 정상 보안 상태입니다.</span>
                </div>
              </div>
            )}

          </main>
        </div>

      </div>

      {/* 이미지 미리보기 팝업 */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] bg-white rounded-2xl p-2 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-1.5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <img src={previewImage} alt="미리보기" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

    </div>
  );
}
