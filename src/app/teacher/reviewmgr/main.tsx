'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Users, 
  Search, 
  Sparkles, 
  FileCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Camera, 
  ExternalLink, 
  CheckSquare, 
  Square, 
  X, 
  Loader2, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Flame, 
  Medal, 
  Eye, 
  AlertCircle, 
  Send, 
  Layers, 
  Maximize2,
  Trash2,
  History,
  Filter,
  Calendar,
  TrendingUp,
  FileText,
  Check
} from 'lucide-react';
import { ExamPaper } from '@/app/api/test2/exam/route';

interface StudentSummary {
  id: string;
  name: string;
  grade: string;
  drive_folder_id?: string;
  folderCount: number;
  itemCount: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyRate: number;
  lastTestedAt: string | null;
}

interface ReviewFolder {
  id: string;
  name: string;
  createdAt: string;
}

interface ReviewItem {
  id: string;
  fileId: string;
  name: string;
  folderId: string;
  folderName: string;
  problemUrl?: string;
  solutionUrl?: string;
  answer?: string;
  raw_answer?: string;
  points?: number;
  lastTestedAt?: string;
  lastIsCorrect?: boolean;
  lastUserAnswer?: string;
  bestSpentSec?: number;
  timeRecords?: Array<{
    spentSec: number;
    isCorrect: boolean;
    recordedAt: string;
    userAnswer?: string;
    diffFromPrev?: number;
  }>;
}

