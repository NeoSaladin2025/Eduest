'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileCheck, 
  Plus, 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  ArrowLeft, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  CheckSquare, 
  Square, 
  Users, 
  Clock, 
  Calendar, 
  Eye, 
  Sparkles, 
  Loader2, 
  Check, 
  AlertCircle, 
  Search,
  ExternalLink,
  Edit2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { supabase } from '@/lib/supabase';
import { TestCategory, TestBankItem } from '@/app/api/test2/bank/route';

interface Student {
  id: string;
  name: string;
  grade: string;
}

const GRADES = ['ALL', '중1', '중2', '중3', '고1', '고2', '고3'];

export default function ExamManagerMain() {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [loading, setLoading] = useState(true);

  // 시험지 목록
  const [exams, setExams] = useState<ExamPaper[]>([]);
  // 학생 목록
  const [students, setStudents] = useState<Student[]>([]);

  // 🌟 시험 DB 상태 (테스트자료 관리에서 구축된 카테고리 및 문항들)
  const [bankGradeFilter, setBankGradeFilter] = useState('고1');
  const [bankCategories, setBankCategories] = useState<TestCategory[]>([]);
  const [bankItems, setBankItems] = useState<TestBankItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // ── 시험지 생성 폼 상태 ──
  const [examTitle, setExamTitle] = useState('');
  const [examGrade, setExamGrade] = useState('고1');
  const [examDuration, setExamDuration] = useState(50);
  
  // 선택된 문제들 (바구니)
  const [selectedFiles, setSelectedFiles] = useState<{
    drive_id: string;
    name: string;
    question_image_drive_id?: string | null;
    folder_name?: string | null;
    folder_path?: string | null;
    question_number?: number | null;
    display_name?: string | null;
  }[]>([]);
  // 추출된 문제 정보 (이미지 URL, 정답 등)
  const [extractedQuestions, setExtractedQuestions] = useState<ExamQuestion[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);

  // 배정할 학생 IDs
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [studentGradeFilter, setStudentGradeFilter] = useState('ALL');

  // ── 모달 상태 ──
  // 학생 배정 수정 모달
  const [assignModalExam, setAssignModalExam] = useState<ExamPaper | null>(null);
  const [modalAssignedIds, setModalAssignedIds] = useState<string[]>([]);
  const [modalSaving, setModalSaving] = useState(false);

  // 응시 결과 현황 모달
  const [resultsModalExam, setResultsModalExam] = useState<ExamPaper | null>(null);
  const [examSubmissions, setExamSubmissions] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // 문제 미리보기 모달
  const [previewQuestion, setPreviewQuestion] = useState<ExamQuestion | null>(null);

  // 1. 초기 데이터 로드 (시험지 목록, 학생 목록)
  const loadInitialData = async () => {
    try {
      setLoading(true);

      // 1) 시험지 목록 조회
      const examRes = await fetch('/api/test2/exam');
      const examData = await examRes.json();
      if (examData.success) {
        setExams(examData.exams || []);
      }

      // 2) 학생 목록 조회
      const { data: studentList } = await supabase
        .from('students')
        .select('id, name, grade')
        .order('grade', { ascending: true })
        .order('name', { ascending: true });
      if (studentList) {
        setStudents(studentList);
      }
    } catch (e) {
      console.error('Failed to load initial data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 2. 시험 DB 데이터 로드 (학년 필터 적용)
  const loadBankForExamCreation = async (grade: string) => {
    try {
      setLoadingBank(true);
      const res = await fetch(`/api/test2/bank?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      if (data.success) {
        const catList: TestCategory[] = data.categories || [];
        setBankCategories(catList);
        setBankItems(data.items || []);

        // 모든 카테고리 기본 펼치기
        const initialExpanded = new Set<string>();
        catList.forEach(c => initialExpanded.add(c.id));
        setExpandedCategories(initialExpanded);
      } else {
        setBankCategories([]);
        setBankItems([]);
      }
    } catch (e) {
      console.error('Failed to load bank for exam:', e);
    } finally {
      setLoadingBank(false);
    }
  };

  // 학년 필터 또는 탭 진입 시 시험 DB 로드
  useEffect(() => {
    if (activeTab === 'create') {
      loadBankForExamCreation(bankGradeFilter);
    }
  }, [activeTab, bankGradeFilter]);

  // 카테고리 접기/펼치기 토글
  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // 문제 바구니에 파일 추가/제거 토글
  const toggleSelectFile = (file: {
    drive_id: string;
    name: string;
    question_image_drive_id?: string | null;
    folder_name?: string | null;
    folder_path?: string | null;
    question_number?: number | null;
    display_name?: string | null;
  }) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.drive_id === file.drive_id);
      if (exists) {
        return prev.filter(f => f.drive_id !== file.drive_id);
      } else {
        return [...prev, file];
      }
    });
    setExtractionDone(false);
  };

  // 특정 카테고리 안의 모든 문제 일괄 선택
  const handleSelectAllInCategory = (categoryId: string) => {
    const catItems = bankItems.filter(i => i.category_id === categoryId);
    setSelectedFiles(prev => {
      const currentIds = new Set(prev.map(f => f.drive_id));
      const toAdd = catItems
        .filter(item => !currentIds.has(item.drive_id))
        .map(item => ({
          drive_id: item.drive_id,
          name: item.name,
          question_image_drive_id: item.question_image_drive_id,
          folder_name: item.folder_name,
          folder_path: item.folder_path,
          question_number: item.question_number,
          display_name: item.display_name,
        }));
      return [...prev, ...toAdd];
    });
    setExtractionDone(false);
  };

  // 문제 바구니 순서 이동 (위로)
  const moveFileUp = (index: number) => {
    if (index === 0) return;
    const next = [...selectedFiles];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setSelectedFiles(next);

    if (extractedQuestions.length === next.length) {
      const nextQ = [...extractedQuestions];
      const tempQ = nextQ[index - 1];
      nextQ[index - 1] = nextQ[index];
      nextQ[index] = tempQ;
      setExtractedQuestions(nextQ);
    }
  };

  // 문제 바구니 순서 이동 (아래로)
  const moveFileDown = (index: number) => {
    if (index === selectedFiles.length - 1) return;
    const next = [...selectedFiles];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setSelectedFiles(next);

    if (extractedQuestions.length === next.length) {
      const nextQ = [...extractedQuestions];
      const tempQ = nextQ[index + 1];
      nextQ[index + 1] = nextQ[index];
      nextQ[index] = tempQ;
      setExtractedQuestions(nextQ);
    }
  };

  // 문제 삭제
  const removeSelectedFile = (driveId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.drive_id !== driveId));
    setExtractedQuestions(prev => prev.filter(q => q.drive_id !== driveId));
  };

  // 🌟 문제 이미지 및 정답 자동 추출 API 호출
  const handleExtractQuestions = async () => {
    if (selectedFiles.length === 0) {
      alert('시험지에 포함할 문제를 최소 1개 이상 선택해주세요.');
      return;
    }

    try {
      setIsExtracting(true);
      const res = await fetch('/api/test2/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedFiles }),
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.questions)) {
        setExtractedQuestions(data.questions);
        setExtractionDone(true);
      } else {
        alert(`문제 추출 중 오류: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e: any) {
      console.error('Failed to extract questions:', e);
      alert('문제 추출 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  // 선생님의 정답 수정 반영
  const handleUpdateQuestionAnswer = (qIndex: number, newAnswer: string) => {
    setExtractedQuestions(prev => {
      const next = [...prev];
      next[qIndex] = {
        ...next[qIndex],
        answer: newAnswer,
      };
      return next;
    });
  };

  // 학생 배정 체크박스 토글
  const toggleStudentAssign = (studentId: string) => {
    setAssignedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  // 필터링된 학생 전체 선택 / 해제
  const handleSelectAllFilteredStudents = (studentsToSelect: Student[]) => {
    const idsToSelect = studentsToSelect.map(s => s.id);
    const allSelected = idsToSelect.every(id => assignedStudentIds.includes(id));
    if (allSelected) {
      setAssignedStudentIds(prev => prev.filter(id => !idsToSelect.includes(id)));
    } else {
      setAssignedStudentIds(prev => Array.from(new Set([...prev, ...idsToSelect])));
    }
  };

  // 🚀 최종 시험지 생성 및 저장
  const handleCreateExam = async () => {
    if (!examTitle.trim()) {
      alert('시험지 제목을 입력해주세요.');
      return;
    }
    if (selectedFiles.length === 0) {
      alert('시험지에 포함할 문제를 선택해주세요.');
      return;
    }
    if (!extractionDone || extractedQuestions.length === 0) {
      alert('먼저 [문제 이미지 및 정답 추출]을 실행해주세요.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/test2/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade: examGrade,
          duration_min: examDuration,
          questions: extractedQuestions,
          assigned_student_ids: assignedStudentIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`🎉 '${examTitle}' 시험지가 성공적으로 생성되었습니다! (${assignedStudentIds.length}명 배정됨)`);
        setExamTitle('');
        setSelectedFiles([]);
        setExtractedQuestions([]);
        setExtractionDone(false);
        setAssignedStudentIds([]);
        setActiveTab('list');
        loadInitialData();
      } else {
        alert(`시험지 생성 실패: ${data.error}`);
      }
    } catch (e: any) {
      console.error('Failed to create exam:', e);
      alert('시험지 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 시험지 삭제
  const handleDeleteExam = async (examId: string, title: string) => {
    if (!confirm(`'${title}' 시험지를 정말 삭제하시겠습니까? 배정된 학생들의 기록도 삭제됩니다.`)) return;

    try {
      const res = await fetch(`/api/test2/exam?examId=${examId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setExams(prev => prev.filter(e => e.id !== examId));
        alert('시험지가 삭제되었습니다.');
      } else {
        alert(`삭제 실패: ${data.error}`);
      }
    } catch (e) {
      alert('시험지 삭제 중 오류가 발생했습니다.');
    }
  };

  // 배정 모달 열기
  const handleOpenAssignModal = (exam: ExamPaper) => {
    setAssignModalExam(exam);
    setModalAssignedIds(exam.assigned_student_ids || []);
  };

  // 배정 모달 저장
  const handleSaveAssignment = async () => {
    if (!assignModalExam) return;
    try {
      setModalSaving(true);
      const res = await fetch('/api/test2/exam', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: assignModalExam.id,
          assigned_student_ids: modalAssignedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExams(prev =>
          prev.map(e => (e.id === assignModalExam.id ? { ...e, assigned_student_ids: modalAssignedIds } : e))
        );
        alert('학생 배정이 업데이트되었습니다.');
        setAssignModalExam(null);
      } else {
        alert(`배정 실패: ${data.error}`);
      }
    } catch (e) {
      alert('배정 저장 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  // 응시 결과 현황 모달 열기
  const handleOpenResultsModal = async (exam: ExamPaper) => {
    setResultsModalExam(exam);
    setLoadingResults(true);
    try {
      const { data } = await supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', 'test2_student_submissions_data')
        .maybeSingle();

      if (data?.file_data) {
        const parsed = JSON.parse(data.file_data);
        const list = Array.isArray(parsed.submissions)
          ? parsed.submissions.filter((s: any) => s.exam_id === exam.id)
          : [];
        setExamSubmissions(list);
      } else {
        setExamSubmissions([]);
      }
    } catch (e) {
      console.error('Failed to load submissions:', e);
      setExamSubmissions([]);
    } finally {
      setLoadingResults(false);
    }
  };

  // 학생 필터링
  const filteredStudents = useMemo(() => {
    if (studentGradeFilter === 'ALL') return students;
    return students.filter(s => s.grade.includes(studentGradeFilter));
  }, [students, studentGradeFilter]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 헤더 & 탭 스위처 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-violet-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-violet-200">
              <FileCheck size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              테스트 관리
            </h1>
            <span className="text-xs px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full font-bold">
              시험지 제작 및 배정 센터
            </span>
          </div>
          <p className="text-sm font-medium text-slate-500">
            [테스트자료 관리]에서 선별·구축된 시험 DB에서 문제를 골라 맞춤 시험지를 제작하고 학생들에게 배정합니다.
          </p>
        </div>

        {/* 탭 전환 버튼 */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'list'
                ? 'bg-white text-violet-700 shadow-sm scale-[1.02]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck size={16} />
            시험지 목록 ({exams.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'create'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-[1.02]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus size={16} strokeWidth={3} />
            새 시험지 만들기
          </button>
        </div>
      </div>

      {/* 2. 탭 1: 시험지 목록 */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {exams.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto">
                <FileCheck size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-700">생성된 시험지가 없습니다</h3>
                <p className="text-xs text-slate-400">
                  우측 상단의 [새 시험지 만들기] 버튼을 눌러 첫 번째 맞춤 시험지를 제작해보세요!
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="mt-4 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-violet-200"
              >
                + 새 시험지 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map(exam => {
                const assignedCount = exam.assigned_student_ids ? exam.assigned_student_ids.length : 0;
                return (
                  <div
                    key={exam.id}
                    className="bg-white rounded-3xl border border-slate-200 hover:border-violet-400 p-6 shadow-xs hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      {/* 카드 상단 배지 */}
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-black rounded-lg">
                          {exam.grade}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                          <Clock size={14} />
                          <span>{exam.duration_min}분</span>
                        </div>
                      </div>

                      {/* 시험지 타이틀 */}
                      <div>
                        <h3 className="text-xl font-black text-slate-800 group-hover:text-violet-700 transition-colors line-clamp-1">
                          {exam.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-1">
                          총 {exam.questions.length}문항 • 생성일: {new Date(exam.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* 배정 현황 박스 */}
                      <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-600">배정된 학생</span>
                        </div>
                        <span className="text-sm font-black text-violet-700">
                          {assignedCount}명
                        </span>
                      </div>
                    </div>

                    {/* 카드 하단 액션 버튼바 */}
                    <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenAssignModal(exam)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                          title="학생 배정 관리"
                        >
                          <Users size={14} />
                          배정 관리
                        </button>
                        <button
                          onClick={() => handleOpenResultsModal(exam)}
                          className="px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                          title="학생별 응시 결과 확인"
                        >
                          <Eye size={14} />
                          응시 현황
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteExam(exam.id, exam.title)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        title="시험지 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. 탭 2: 새 시험지 만들기 */}
      {activeTab === 'create' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* STEP 1: 기본 정보 설정 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 font-black text-slate-800 text-base">
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">1</span>
              <span>시험지 기본 정보 설정</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  시험지 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  placeholder="예: 3월 모의평가 대비 핵심 빈출 20제"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  대상 학년
                </label>
                <select
                  value={examGrade}
                  onChange={e => {
                    setExamGrade(e.target.value);
                    if (e.target.value !== '공통') {
                      setBankGradeFilter(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold bg-white"
                >
                  <option value="공통">공통</option>
                  <option value="중1">중1</option>
                  <option value="중2">중2</option>
                  <option value="중3">중3</option>
                  <option value="고1">고1</option>
                  <option value="고2">고2</option>
                  <option value="고3">고3</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  제한 시간 (분)
                </label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={examDuration}
                  onChange={e => setExamDuration(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 text-sm font-bold"
                />
              </div>
            </div>
          </div>

          {/* STEP 2: 시험 DB 카테고리에서 문항 선택 (2패널) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-base">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">2</span>
                <span>시험 DB에서 문항 선택</span>
                <span className="text-xs font-normal text-slate-400">
                  ([테스트자료 관리]에서 선별 등록된 카테고리별 시험 문제입니다)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* 학년 필터 */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  {GRADES.map(g => (
                    <button
                      key={g}
                      onClick={() => setBankGradeFilter(g)}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        bankGradeFilter === g ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {g === 'ALL' ? '전체' : g}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-xl shrink-0">
                  선택된 문제: {selectedFiles.length}개
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[450px]">
              
              {/* 좌측: 시험 DB 카테고리별 문항 목록 */}
              <div className="border border-slate-200 rounded-2xl p-4 flex flex-col bg-slate-50/50">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <Layers size={16} className="text-indigo-600" />
                    {bankGradeFilter === 'ALL' ? '전체' : bankGradeFilter} 시험 DB 카테고리 ({bankCategories.length}개)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    전체 {bankItems.length}개 시험문제
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[420px] pr-2 scrollbar-thin space-y-2">
                  {loadingBank ? (
                    <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <Loader2 size={24} className="animate-spin text-violet-600" />
                      <span>시험 DB를 불러오는 중입니다...</span>
                    </div>
                  ) : bankCategories.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                      <AlertCircle size={32} className="mx-auto text-amber-500 opacity-50" />
                      <p className="font-bold">{bankGradeFilter === 'ALL' ? '등록된' : `${bankGradeFilter}에 등록된`} 시험자료가 없습니다.</p>
                      <p className="text-[11px] text-slate-400">
                        상단의 <strong>[테스트자료 관리]</strong> 메뉴에서 원천 DB 문제를 카테고리에 먼저 담아주세요!
                      </p>
                    </div>
                  ) : (
                    bankCategories.map(cat => {
                      const isExpanded = expandedCategories.has(cat.id);
                      const itemsInCat = bankItems.filter(i => i.category_id === cat.id);

                      return (
                        <div key={cat.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                          {/* 카테고리 헤더 */}
                          <div
                            onClick={() => toggleCategoryExpand(cat.id)}
                            className="flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                              <Folder size={16} className="text-indigo-600 shrink-0" />
                              <span className="font-black text-xs text-slate-800 truncate">{cat.name}</span>
                              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded font-bold">
                                {itemsInCat.length}문제
                              </span>
                            </div>

                            {itemsInCat.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSelectAllInCategory(cat.id); }}
                                className="px-2 py-0.5 bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white rounded text-[10px] font-bold transition-all shrink-0 ml-2"
                                title="이 카테고리의 모든 문제 담기"
                              >
                                + 전체 담기
                              </button>
                            )}
                          </div>

                          {/* 카테고리 안의 문제 목록 */}
                          {isExpanded && itemsInCat.length > 0 && (
                            <div className="p-2 border-t border-slate-100 bg-slate-50/50 space-y-1">
                              {itemsInCat.map(item => {
                                const isSelected = selectedFiles.some(f => f.drive_id === item.drive_id);
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => toggleSelectFile({
                                      drive_id: item.drive_id,
                                      name: item.name,
                                      question_image_drive_id: item.question_image_drive_id,
                                      folder_name: item.folder_name,
                                      folder_path: item.folder_path,
                                      question_number: item.question_number,
                                      display_name: item.display_name,
                                    })}
                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                      isSelected
                                        ? 'bg-violet-50 text-violet-700 font-bold border border-violet-200'
                                        : 'hover:bg-white text-slate-600'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                      {isSelected ? (
                                        <CheckSquare size={15} className="text-violet-600 shrink-0" />
                                      ) : (
                                        <Square size={15} className="text-slate-300 shrink-0" />
                                      )}
                                      <FileText size={14} className={isSelected ? 'text-violet-600' : 'text-slate-400'} />
                                      {item.folder_name && (
                                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-black shrink-0">
                                          {item.folder_name}
                                        </span>
                                      )}
                                      {item.question_number && (
                                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 rounded text-[10px] font-black shrink-0">
                                          {item.question_number}번
                                        </span>
                                      )}
                                      <span className="truncate">{item.name}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 shrink-0 ml-1">{item.grade}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 우측: 선택된 시험지 문항 바구니 (순서 변경 / 삭제 / 추출 트리거) */}
              <div className="border border-slate-200 rounded-2xl p-4 flex flex-col bg-white">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <FileCheck size={16} className="text-violet-600" />
                    시험지 문항 구성 바구니 ({selectedFiles.length}개)
                  </span>

                  {selectedFiles.length > 0 && (
                    <button
                      onClick={() => { setSelectedFiles([]); setExtractedQuestions([]); setExtractionDone(false); }}
                      className="text-[11px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
                    >
                      전체 비우기
                    </button>
                  )}
                </div>

                {selectedFiles.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                    <CheckSquare size={32} className="opacity-30" />
                    <p className="text-xs font-bold">왼쪽 시험 DB 카테고리에서 시험에 넣을 문제를 선택해주세요.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 pr-1 scrollbar-thin">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={file.drive_id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-md bg-violet-600 text-white font-black flex items-center justify-center text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          {file.folder_name && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-black shrink-0">
                              {file.folder_name}
                            </span>
                          )}
                          {file.question_number && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 rounded text-[10px] font-black shrink-0">
                              {file.question_number}번
                            </span>
                          )}
                          <span className="font-bold text-slate-800 truncate">{file.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveFileUp(idx)}
                            disabled={idx === 0}
                            className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-all"
                            title="위로 이동"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFileDown(idx)}
                            disabled={idx === selectedFiles.length - 1}
                            className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-all"
                            title="아래로 이동"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(file.drive_id)}
                            className="p-1 hover:bg-rose-100 rounded text-slate-400 hover:text-rose-600 transition-all ml-1"
                            title="제거"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 문제 추출 버튼 */}
                {selectedFiles.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 mt-auto">
                    <button
                      type="button"
                      onClick={handleExtractQuestions}
                      disabled={isExtracting}
                      className={`w-full py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        extractionDone
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                          : 'bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-200'
                      }`}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>문제 이미지 & 정답 자동 분석 중...</span>
                        </>
                      ) : extractionDone ? (
                        <>
                          <Check size={16} />
                          <span>문제 분석 완료 (다시 분석하려면 클릭)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>선택한 {selectedFiles.length}개 문제 이미지 및 정답 추출하기</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 추출 결과 미리보기 및 정답 확인/수정 패널 */}
            {extractionDone && extractedQuestions.length > 0 && (
              <div className="bg-violet-50/50 border border-violet-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-violet-800 font-black text-sm">
                    <Sparkles size={18} className="text-violet-600" />
                    <span>추출된 문항 정보 & 정답 검토 (직접 수정 가능)</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    * 학생 제출 시 이 정답을 기준으로 자동 채점됩니다.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {extractedQuestions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="bg-white p-3.5 rounded-xl border border-violet-100 shadow-xs space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-violet-700">문항 {idx + 1}</span>
                        {q.image_url ? (
                          <button
                            type="button"
                            onClick={() => setPreviewQuestion(q)}
                            className="text-[11px] text-violet-600 hover:underline flex items-center gap-1 font-bold"
                          >
                            <Eye size={13} />
                            이미지 보기
                          </button>
                        ) : (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                            이미지 없음
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5" title={q.name}>
                        {q.folder_name && (
                          <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold shrink-0">
                            {q.folder_name}
                          </span>
                        )}
                        {q.question_number && (
                          <span className="px-1 py-0.2 bg-violet-100 text-violet-800 rounded text-[9px] font-bold shrink-0">
                            {q.question_number}번
                          </span>
                        )}
                        <span className="truncate">{q.name}</span>
                      </div>

                      {/* 정답 입력/수정란 */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">
                          설정 정답 (채점 기준)
                        </label>
                        <input
                          type="text"
                          value={q.answer}
                          onChange={e => handleUpdateQuestionAnswer(idx, e.target.value)}
                          placeholder="정답 (예: 5 또는 83)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-violet-500 font-black text-slate-800 text-xs"
                        />
                      </div>

                      {q.raw_answer && q.raw_answer !== q.answer && (
                        <div className="text-[10px] text-slate-400 truncate" title={q.raw_answer}>
                          원본 텍스트: {q.raw_answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: 학생 배정 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-base">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">3</span>
                <span>시험지 배정할 학생 선택</span>
                <span className="text-xs font-normal text-slate-400">
                  (배정된 학생의 TEST2 메뉴에 나타납니다)
                </span>
              </div>

              {/* 학년 필터 & 전체 선택 */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  {['ALL', '고1', '고2', '고3', '중1', '중2', '중3'].map(g => (
                    <button
                      key={g}
                      onClick={() => setStudentGradeFilter(g)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        studentGradeFilter === g ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      {g === 'ALL' ? '전체' : g}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectAllFilteredStudents(filteredStudents)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  현재 목록 전체 선택
                </button>
              </div>
            </div>

            {/* 학생 카드 그리드 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
              {filteredStudents.map(st => {
                const isChecked = assignedStudentIds.includes(st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => toggleStudentAssign(st.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                      isChecked
                        ? 'bg-violet-50 border-violet-500 shadow-xs'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-black text-slate-400 block">{st.grade}</span>
                      <span className="text-sm font-black text-slate-800">{st.name}</span>
                    </div>

                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isChecked ? 'bg-violet-600 text-white' : 'border border-slate-300 bg-white'}`}>
                      {isChecked && <Check size={14} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs font-bold text-slate-500 text-right">
              총 <span className="text-violet-600 font-black">{assignedStudentIds.length}명</span>의 학생에게 배정됩니다.
            </div>
          </div>

          {/* 발행 버튼 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600 transition-all"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreateExam}
              disabled={loading || selectedFiles.length === 0}
              className="px-8 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-violet-200 flex items-center gap-2"
            >
              <Check size={18} strokeWidth={3} />
              시험지 발행 및 학생 배정 완료
            </button>
          </div>

        </div>
      )}

      {/* 4. 학생 배정 관리 모달 */}
      {assignModalExam && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  '{assignModalExam.title}' 학생 배정 관리
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  시험을 치를 학생을 체크하거나 해제하세요.
                </p>
              </div>
              <button
                onClick={() => setAssignModalExam(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[350px] overflow-y-auto p-1 scrollbar-thin">
              {students.map(st => {
                const isChecked = modalAssignedIds.includes(st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      setModalAssignedIds(prev =>
                        prev.includes(st.id) ? prev.filter(id => id !== st.id) : [...prev, st.id]
                      );
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                      isChecked ? 'bg-violet-50 border-violet-500 font-bold' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] text-slate-400 block">{st.grade}</span>
                      <span className="font-black text-slate-800">{st.name}</span>
                    </div>
                    <div className={`w-4 h-4 rounded flex items-center justify-center ${isChecked ? 'bg-violet-600 text-white' : 'border border-slate-300 bg-white'}`}>
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                선택됨: <strong className="text-violet-600 font-black">{modalAssignedIds.length}명</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAssignModalExam(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={modalSaving}
                  className="px-5 py-2 text-xs font-black text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all shadow-md shadow-violet-200 flex items-center gap-1.5"
                >
                  {modalSaving && <Loader2 size={14} className="animate-spin" />}
                  배정 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 응시 결과 현황 모달 */}
      {resultsModalExam && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  '{resultsModalExam.title}' 학생 응시 현황
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  총 {resultsModalExam.assigned_student_ids?.length || 0}명 배정 • 제출 완료 {examSubmissions.length}명
                </p>
              </div>
              <button
                onClick={() => setResultsModalExam(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            {loadingResults ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-violet-600 mx-auto" />
                <p className="text-xs text-slate-400 font-bold">응시 데이터를 불러오는 중...</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[400px] border border-slate-200 rounded-2xl scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                    <tr>
                      <th className="p-3">학생</th>
                      <th className="p-3">학년</th>
                      <th className="p-3">상태</th>
                      <th className="p-3">점수</th>
                      <th className="p-3">맞힌 개수</th>
                      <th className="p-3">제출 시각</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(resultsModalExam.assigned_student_ids || []).map(studentId => {
                      const st = students.find(s => s.id === studentId);
                      const sub = examSubmissions.find(s => s.student_id === studentId);
                      return (
                        <tr key={studentId} className="hover:bg-slate-50/80">
                          <td className="p-3 font-bold text-slate-800">{st?.name || '미등록 학생'}</td>
                          <td className="p-3 text-slate-500">{st?.grade || '-'}</td>
                          <td className="p-3">
                            {sub ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold">
                                제출 완료
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-bold">
                                미제출
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-black text-slate-700">
                            {sub ? `${sub.score}점` : '-'}
                          </td>
                          <td className="p-3 text-slate-600">
                            {sub ? `${sub.correct_count} / ${sub.total_questions}개` : '-'}
                          </td>
                          <td className="p-3 text-[11px] text-slate-400">
                            {sub ? new Date(sub.submitted_at).toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResultsModalExam(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 문제 이미지 미리보기 모달 */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-black text-slate-800 text-base">{previewQuestion.name}</h4>
                <p className="text-xs text-slate-400">추출된 정답: <strong className="text-violet-600">{previewQuestion.answer}</strong></p>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto flex items-center justify-center bg-slate-100 rounded-2xl p-4">
              {previewQuestion.image_url ? (
                <img
                  src={previewQuestion.image_url}
                  alt={previewQuestion.name}
                  className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-md"
                />
              ) : (
                <div className="text-slate-400 text-xs font-bold">이미지가 없습니다.</div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
