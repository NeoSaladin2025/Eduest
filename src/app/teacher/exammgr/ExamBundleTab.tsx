'use client';

import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Edit2, 
  Users, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Loader2, 
  Search, 
  FileCheck, 
  AlertCircle 
} from 'lucide-react';
import { ExamPaper } from '@/app/api/test2/exam/route';
import { ExamBundle, ExamBundleItem } from '@/app/api/test2/bundle/route';

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface ExamBundleTabProps {
  exams: ExamPaper[];
  students: Student[];
}

export default function ExamBundleTab({ exams, students }: ExamBundleTabProps) {
  const [bundles, setBundles] = useState<ExamBundle[]>([]);
  const [loading, setLoading] = useState(true);

  // 묶음 생성/수정 모달
  const [showModal, setShowModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState<ExamBundle | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalGrade, setModalGrade] = useState('고1');
  const [modalDescription, setModalDescription] = useState('');
  const [modalItems, setModalItems] = useState<{ exam_id: string; exam_title: string }[]>([]);
  const [modalAssignedStudentIds, setModalAssignedStudentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 배정 전용 빠른 모달
  const [assignModalBundle, setAssignModalBundle] = useState<ExamBundle | null>(null);
  const [quickAssignedIds, setQuickAssignedIds] = useState<string[]>([]);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignStudentSearch, setAssignStudentSearch] = useState('');
  const [assignGradeFilter, setAssignGradeFilter] = useState('ALL');

  // 시험지 선택 검색어
  const [examSearch, setExamSearch] = useState('');

  // 묶음 목록 로드
  const fetchBundles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/test2/bundle');
      const data = await res.json();
      if (data.success) {
        setBundles(data.bundles || []);
      }
    } catch (e) {
      console.error('Failed to load bundles:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBundles();
  }, []);

  // 모달 열기 (신규 생성)
  const handleOpenCreateModal = () => {
    setEditingBundle(null);
    setModalTitle('');
    setModalGrade('고1');
    setModalDescription('');
    setModalItems([]);
    setModalAssignedStudentIds([]);
    setShowModal(true);
  };

  // 모달 열기 (기존 수정)
  const handleOpenEditModal = (bundle: ExamBundle) => {
    setEditingBundle(bundle);
    setModalTitle(bundle.title);
    setModalGrade(bundle.grade);
    setModalDescription(bundle.description || '');
    setModalItems(bundle.items.map(it => ({ exam_id: it.exam_id, exam_title: it.exam_title })));
    setModalAssignedStudentIds(bundle.assigned_student_ids || []);
    setShowModal(true);
  };

  // 묶음 항목 추가
  const handleAddExamToBundle = (exam: ExamPaper) => {
    if (modalItems.some(item => item.exam_id === exam.id)) {
      alert('이미 묶음에 추가된 시험지입니다.');
      return;
    }
    setModalItems(prev => [...prev, { exam_id: exam.id, exam_title: exam.title }]);
  };

  // 묶음 항목 제거
  const handleRemoveExamFromBundle = (examId: string) => {
    setModalItems(prev => prev.filter(item => item.exam_id !== examId));
  };

  // 묶음 순서 위로 이동
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setModalItems(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  // 묶음 순서 아래로 이동
  const handleMoveDown = (index: number) => {
    if (index === modalItems.length - 1) return;
    setModalItems(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  // 묶음 저장
  const handleSaveBundle = async () => {
    if (!modalTitle.trim()) {
      alert('묶음 제목을 입력해주세요.');
      return;
    }
    if (modalItems.length === 0) {
      alert('최소 1개 이상의 시험지를 묶음에 추가해주세요.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/test2/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingBundle?.id,
          title: modalTitle,
          grade: modalGrade,
          description: modalDescription,
          items: modalItems,
          assigned_student_ids: modalAssignedStudentIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(editingBundle ? '묶음이 성공적으로 수정되었습니다.' : '새로운 시험지 묶음이 생성되었습니다!');
        setShowModal(false);
        fetchBundles();
      } else {
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to save bundle:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 묶음 삭제
  const handleDeleteBundle = async (bundleId: string, bundleTitle: string) => {
    if (!confirm(`'${bundleTitle}' 묶음을 정말 삭제하시겠습니까? (포함된 개별 시험지는 삭제되지 않습니다)`)) {
      return;
    }

    try {
      const res = await fetch(`/api/test2/bundle?bundleId=${bundleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('묶음이 삭제되었습니다.');
        fetchBundles();
      } else {
        alert(data.error || '삭제 실패');
      }
    } catch (e) {
      console.error('Failed to delete bundle:', e);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 학생 빠른 배정 저장
  const handleSaveQuickAssign = async () => {
    if (!assignModalBundle) return;
    try {
      setIsSavingAssign(true);
      const res = await fetch('/api/test2/bundle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: assignModalBundle.id,
          studentIds: quickAssignedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('학생 배정이 업데이트되었습니다.');
        setAssignModalBundle(null);
        fetchBundles();
      } else {
        alert(data.error || '배정 실패');
      }
    } catch (e) {
      console.error('Failed to update assign:', e);
      alert('배정 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsSavingAssign(false);
    }
  };

  // 필터링된 시험지
  const filteredExams = exams.filter(e => 
    e.title.toLowerCase().includes(examSearch.toLowerCase()) || 
    e.grade.toLowerCase().includes(examSearch.toLowerCase())
  );

  // 배정 모달 학생 목록 필터링
  const filteredAssignStudents = students.filter(s => {
    const matchGrade = assignGradeFilter === 'ALL' || s.grade === assignGradeFilter;
    const matchSearch = s.name.toLowerCase().includes(assignStudentSearch.toLowerCase());
    return matchGrade && matchSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* 상단 액션 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="text-violet-600" size={24} />
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              시험지 묶음 카트리지 관리
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            제작된 시험지들을 1회, 2회, 3회 순서대로 묶어 하나의 카트리지로 학생에게 배정하고 진도를 관리합니다.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs transition-all shadow-md shadow-violet-200 shrink-0"
        >
          <Plus size={16} strokeWidth={3} />
          <span>새 시험지 묶음 만들기</span>
        </button>
      </div>

      {/* 묶음 카드 목록 */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="animate-spin text-violet-600" size={36} />
          <p className="text-xs font-bold text-slate-400">시험지 묶음 목록을 불러오는 중...</p>
        </div>
      ) : bundles.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto">
            <Layers size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-700">생성된 시험지 묶음이 없습니다</h3>
            <p className="text-xs text-slate-400">
              상단의 [+ 새 시험지 묶음 만들기]를 눌러 여러 시험지를 1회, 2회 순서대로 묶어보세요!
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bundles.map(bundle => (
            <div
              key={bundle.id}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-black rounded-full flex items-center gap-1.5">
                    <Layers size={13} />
                    {bundle.grade}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    총 {bundle.items.length}회차 구성
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-tight">
                    {bundle.title}
                  </h3>
                  {bundle.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {bundle.description}
                    </p>
                  )}
                </div>

                {/* 묶음 내 시험지 회차 순서 미리보기 */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    회차별 시험지 순서
                  </span>
                  {bundle.items.map((it, idx) => (
                    <div
                      key={it.exam_id}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white border border-slate-100"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded bg-violet-100 text-violet-700 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}회
                        </span>
                        <span className="font-bold text-slate-700 truncate">{it.exam_title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium ml-2">
                        {it.question_count ? `${it.question_count}문항` : ''}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 배정된 학생 정보 */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 font-medium">배정된 학생</span>
                  <span className="font-black text-violet-700">
                    {bundle.assigned_student_ids?.length || 0}명
                  </span>
                </div>
              </div>

              {/* 하단 액션 버튼 */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setAssignModalBundle(bundle);
                    setQuickAssignedIds(bundle.assigned_student_ids || []);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-black text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Users size={14} />
                  <span>배정 관리</span>
                </button>
                <button
                  onClick={() => handleOpenEditModal(bundle)}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                  title="묶음 수정"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => handleDeleteBundle(bundle.id, bundle.title)}
                  className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                  title="묶음 삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. 새 시험지 묶음 생성 & 수정 모달
      ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* 모달 헤더 */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
                  <Layers size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {editingBundle ? '시험지 묶음 카트리지 수정' : '새 시험지 묶음 만들기'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    여러 시험지를 묶어 회차 순서를 정하고 학생들에게 한 번에 배정합니다.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-black text-slate-600">묶음 제목</label>
                  <input
                    type="text"
                    value={modalTitle}
                    onChange={e => setModalTitle(e.target.value)}
                    placeholder="예: 고1 공수2 중간대비 파이널 카트리지"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-violet-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-600">대상 학년</label>
                  <select
                    value={modalGrade}
                    onChange={e => setModalGrade(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-violet-600"
                  >
                    {['중1', '중2', '중3', '고1', '고2', '고3', '공통'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-600">간단 설명 (선택)</label>
                <input
                  type="text"
                  value={modalDescription}
                  onChange={e => setModalDescription(e.target.value)}
                  placeholder="예: 1회~3회 모의고사 묶음 세트"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:border-violet-600"
                />
              </div>

              {/* 시험지 선택 & 회차 순서 지정 2단 레이아웃 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* 좌측: 등록 가능한 시험지 목록 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700">1. 등록할 시험지 선택</span>
                    <span className="text-[11px] text-slate-400">클릭하여 우측 묶음에 추가</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="text"
                      value={examSearch}
                      onChange={e => setExamSearch(e.target.value)}
                      placeholder="시험지 검색..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white"
                    />
                  </div>
                  <div className="h-64 overflow-y-auto border border-slate-200 rounded-2xl p-2 space-y-1.5 bg-slate-50/50">
                    {filteredExams.map(exam => {
                      const isAdded = modalItems.some(it => it.exam_id === exam.id);
                      return (
                        <div
                          key={exam.id}
                          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                            isAdded
                              ? 'bg-violet-50 border-violet-200 opacity-60'
                              : 'bg-white border-slate-100 hover:border-violet-300'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold mr-1.5">
                              {exam.grade}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {exam.title}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {exam.questions.length}문항 • {exam.duration_min}분
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddExamToBundle(exam)}
                            disabled={isAdded}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 transition-colors ${
                              isAdded
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-violet-600 hover:bg-violet-700 text-white'
                            }`}
                          >
                            {isAdded ? '추가됨' : '+ 추가'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 우측: 묶음에 포함된 시험지 회차 순서 지정 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-violet-700">2. 묶음 내 회차 순서 (카트리지)</span>
                    <span className="text-[11px] font-bold text-slate-500">총 {modalItems.length}회차</span>
                  </div>
                  <div className="h-72 overflow-y-auto border-2 border-dashed border-violet-200 rounded-2xl p-2 space-y-2 bg-violet-50/30">
                    {modalItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                        <Layers size={28} className="text-violet-300 mb-2" />
                        <p className="text-xs font-bold">왼쪽에서 시험지를 골라 추가해주세요</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">추가된 순서대로 1회, 2회...로 묶입니다</p>
                      </div>
                    ) : (
                      modalItems.map((item, idx) => (
                        <div
                          key={item.exam_id}
                          className="bg-white p-3 rounded-xl border border-violet-100 shadow-xs flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-7 h-7 rounded-lg bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                              {idx + 1}회
                            </span>
                            <span className="text-xs font-black text-slate-800 truncate">
                              {item.exam_title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(idx)}
                              disabled={idx === 0}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600"
                              title="위로 이동"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(idx)}
                              disabled={idx === modalItems.length - 1}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600"
                              title="아래로 이동"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveExamFromBundle(item.exam_id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                              title="제외"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveBundle}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs transition-all shadow-md shadow-violet-200 flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>{editingBundle ? '수정 완료' : '묶음 생성하기'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. 학생 빠른 배정 모달
      ───────────────────────────────────────────────────────────── */}
      {assignModalBundle && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  [{assignModalBundle.title}] 학생 배정
                </h3>
                <p className="text-xs text-slate-400">
                  이 묶음을 응시할 학생들을 선택하세요 (현재 {quickAssignedIds.length}명 선택됨).
                </p>
              </div>
              <button
                onClick={() => setAssignModalBundle(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 필터 및 검색 */}
            <div className="p-6 pb-2 space-y-3">
              <div className="flex items-center gap-2">
                <select
                  value={assignGradeFilter}
                  onChange={e => setAssignGradeFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
                >
                  {['ALL', '중1', '중2', '중3', '고1', '고2', '고3'].map(g => (
                    <option key={g} value={g}>{g === 'ALL' ? '전체 학년' : g}</option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={assignStudentSearch}
                    onChange={e => setAssignStudentSearch(e.target.value)}
                    placeholder="학생 이름 검색..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = filteredAssignStudents.map(s => s.id);
                    setQuickAssignedIds(prev => Array.from(new Set([...prev, ...allIds])));
                  }}
                  className="text-violet-600 font-bold hover:underline"
                >
                  현재 목록 전체 선택
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAssignedIds([])}
                  className="text-slate-400 font-medium hover:text-slate-600"
                >
                  전체 선택 해제
                </button>
              </div>
            </div>

            {/* 학생 체크 리스트 */}
            <div className="p-6 pt-2 overflow-y-auto flex-1 space-y-1.5">
              {filteredAssignStudents.map(student => {
                const isSelected = quickAssignedIds.includes(student.id);
                return (
                  <label
                    key={student.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-violet-50 border-violet-300'
                        : 'bg-white border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setQuickAssignedIds(prev =>
                            isSelected ? prev.filter(id => id !== student.id) : [...prev, student.id]
                          );
                        }}
                        className="rounded text-violet-600 focus:ring-violet-500 w-4 h-4"
                      />
                      <span className="text-sm font-bold text-slate-800">{student.name}</span>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                      {student.grade}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* 푸터 */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setAssignModalBundle(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveQuickAssign}
                disabled={isSavingAssign}
                className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs transition-all shadow-md shadow-violet-200 flex items-center gap-2"
              >
                {isSavingAssign ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>배정 저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