// 헬퍼: YYYY년 MM월 DD일 HH시 mm분 ss초 포맷팅
function formatFullDateTime(isoString?: string | null): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일 ${hours}시 ${minutes}분 ${seconds}초`;
  } catch {
    return isoString;
  }
}

export default function ReviewManagerMain() {
  const [activeTab, setActiveTab] = useState<'monitoring' | 'special_tests'>('monitoring');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('전체');
  const gradeButtons = ['전체', '고1', '고2', '고3', '중1', '중2', '중3'];

  // 선택된 학생 및 해당 학생의 복습 상세 데이터
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewFolders, setReviewFolders] = useState<ReviewFolder[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);

  // 🔍 복습 문항 검색 & 상태 필터링 상태 (자유 검색어, 상태 칩, 폴더 칩)
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [itemFilterStatus, setItemFilterStatus] = useState<'ALL' | 'INCORRECT' | 'CORRECT' | 'ATTEMPTED' | 'UNATTEMPTED'>('ALL');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState('전체');

  // 📋 문항 풀이 이력 상세보기 모달 상태
  const [detailModalItem, setDetailModalItem] = useState<ReviewItem | null>(null);
  const [viewingDetailProofUrl, setViewingDetailProofUrl] = useState<string | null>(null);

  // 문항 선택 (스페셜 테스트 생성용)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // 스페셜 테스트 생성 모달
  const [isSpecialModalOpen, setIsSpecialModalOpen] = useState(false);
  const [specialTestTitle, setSpecialTestTitle] = useState('');
  const [specialDurationMin, setSpecialDurationMin] = useState(30);
  const [specialRequireProof, setSpecialRequireProof] = useState(true);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string>>(new Set());
  const [creatingExam, setCreatingExam] = useState(false);

  // 스페셜 시험지 목록 & 인증샷 모달 & 필터링
  const [specialExams, setSpecialExams] = useState<any[]>([]);
  const [specialExamsLoading, setSpecialExamsLoading] = useState(false);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [specialSearchTerm, setSpecialSearchTerm] = useState('');
  const [selectedSpecialGrade, setSelectedSpecialGrade] = useState('전체');
  const [viewingProofData, setViewingProofData] = useState<{
    studentName: string;
    examTitle: string;
    proofImages: Array<{
      question_number?: number;
      drive_id: string;
      url?: string;
      file_name?: string;
    }>;
  } | null>(null);

  // 문제 미리보기 모달
  const [previewProblemUrl, setPreviewProblemUrl] = useState<string | null>(null);

  // 1. 학생 복습 통계 요약 목록 로드
  const fetchStudentsSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/teacher/review-management');
      const data = await res.json();
      if (data.success && data.students) {
        setStudents(data.students);
        if (!selectedStudentId && data.students.length > 0) {
          setSelectedStudentId(data.students[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load students review summary:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentsSummary();
  }, []);

  // 2. 선택된 학생의 상세 복습 데이터 로드
  useEffect(() => {
    if (!selectedStudentId) return;

    const fetchStudentDetail = async () => {
      try {
        setDetailLoading(true);
        setSelectedItemIds(new Set());
        setItemSearchTerm('');
        setItemFilterStatus('ALL');
        setSelectedFolderFilter('전체');
        const res = await fetch(`/api/teacher/review-management?studentId=${selectedStudentId}`);
        const data = await res.json();
        if (data.success && data.reviewData) {
          setReviewFolders(data.reviewData.folders || []);
          setReviewItems(data.reviewData.items || []);
          setStudentSubmissions(data.studentSubmissions || []);
        } else {
          setReviewFolders([]);
          setReviewItems([]);
          setStudentSubmissions([]);
        }
      } catch (e) {
        console.error('Failed to load student review detail:', e);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchStudentDetail();
  }, [selectedStudentId]);

  // 3. 스페셜 시험지 목록 및 인증샷 로드
  const fetchSpecialExams = async () => {
    try {
      setSpecialExamsLoading(true);
      const res = await fetch('/api/teacher/review-management?mode=special_exams');
      const data = await res.json();
      if (data.success && data.specialExams) {
        setSpecialExams(data.specialExams);
      }
    } catch (e) {
      console.error('Failed to load special exams:', e);
    } finally {
      setSpecialExamsLoading(false);
    }
  };

  // 스페셜 시험지 및 연동된 구글 드라이브 인증샷 일괄 삭제
  const handleDeleteSpecialExam = async (examId: string, examTitle: string) => {
    if (
      !confirm(
        `'${examTitle}' 시험지를 삭제하시겠습니까?\n\n※ 주의: 학생들이 응시하며 제출한 모든 손글씨 풀이 인증 사진(구글 드라이브 파일)과 학생 응시 제출 기록도 함께 영구 삭제됩니다.`
      )
    ) {
      return;
    }

    try {
      setDeletingExamId(examId);
      const res = await fetch(`/api/test2/exam?examId=${examId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || '시험지 및 연동된 인증 사진이 성공적으로 삭제되었습니다.');
        await fetchSpecialExams();
      } else {
        alert(`삭제 실패: ${data.error || '오류가 발생했습니다.'}`);
      }
    } catch (err: any) {
      alert(`시험지 삭제 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setDeletingExamId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'special_tests') {
      fetchSpecialExams();
    }
  }, [activeTab]);

  // 필터링된 학생 목록
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.grade.toLowerCase().includes(searchTerm.toLowerCase());
      const matchGrade = selectedGrade === '전체' || s.grade.includes(selectedGrade);
      return matchSearch && matchGrade;
    });
  }, [students, searchTerm, selectedGrade]);

  // 필터링된 스페셜 시험지 목록 (학년 필터 + 자유 검색 대조)
  const filteredSpecialExams = useMemo(() => {
    const term = specialSearchTerm.trim().toLowerCase();
    return specialExams
      .map(exam => {
        // 1. 학년 필터 (시험지 grade 또는 배정된 학생 grade)
        const matchGrade =
          selectedSpecialGrade === '전체' ||
          exam.grade?.includes(selectedSpecialGrade) ||
          exam.assigned_students?.some((st: any) => st.student_grade?.includes(selectedSpecialGrade));

        if (!matchGrade) return null;

        // 2. 검색어가 비어있을 때는 전체 통과
        if (!term) return exam;

        // 3. 검색어 대조: 시험지 제목, 시험지 학년
        const matchExamTitle = exam.title?.toLowerCase().includes(term);
        const matchExamGrade = exam.grade?.toLowerCase().includes(term);

        // 4. 배정된 학생 정보 대조 (이름, 학년, 응시 상태, 점수 등)
        const matchingStudents = exam.assigned_students?.filter((st: any) => {
          const matchName = st.student_name?.toLowerCase().includes(term);
          const matchStGrade = st.student_grade?.toLowerCase().includes(term);
          const matchStatus = (st.is_submitted ? '제출 완료' : '미응시 대기').toLowerCase().includes(term);
          const matchScore = st.submission ? `${st.submission.score}점`.includes(term) : false;
          return matchName || matchStGrade || matchStatus || matchScore;
        }) || [];

        // 시험지 제목이나 학년에 매칭되면 학생 목록 전체 유지
        if (matchExamTitle || matchExamGrade) {
          return exam;
        }

        // 학생 정보에 매칭되면 해당 학생만 좁혀서 보여주어 검색 가독성 극대화
        if (matchingStudents.length > 0) {
          return {
            ...exam,
            assigned_students: matchingStudents,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [specialExams, specialSearchTerm, selectedSpecialGrade]);

  const totalFilteredStudentsCount = useMemo(() => {
    return filteredSpecialExams.reduce((acc: number, exam: any) => acc + (exam.assigned_students?.length || 0), 0);
  }, [filteredSpecialExams]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // 해당 학생의 고유 복습 폴더 목록
  const uniqueFolderNames = useMemo(() => {
    const set = new Set<string>();
    reviewItems.forEach(i => {
      if (i.folderName) set.add(i.folderName);
    });
    return Array.from(set);
  }, [reviewItems]);

  // 🔍 필터링된 복습 문항 목록 (자유 검색어 + 상태 필터 + 폴더 필터)
  const filteredReviewItems = useMemo(() => {
    return reviewItems.filter(item => {
      // 1. 자유 검색어 매칭 (문항명, 폴더명, 정답, 문제 번호 등 아무거나 검색)
      if (itemSearchTerm.trim()) {
        const query = itemSearchTerm.toLowerCase().trim();
        const matchName = (item.name || '').toLowerCase().includes(query);
        const matchFolder = (item.folderName || '').toLowerCase().includes(query);
        const matchAnswer = String(item.answer || '').toLowerCase().includes(query) ||
                            String(item.raw_answer || '').toLowerCase().includes(query);
        const matchUserAns = String(item.lastUserAnswer || '').toLowerCase().includes(query);
        if (!matchName && !matchFolder && !matchAnswer && !matchUserAns) {
          return false;
        }
      }

      // 2. 폴더 필터 매칭
      if (selectedFolderFilter !== '전체' && item.folderName !== selectedFolderFilter) {
        return false;
      }

      // 3. 상태 필터 매칭
      const attemptCount = item.timeRecords?.length || (item.lastTestedAt ? 1 : 0);
      const isIncorrect = item.lastIsCorrect === false || (item.timeRecords || []).some(r => !r.isCorrect);
      const isCorrect = item.lastIsCorrect === true;

      if (itemFilterStatus === 'INCORRECT') {
        return isIncorrect;
      }
      if (itemFilterStatus === 'CORRECT') {
        return isCorrect;
      }
      if (itemFilterStatus === 'ATTEMPTED') {
        return attemptCount > 0;
      }
      if (itemFilterStatus === 'UNATTEMPTED') {
        return attemptCount === 0;
      }

      return true;
    });
  }, [reviewItems, itemSearchTerm, selectedFolderFilter, itemFilterStatus]);

  // 문항 선택 토글
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // 스마트 전체 선택 / 해제 (현재 필터링된 문항들 기준)
  const handleSelectAllFilteredItems = () => {
    const allFilteredSelected = filteredReviewItems.length > 0 && 
      filteredReviewItems.every(i => selectedItemIds.has(i.id));

    if (allFilteredSelected) {
      setSelectedItemIds(prev => {
        const next = new Set(prev);
        filteredReviewItems.forEach(i => next.delete(i.id));
        return next;
      });
    } else {
      setSelectedItemIds(prev => {
        const next = new Set(prev);
        filteredReviewItems.forEach(i => next.add(i.id));
        return next;
      });
    }
  };

  // 📋 특정 문항의 시도 이력(최신순 정렬) 추출 헬퍼 (복습 퀴즈 + 스페셜 시험지 인증샷 통합)
  const getItemAttemptHistory = (item: ReviewItem) => {
    interface AttemptHistoryItem {
      id: string;
      sourceType: 'review' | 'special_exam';
      examTitle: string;
      recordedAt: string;
      isCorrect: boolean;
      userAnswer?: string;
      correctAnswer?: string;
      spentSec?: number;
      diffFromPrev?: number;
      proofImageUrl?: string;
      proofDriveId?: string;
    }

    const history: AttemptHistoryItem[] = [];

    // 1. 복습 모드 시도 기록 (timeRecords)
    if (Array.isArray(item.timeRecords) && item.timeRecords.length > 0) {
      item.timeRecords.forEach((r, idx) => {
        history.push({
          id: `rev_${r.recordedAt}_${idx}`,
          sourceType: 'review',
          examTitle: item.folderName ? `복습 [${item.folderName}]` : 'EduOS 복습 테스트',
          recordedAt: r.recordedAt,
          isCorrect: r.isCorrect,
          userAnswer: r.userAnswer || '-',
          correctAnswer: item.answer || item.raw_answer || '-',
          spentSec: r.spentSec,
          diffFromPrev: (r as any).diffFromPrev,
        });
      });
    } else if (item.lastTestedAt) {
      history.push({
        id: `rev_last_${item.lastTestedAt}`,
        sourceType: 'review',
        examTitle: item.folderName ? `복습 [${item.folderName}]` : 'EduOS 복습 테스트',
        recordedAt: item.lastTestedAt,
        isCorrect: !!item.lastIsCorrect,
        userAnswer: item.lastUserAnswer || '-',
        correctAnswer: item.answer || item.raw_answer || '-',
        spentSec: item.bestSpentSec,
      });
    }

    // 2. 스페셜 시험지 제출 기록 (studentSubmissions)에서 이 문항과 일치하는 기록 추출
    const targetDriveId = (item.fileId || item.id || '').trim();
    (studentSubmissions || []).forEach((sub: any) => {
      if (!sub || !sub.answers) return;
      Object.keys(sub.answers).forEach((qKey) => {
        const ans = sub.answers[qKey];
        const isMatch = (targetDriveId && qKey.includes(targetDriveId)) ||
                        (item.solutionUrl && ans?.solution_drive_id === item.solutionUrl) ||
                        (item.name && ans?.name === item.name);

        if (isMatch) {
          let proofImgUrl = ans?.proof_image_url;
          let proofDriveId = ans?.proof_image_drive_id;
          if (!proofImgUrl && Array.isArray(sub.proof_images)) {
            const matchedProof = sub.proof_images.find((p: any) => p.question_id === qKey);
            if (matchedProof) {
              proofImgUrl = matchedProof.url;
              proofDriveId = matchedProof.drive_id;
            }
          }

          history.push({
            id: `sub_${sub.id}_${qKey}`,
            sourceType: 'special_exam',
            examTitle: sub.exam_title || '스페셜 시험',
            recordedAt: sub.submitted_at,
            isCorrect: !!ans.is_correct,
            userAnswer: ans.user_answer || '(미입력)',
            correctAnswer: ans.correct_answer || item.answer || '-',
            spentSec: ans.time_spent_sec,
            proofImageUrl: proofImgUrl,
            proofDriveId: proofDriveId,
          });
        }
      });
    });

    // 최신 일시 기준 내림차순 정렬 (최근 정보부터 주루룩)
    history.sort((a, b) => {
      const timeA = new Date(a.recordedAt).getTime() || 0;
      const timeB = new Date(b.recordedAt).getTime() || 0;
      return timeB - timeA;
    });

    return history;
  };

  // 스페셜 테스트 모달 열기
  const handleOpenSpecialModal = () => {
    if (selectedItemIds.size === 0) {
      alert('스페셜 테스트에 포함할 문항을 1개 이상 선택해주세요.');
      return;
    }
    const studentName = selectedStudent?.name || '학생';
    setSpecialTestTitle(`[스페셜] ${studentName} 맞춤 복습 클리닉`);
    setSpecialDurationMin(Math.max(15, selectedItemIds.size * 3));
    setSpecialRequireProof(true);
    setAssignedStudentIds(new Set(selectedStudentId ? [selectedStudentId] : []));
    setIsSpecialModalOpen(true);
  };

  // 스페셜 테스트 생성 및 배정
  const handleCreateSpecialTest = async () => {
    if (!specialTestTitle.trim()) {
      return alert('시험지 제목을 입력해주세요.');
    }
    if (selectedItemIds.size === 0) {
      return alert('선택된 문항이 없습니다.');
    }
    if (assignedStudentIds.size === 0) {
      return alert('시험을 배정할 학생을 최소 1명 선택해주세요.');
    }

    const selectedQuestions = reviewItems.filter(i => selectedItemIds.has(i.id));

    setCreatingExam(true);
    try {
      const res = await fetch('/api/test2/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: specialTestTitle.trim(),
          grade: selectedStudent?.grade || '공통',
          duration_min: Number(specialDurationMin) || 30,
          is_special: true,
          require_proof_image: specialRequireProof,
          assigned_student_ids: Array.from(assignedStudentIds),
          questions: selectedQuestions.map((q, idx) => ({
            id: `q_${Date.now()}_${idx + 1}`,
            drive_id: q.fileId || q.id,
            name: q.name,
            image_url: q.problemUrl || '',
            answer: q.answer || '',
            raw_answer: q.raw_answer || '',
            solution_drive_id: q.solutionUrl || q.fileId || q.id,
            points: Math.round(100 / selectedQuestions.length),
            folder_name: q.folderName || '복습선별',
            question_number: idx + 1,
          })),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`🎉 '${specialTestTitle}' 스페셜 시험지가 성공적으로 생성 및 배정되었습니다!`);
        setIsSpecialModalOpen(false);
        setSelectedItemIds(new Set());
        setActiveTab('special_tests');
      } else {
        alert(`생성 실패: ${data.error || '오류가 발생했습니다.'}`);
      }
    } catch (e) {
      console.error('Failed to create special exam:', e);
      alert('시험지 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingExam(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 & 탭 네비게이션 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
              <BookOpen size={18} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight italic uppercase">
              EduOS Review Center
            </h1>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-10">
            Student Review Tracking & Special Clinic Test Management
          </p>
        </div>

        {/* 탭 전환 버튼 */}
        <div className="bg-slate-200/70 p-1 rounded-2xl flex gap-1 self-start md:self-auto border border-slate-300/40">
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'monitoring'
                ? 'bg-white text-indigo-600 shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users size={15} />
            학생별 복습 현황
          </button>
          <button
            onClick={() => setActiveTab('special_tests')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'special_tests'
                ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles size={15} className={activeTab === 'special_tests' ? 'fill-slate-950' : 'text-amber-500'} />
            스페셜 테스트 현황 & 인증샷
          </button>
        </div>
      </div>

      {/* 2. 탭 1: 학생별 복습 현황 모니터링 & 스페셜 테스트 제작 */}
      {activeTab === 'monitoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 좌측: 학생 목록 패널 (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[32px] p-5 shadow-xs space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="학생 이름 또는 학년 검색..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                />
              </div>

              {/* 학년 필터 */}
              <div className="flex flex-wrap gap-1">
                {gradeButtons.map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all border ${
                      selectedGrade === g
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* 학생 리스트 */}
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 size={32} className="animate-spin mb-2 text-indigo-500" />
                  <p className="text-xs font-bold">학생 목록을 불러오는 중...</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs font-bold">
                  검색된 학생이 없습니다.
                </div>
              ) : (
                filteredStudents.map(st => {
                  const isSelected = st.id === selectedStudentId;
                  return (
                    <div
                      key={st.id}
                      onClick={() => setSelectedStudentId(st.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-400 shadow-sm ring-2 ring-indigo-200'
                          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-800">{st.name}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            {st.grade}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">
                          {st.folderCount}개 폴더
                        </span>
                      </div>

                      {/* 통계 칩 */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px]">
                        <div className="bg-white/80 p-1.5 rounded-lg border border-slate-100 text-center">
                          <span className="text-slate-400 block font-medium">복습문항</span>
                          <strong className="text-indigo-600 font-black text-xs">{st.itemCount}개</strong>
                        </div>
                        <div className="bg-white/80 p-1.5 rounded-lg border border-slate-100 text-center">
                          <span className="text-slate-400 block font-medium">풀이시도</span>
                          <strong className="text-slate-700 font-black text-xs">{st.totalAttempts}회</strong>
                        </div>
                        <div className="bg-white/80 p-1.5 rounded-lg border border-slate-100 text-center">
                          <span className="text-slate-400 block font-medium">정답률</span>
                          <strong className={`font-black text-xs ${st.accuracyRate >= 70 ? 'text-emerald-600' : st.accuracyRate >= 40 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {st.totalAttempts > 0 ? `${st.accuracyRate}%` : '-'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 우측: 선택 학생의 복습 상세 & 문항 선별 패널 (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedStudent ? (
              <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-xs space-y-6">
                
                {/* 학생 상세 헤더 & 액션바 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                        {selectedStudent.name} <span className="text-indigo-600 text-lg font-bold">학생의 복습함</span>
                      </h2>
                      <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-black rounded-lg">
                        {selectedStudent.grade}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-bold mt-1">
                      총 {reviewFolders.length}개 폴더 • {reviewItems.length}개 복습 문항 • {selectedStudent.totalAttempts}회 시도
                    </p>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFilteredItems}
                      className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                    >
                      {filteredReviewItems.length > 0 && filteredReviewItems.every(i => selectedItemIds.has(i.id))
                        ? '필터 문항 해제'
                        : `필터 문항 선택 (${filteredReviewItems.length}개)`}
                    </button>
                    <button
                      type="button"
                      disabled={selectedItemIds.size === 0}
                      onClick={handleOpenSpecialModal}
                      className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles size={14} className="fill-slate-950" />
                      선택한 {selectedItemIds.size}문항으로 스페셜 테스트 만들기
                    </button>
                  </div>
                </div>

                {/* 복습 문항 목록 */}
                {detailLoading ? (
                  <div className="py-28 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 size={36} className="animate-spin text-indigo-500 mb-2" />
                    <p className="text-xs font-bold">학생 복습 데이터를 동기화하는 중...</p>
                  </div>
                ) : reviewItems.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 space-y-2">
                    <Folder size={40} className="mx-auto text-slate-300 opacity-60" />
                    <p className="text-sm font-black text-slate-600">아직 담아둔 복습 문제가 없습니다.</p>
                    <p className="text-xs text-slate-400">학생이 시험 후 오답노트나 라이브러리에서 복습 문제를 담으면 여기에 표시됩니다.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* 🔍 복습 문항 자유 검색 및 상태 필터링 바 */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                        {/* 자유 검색어 입력창 */}
                        <div className="relative flex-1">
                          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={itemSearchTerm}
                            onChange={e => setItemSearchTerm(e.target.value)}
                            placeholder="문항 제목, 폴더명, 정답, 번호 등 자유롭게 검색..."
                            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                          />
                          {itemSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setItemSearchTerm('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                              title="검색어 지우기"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* 폴더 선택 셀렉트 */}
                        {uniqueFolderNames.length > 0 && (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <Folder size={14} className="text-slate-400 ml-1" />
                            <select
                              value={selectedFolderFilter}
                              onChange={e => setSelectedFolderFilter(e.target.value)}
                              className="py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              <option value="전체">전체 폴더 ({uniqueFolderNames.length}개)</option>
                              {uniqueFolderNames.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 필터 초기화 버튼 */}
                        {(itemSearchTerm || itemFilterStatus !== 'ALL' || selectedFolderFilter !== '전체') && (
                          <button
                            type="button"
                            onClick={() => {
                              setItemSearchTerm('');
                              setItemFilterStatus('ALL');
                              setSelectedFolderFilter('전체');
                            }}
                            className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-500 rounded-xl text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <X size={12} /> 초기화
                          </button>
                        )}
                      </div>

                      {/* 빠른 상태 필터 칩 */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">
                          상태:
                        </span>
                        {[
                          { key: 'ALL', label: '전체 보기' },
                          { key: 'INCORRECT', label: '✕ 오답만', activeClass: 'bg-rose-500 text-white border-rose-500' },
                          { key: 'CORRECT', label: '✓ 정답만', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                          { key: 'ATTEMPTED', label: '풀이완료', activeClass: 'bg-indigo-600 text-white border-indigo-600' },
                          { key: 'UNATTEMPTED', label: '미풀이', activeClass: 'bg-slate-700 text-white border-slate-700' },
                        ].map(btn => {
                          const isActive = itemFilterStatus === btn.key;
                          return (
                            <button
                              key={btn.key}
                              type="button"
                              onClick={() => setItemFilterStatus(btn.key as any)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                isActive
                                  ? (btn.activeClass || 'bg-slate-900 text-white border-slate-900 shadow-xs')
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {btn.label}
                            </button>
                          );
                        })}

                        <span className="ml-auto text-[11px] font-bold text-slate-400">
                          표시 중: <strong className="text-indigo-600 font-black">{filteredReviewItems.length}</strong> / {reviewItems.length}문항
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                      <span>복습 문항 목록 ({filteredReviewItems.length}문항)</span>
                      <span className="text-indigo-600">{selectedItemIds.size}개 선택됨</span>
                    </div>

                    {filteredReviewItems.length === 0 ? (
                      <div className="py-20 text-center text-slate-400 space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        <Search size={32} className="mx-auto text-slate-300 opacity-60" />
                        <p className="text-xs font-black text-slate-600">조건에 일치하는 복습 문항이 없습니다.</p>
                        <p className="text-[11px] text-slate-400">검색어를 지우거나 필터 조건을 변경해보세요.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                        {filteredReviewItems.map(item => {
                          const isSelected = selectedItemIds.has(item.id);
                          const attemptCount = item.timeRecords?.length || (item.lastTestedAt ? 1 : 0);
                          const correctCount = (item.timeRecords || []).filter(r => r.isCorrect).length + (item.lastIsCorrect && (!item.timeRecords || item.timeRecords.length === 0) ? 1 : 0);
                          const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;

                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleItemSelection(item.id)}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-200 shadow-sm'
                                  : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-white'
                              }`}
                            >
                              <div className="space-y-2">
                                {/* 상단 체크박스 & 폴더명 */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {isSelected ? (
                                      <CheckSquare size={18} className="text-amber-600 shrink-0" />
                                    ) : (
                                      <Square size={18} className="text-slate-300 shrink-0" />
                                    )}
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded truncate max-w-[160px]">
                                      {item.folderName || '기본'}
                                    </span>
                                  </div>

                                  {item.lastTestedAt && (
                                    <span className="text-[10px] text-slate-400 font-bold">
                                      {item.lastIsCorrect ? (
                                        <span className="text-emerald-600 font-black">✓ 정답</span>
                                      ) : (
                                        <span className="text-rose-500 font-black">✕ 오답</span>
                                      )}
                                    </span>
                                  )}
                                </div>

                                {/* 문제 이름 */}
                                <h4 className="text-sm font-black text-slate-800 line-clamp-2 leading-snug">
                                  {item.name}
                                </h4>
                              </div>

                              {/* 하단 지표 및 상세보기 / 문제 미리보기 */}
                              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-xs gap-2">
                                <div className="flex items-center gap-2.5 text-[11px] text-slate-500 font-bold flex-wrap">
                                  <span>시도: <strong className="text-slate-800 font-black">{attemptCount}회</strong></span>
                                  <span>정답률: <strong className={`font-black ${accuracy >= 70 ? 'text-emerald-600' : 'text-slate-800'}`}>{attemptCount > 0 ? `${accuracy}%` : '-'}</strong></span>
                                  {item.bestSpentSec && (
                                    <span className="hidden sm:inline">최고: <strong className="text-indigo-600 font-black">{item.bestSpentSec}초</strong></span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* 📋 요구사항: 시도몇회 정답률 옆에 [상세보기] 메뉴 */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDetailModalItem(item);
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black text-[11px] transition-colors border border-indigo-200/70 shadow-xs"
                                    title="상세 풀이 이력 보기 (제출일시, 답안, 손글씨 인증샷)"
                                  >
                                    <History size={13} className="text-indigo-600" />
                                    <span>상세보기</span>
                                  </button>

                                  {item.problemUrl && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewProblemUrl(item.problemUrl!);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white transition-colors"
                                      title="문제 미리보기"
                                    >
                                      <Eye size={15} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[32px] p-24 text-center text-slate-400">
                <Users size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold text-sm">좌측 목록에서 학생을 선택해주세요.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 3. 탭 2: 스페셜 테스트 현황 & 풀이 인증샷 뷰어 */}
      {activeTab === 'special_tests' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black text-amber-600 uppercase tracking-widest">Special Test Status & Handwritten Proofs</div>
              <h2 className="text-xl md:text-2xl font-black text-slate-800 mt-1">
                스페셜 시험지 배정 현황 및 손글씨 풀이 인증샷
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                학생들이 카메라로 촬영해 구글 드라이브로 자동 업로드된 실제 손글씨 풀이를 원본 화질로 검토합니다.
              </p>
            </div>
            <button
              onClick={fetchSpecialExams}
              className="px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-xs font-black text-amber-800 hover:bg-amber-100 transition-all self-start md:self-auto shadow-xs"
            >
              새로고침
            </button>
          </div>

          {/* 🔍 스페셜 테스트 학년별 필터 & 자유 검색 필터링 바 */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-5 shadow-xs space-y-3.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* 자유 검색 입력창 */}
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={specialSearchTerm}
                  onChange={e => setSpecialSearchTerm(e.target.value)}
                  placeholder="시험지 제목, 학생 이름, 학년, 응시 상태(제출완료/미응시) 등 자유롭게 검색..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all placeholder:text-slate-400"
                />
                {specialSearchTerm && (
                  <button
                    onClick={() => setSpecialSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                    title="검색어 지우기"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 통계 카운터 및 초기화 버튼 */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
                  검색 결과: <strong className="text-amber-600 font-black">{filteredSpecialExams.length}</strong>개 시험지
                  <span className="text-slate-400 font-medium ml-1">({totalFilteredStudentsCount}명)</span>
                </span>
                {(specialSearchTerm || selectedSpecialGrade !== '전체') && (
                  <button
                    onClick={() => {
                      setSpecialSearchTerm('');
                      setSelectedSpecialGrade('전체');
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                  >
                    <X size={12} /> 필터 초기화
                  </button>
                )}
              </div>
            </div>

            {/* 학년별 필터 버튼 칩 */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                학년 선택:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {gradeButtons.map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedSpecialGrade(g)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all border ${
                      selectedSpecialGrade === g
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs scale-105'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300 hover:text-slate-800'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {specialExamsLoading ? (
            <div className="py-28 flex flex-col items-center justify-center text-slate-400">
              <Loader2 size={36} className="animate-spin text-amber-500 mb-2" />
              <p className="text-xs font-bold">스페셜 시험지 데이터를 불러오는 중...</p>
            </div>
          ) : specialExams.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-[40px] py-32 text-center text-slate-400 space-y-2">
              <Sparkles size={44} className="mx-auto text-amber-400 opacity-50" />
              <h3 className="text-lg font-black text-slate-700">생성된 스페셜 시험지가 없습니다</h3>
              <p className="text-xs text-slate-400">
                [학생별 복습 현황] 탭에서 학생의 복습 문항을 선별하여 스페셜 테스트를 생성해보세요!
              </p>
            </div>
          ) : filteredSpecialExams.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-[40px] py-28 text-center text-slate-400 space-y-3">
              <Search size={40} className="mx-auto text-slate-300" />
              <h3 className="text-base font-black text-slate-700">검색 조건과 일치하는 스페셜 시험지가 없습니다</h3>
              <p className="text-xs text-slate-400">
                검색어 &apos;{specialSearchTerm}&apos; 또는 학년 필터 &apos;{selectedSpecialGrade}&apos; 조건에 해당하는 항목이 없습니다.
              </p>
              <button
                onClick={() => {
                  setSpecialSearchTerm('');
                  setSelectedSpecialGrade('전체');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-xs"
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {filteredSpecialExams.map((exam: any) => {
                return (
                  <div
                    key={exam.id}
                    className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-xs space-y-5 hover:border-amber-300 transition-all"
                  >
                    {/* 시험지 상단 정보 */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-lg">
                            ⭐ 스페셜
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded">
                            {exam.grade}
                          </span>
                          {exam.require_proof_image && (
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-black text-[10px] rounded border border-rose-200 flex items-center gap-1">
                              <Camera size={11} /> 사진인증 필수
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-slate-800">{exam.title}</h3>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">
                          총 {exam.questions?.length || 0}문항 • 제한시간 {exam.duration_min}분 • 생성일: {new Date(exam.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-bold">제출 완료 현황</span>
                          <strong className="text-base font-black text-indigo-600">
                            {exam.submitted_count} / {exam.total_assigned}명 완료
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSpecialExam(exam.id, exam.title)}
                          disabled={deletingExamId === exam.id}
                          className="flex items-center gap-1.5 px-3 py-2 text-rose-500 hover:text-rose-700 bg-rose-50/80 hover:bg-rose-100 rounded-xl transition-all border border-rose-200/80 font-bold text-xs"
                          title="시험지 및 연동된 인증샷 영구 삭제"
                        >
                          {deletingExamId === exam.id ? (
                            <Loader2 size={14} className="animate-spin text-rose-500" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          <span>시험지 삭제</span>
                        </button>
                      </div>
                    </div>

                    {/* 배정된 학생 목록 테이블 */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] border-b border-slate-100">
                            <th className="py-3 px-4 rounded-l-xl">학생 이름</th>
                            <th className="py-3 px-4">학년</th>
                            <th className="py-3 px-4">응시 상태</th>
                            <th className="py-3 px-4">점수 / 정답수</th>
                            <th className="py-3 px-4">제출 일시</th>
                            <th className="py-3 px-4 text-right rounded-r-xl">풀이 인증샷</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          {(exam.assigned_students || []).map((ast: any) => {
                            const sub = ast.submission;
                            const hasProofs = sub?.proof_images && sub.proof_images.length > 0;

                            return (
                              <tr key={ast.student_id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                                  {ast.student_name}
                                </td>
                                <td className="py-3.5 px-4 text-slate-500">
                                  {ast.student_grade}
                                </td>
                                <td className="py-3.5 px-4">
                                  {ast.is_submitted ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-black text-[11px]">
                                      <CheckCircle2 size={12} /> 제출 완료
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold text-[11px]">
                                      <Clock size={12} /> 미응시 대기
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4">
                                  {ast.is_submitted ? (
                                    <span className="font-black text-indigo-600">
                                      {sub.score}점 <span className="text-slate-400 font-normal">({sub.correct_count}/{sub.total_questions})</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-slate-400">
                                  {ast.is_submitted ? new Date(sub.submitted_at).toLocaleString() : '-'}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  {hasProofs ? (
                                    <button
                                      type="button"
                                      onClick={() => setViewingProofData({
                                        studentName: ast.student_name,
                                        examTitle: exam.title,
                                        proofImages: sub.proof_images,
                                      })}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-xs transition-all"
                                    >
                                      <Camera size={13} />
                                      인증샷 확인 ({sub.proof_images.length}장)
                                    </button>
                                  ) : ast.is_submitted ? (
                                    <span className="text-slate-400 text-[11px]">인증샷 없음</span>
                                  ) : (
                                    <span className="text-slate-300 text-[11px]">응시 전</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. 스페셜 테스트 제작 모달 */}
      {isSpecialModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-amber-500 fill-amber-500" />
                <h3 className="text-xl font-black text-slate-800">스페셜 테스트 생성 및 배정</h3>
              </div>
              <button onClick={() => setIsSpecialModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              {/* 시험지 제목 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">시험지 제목</label>
                <input
                  type="text"
                  value={specialTestTitle}
                  onChange={e => setSpecialTestTitle(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none"
                  placeholder="시험지 제목을 입력하세요"
                />
              </div>

              {/* 제한시간 & 선별 문항 수 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">선별된 문항 수</label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-black">
                    총 {selectedItemIds.size}문항
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">제한시간 (분)</label>
                  <input
                    type="number"
                    value={specialDurationMin}
                    onChange={e => setSpecialDurationMin(Math.max(5, parseInt(e.target.value) || 0))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
              </div>

              {/* 풀이 인증샷 필수 여부 */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
                <label className="flex items-center gap-2 cursor-pointer font-black text-slate-800 text-xs">
                  <input
                    type="checkbox"
                    checked={specialRequireProof}
                    onChange={e => setSpecialRequireProof(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                  />
                  <span>📸 풀이과정 사진 인증샷 업로드 필수</span>
                </label>
                <p className="text-[10px] text-slate-500 pl-6 leading-snug">
                  학생이 문제를 풀고 손글씨 풀이 사진을 찍어 올려야만 제출할 수 있으며, 사진은 선생님의 구글 드라이브 학생 폴더에 자동 보관됩니다.
                </p>
              </div>

              {/* 배정 대상 학생 선택 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">배정 대상 학생 ({assignedStudentIds.size}명 선택)</label>
                </div>
                <div className="max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-2 gap-1.5">
                  {students.map(st => {
                    const isChecked = assignedStudentIds.has(st.id);
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-amber-100/60 border-amber-300 text-slate-900 font-black'
                            : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAssignedStudentIds(prev => {
                              const next = new Set(prev);
                              if (next.has(st.id)) next.delete(st.id);
                              else next.add(st.id);
                              return next;
                            });
                          }}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                        <span className="truncate">{st.name} <span className="text-[10px] text-slate-400 font-normal">({st.grade})</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsSpecialModalOpen(false)}
                className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all text-xs"
              >
                취소
              </button>
              <button
                type="button"
                disabled={creatingExam}
                onClick={handleCreateSpecialTest}
                className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl shadow-lg shadow-amber-500/20 transition-all text-xs flex items-center justify-center gap-1.5"
              >
                {creatingExam ? <Loader2 size={16} className="animate-spin" /> : '스페셜 테스트 생성 및 배정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 풀이과정 사진 인증샷 확대 갤러리 모달 */}
      {viewingProofData && (
        <div className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-5xl w-full max-h-[92vh] bg-slate-900 border border-white/10 rounded-[32px] p-6 flex flex-col items-center shadow-3xl">
            <div className="w-full flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div>
                <div className="flex items-center gap-2 text-white font-black text-base">
                  <Camera size={20} className="text-amber-400" />
                  <span>{viewingProofData.studentName} 학생의 풀이과정 인증샷</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{viewingProofData.examTitle} (총 {viewingProofData.proofImages.length}장)</p>
              </div>
              <button
                onClick={() => setViewingProofData(null)}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors font-black"
              >
                ✕
              </button>
            </div>

            {/* 인증샷 사진 목록 (그리드 / 스크롤) */}
            <div className="flex-1 w-full overflow-y-auto space-y-6 pr-2">
              {viewingProofData.proofImages.map((img, i) => (
                <div key={i} className="bg-black/50 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                    <span className="text-amber-300 font-black text-sm">
                      {img.question_number ? `${img.question_number}번 문항 풀이` : `인증샷 #${i + 1}`}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="truncate max-w-[200px] md:max-w-xs">{img.file_name || 'handwritten_proof.jpg'}</span>
                      {img.drive_id && (
                        <a
                          href={`https://drive.google.com/file/d/${img.drive_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 shrink-0 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10"
                          title="구글 드라이브에서 직접 열기"
                        >
                          <ExternalLink size={10} /> 드라이브 원본
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-center bg-black/70 rounded-xl p-2 min-h-[160px] items-center">
                    <img
                      src={
                        img.url
                          ? img.url.startsWith('data:')
                            ? img.url
                            : img.url.includes('raw=')
                            ? img.url
                            : `${img.url}&raw=true`
                          : `/api/drive/library/file?fileId=${img.drive_id}&type=image&raw=true`
                      }
                      alt="풀이 인증샷"
                      className="max-h-[65vh] object-contain rounded-lg shadow-2xl"
                      onError={(e) => {
                        if (img.drive_id && !e.currentTarget.src.includes(img.drive_id)) {
                          e.currentTarget.src = `/api/drive/library/file?fileId=${img.drive_id}&type=image&raw=true`;
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. 문제 원본 미리보기 모달 */}
      {previewProblemUrl && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full max-h-[85vh] bg-white rounded-3xl p-6 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="font-black text-slate-800 text-sm">문제 이미지 미리보기</span>
              <button onClick={() => setPreviewProblemUrl(null)} className="text-slate-400 hover:text-slate-600 font-black text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-2xl">
              <img src={previewProblemUrl} alt="문제 원본" className="max-h-[70vh] object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* 📋 7. 문항 풀이 이력 상세보기 모달 (최근 정보부터 역순 정렬, YYYY년 MM월 DD일 HH시 mm분 ss초) */}
      {detailModalItem && (() => {
        const historyList = getItemAttemptHistory(detailModalItem);
        const attemptCount = historyList.length;
        const correctCount = historyList.filter(h => h.isCorrect).length;
        const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;

        return (
          <div className="fixed inset-0 z-[115] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative max-w-2xl w-full max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
              {/* 모달 헤더 */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-white flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-indigo-700 bg-indigo-100/70 px-2.5 py-0.5 rounded-md">
                      {detailModalItem.folderName || '복습함'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      정답: <strong className="text-slate-800 font-black">{detailModalItem.answer || detailModalItem.raw_answer || '-'}</strong>
                    </span>
                    {selectedStudent && (
                      <span className="text-xs text-slate-400 font-bold">
                        • {selectedStudent.name} ({selectedStudent.grade})
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-black text-slate-800 leading-snug truncate">
                    {detailModalItem.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {detailModalItem.problemUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewProblemUrl(detailModalItem.problemUrl!)}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                      title="문제 이미지 미리보기"
                    >
                      <Eye size={13} className="text-indigo-600" /> 문제 보기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailModalItem(null)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-black transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 통계 요약 띠 */}
              <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
                <div className="flex items-center gap-4">
                  <span>총 제출: <strong className="text-slate-900 font-black">{attemptCount}회</strong></span>
                  <span>정답: <strong className="text-emerald-600 font-black">{correctCount}회</strong></span>
                  <span>정답률: <strong className={`font-black ${accuracy >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{attemptCount > 0 ? `${accuracy}%` : '-'}</strong></span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  * 최신 제출 순으로 정렬됨
                </div>
              </div>

              {/* 풀이 기록 리스트 (스크롤 영역) */}
              <div className="p-6 flex-1 overflow-y-auto space-y-3.5">
                {historyList.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-2">
                    <History size={36} className="mx-auto text-slate-300 opacity-60" />
                    <p className="text-sm font-black text-slate-600">제출된 풀이 기록이 없습니다.</p>
                    <p className="text-xs text-slate-400">학생이 이 문항을 푼 뒤 다시 확인해보세요.</p>
                  </div>
                ) : (
                  historyList.map((att, idx) => {
                    const attemptNumber = historyList.length - idx;
                    const isSpecial = att.sourceType === 'special_exam';

                    return (
                      <div
                        key={att.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          att.isCorrect
                            ? 'bg-emerald-50/40 border-emerald-200/80'
                            : 'bg-rose-50/40 border-rose-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-800 text-white">
                              #{attemptNumber}차 시도
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isSpecial
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            }`}>
                              {att.examTitle}
                            </span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500 text-white animate-pulse">
                                최근
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                              att.isCorrect
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                : 'bg-rose-100 text-rose-700 border border-rose-300'
                            }`}>
                              {att.isCorrect ? '✓ 정답' : '✕ 오답'}
                            </span>
                          </div>
                        </div>

                        {/* 제출 일시 표시 (사용자 요청: 몇년 몇월 몇시 몇분 몇초에 제출했다는 내용 수록) */}
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2.5">
                          <Calendar size={13} className="text-indigo-500 shrink-0" />
                          <span>제출일시:</span>
                          <span className="text-slate-800 font-black">
                            {formatFullDateTime(att.recordedAt)}
                          </span>
                        </div>

                        {/* 답안 & 소요시간 & 변화량 */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/60 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">학생 제출 답안</span>
                            <span className={`font-black ${att.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {att.userAnswer || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">소요 시간</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-slate-700">
                                {att.spentSec != null ? `${att.spentSec}초` : '-'}
                              </span>
                              {att.diffFromPrev != null && att.diffFromPrev < 0 && (
                                <span className="text-[10px] font-black text-emerald-600 flex items-center">
                                  ⚡ {Math.abs(att.diffFromPrev)}초 단축
                                </span>
                              )}
                              {att.diffFromPrev != null && att.diffFromPrev > 0 && (
                                <span className="text-[10px] font-bold text-slate-400">
                                  +{att.diffFromPrev}초
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <span className="text-[10px] text-slate-400 block font-medium">정답</span>
                            <span className="font-bold text-slate-600">
                              {att.correctAnswer || detailModalItem.answer || '-'}
                            </span>
                          </div>
                        </div>

                        {/* 손글씨 풀이 인증샷 첨부 확인 및 바로보기 버튼 */}
                        {(att.proofImageUrl || att.proofDriveId) && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                              <Camera size={14} className="text-amber-600" />
                              <span>손글씨 풀이 인증샷 첨부됨</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const targetUrl = att.proofImageUrl || (att.proofDriveId ? `/api/drive/library/file?fileId=${att.proofDriveId}&type=image&raw=true` : null);
                                if (targetUrl) setViewingDetailProofUrl(targetUrl);
                              }}
                              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                            >
                              <Eye size={12} /> 풀이 사진 보기
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* 모달 푸터 */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setDetailModalItem(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📸 8. 상세보기 모달 내 손글씨 풀이 인증샷 원본 확대 모달 */}
      {viewingDetailProofUrl && (
        <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 border border-white/10 rounded-3xl p-6 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-white">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-amber-400" />
                <span className="font-black text-sm">손글씨 풀이 인증샷 원본 확인</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingDetailProofUrl(null)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black/40 rounded-2xl min-h-[300px]">
              <img
                src={viewingDetailProofUrl}
                alt="손글씨 풀이 인증샷 원본"
                className="max-h-[75vh] object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
