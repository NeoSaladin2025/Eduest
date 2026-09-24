'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Calendar, 
  Users, 
  UserCheck, 
  UserX, 
  AlertTriangle, 
  Check, 
  Save, 
  Search, 
  Trash2, 
  Edit3, 
  FileText, 
  ChevronRight, 
  ChevronLeft, 
  Share2, 
  Copy,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { ClassItem, StudentAttendanceRecord, AttendanceStatus, StudentBasicInfo } from './types';

interface ClassDetailProps {
  classItem: ClassItem;
  allStudents: StudentBasicInfo[];
  onBack: () => void;
  onUpdateClass: (updated: ClassItem) => void;
  onDeleteClass: (classId: string) => void;
  onOpenAbsenteeReport: (date: string) => void;
  onEditClassInfo: (classItem: ClassItem) => void;
}

const ABSENT_REASONS = [
  '감기 / 몸살',
  '병원 진료',
  '가족 행사',
  '학교 시험 / 행사',
  '개인 사정',
  '무단 결석',
];

const ACTION_SUGGESTIONS = [
  '보충 수업 일정 배정',
  '온라인 강의 녹화본 전달',
  '학부모 유선 안내 완료',
  '다음 수업 전 개별 클리닉',
  '숙제 프린트 별도 발송',
];

const HW_STATUS_SUGGESTIONS = [
  '숙제 100% 완료 (우수)',
  '오답 정리 완료',
  '일부 미흡 (재제출 필요)',
  '숙제 미제출',
];

export default function ClassDetail({
  classItem,
  allStudents,
  onBack,
  onUpdateClass,
  onDeleteClass,
  onOpenAbsenteeReport,
  onEditClassInfo,
}: ClassDetailProps) {
  const [currentClass, setCurrentClass] = useState<ClassItem>(classItem);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync internal state when classItem prop changes
  useEffect(() => {
    setCurrentClass(classItem);
    if (!selectedStudentId && classItem.student_ids && classItem.student_ids.length > 0) {
      setSelectedStudentId(classItem.student_ids[0]);
    }
  }, [classItem]);

  // Ensure every student in student_ids has an attendance record initialized
  useEffect(() => {
    let changed = false;
    const nextAttendance = { ...(currentClass.students_attendance || {}) };

    currentClass.student_ids.forEach(sid => {
      if (!nextAttendance[sid]) {
        const studentInfo = allStudents.find(s => s.id === sid);
        nextAttendance[sid] = {
          student_id: sid,
          student_name: studentInfo?.name || '학생',
          student_grade: studentInfo?.grade || '',
          status: 'ATTEND',
          absent_reason: '',
          action_notes: '',
          previous_homework: '',
          today_homework: '',
          updated_at: new Date().toISOString(),
        };
        changed = true;
      }
    });

    if (changed) {
      const updated = { ...currentClass, students_attendance: nextAttendance };
      setCurrentClass(updated);
      onUpdateClass(updated);
    }
  }, [currentClass.student_ids, allStudents]);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  // Helper to commit changes
  const saveClassState = (updated: ClassItem, msg?: string) => {
    setCurrentClass(updated);
    onUpdateClass(updated);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2000);
    if (msg) showNotification(msg);
  };

  // Student list belonging to this class
  const classStudents = currentClass.student_ids.map(sid => {
    const info = allStudents.find(s => s.id === sid);
    const record = currentClass.students_attendance?.[sid];
    return {
      id: sid,
      name: record?.student_name || info?.name || '이름 미상',
      grade: record?.student_grade || info?.grade || '',
      status: record?.status || 'ATTEND',
      absent_reason: record?.absent_reason || '',
      action_notes: record?.action_notes || '',
      previous_homework: record?.previous_homework || '',
      today_homework: record?.today_homework || '',
    };
  });

  const filteredClassStudents = classStudents.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedStudent = classStudents.find(s => s.id === selectedStudentId) || classStudents[0];
  const selectedIndex = classStudents.findIndex(s => s.id === selectedStudentId);

  // Statistics
  const attendCount = classStudents.filter(s => s.status === 'ATTEND').length;
  const lateCount = classStudents.filter(s => s.status === 'LATE').length;
  const absentCount = classStudents.filter(s => s.status === 'ABSENT').length;

  // Handle changing attendance status
  const handleStatusChange = (status: AttendanceStatus) => {
    if (!selectedStudent) return;
    const nextAttendance = {
      ...(currentClass.students_attendance || {}),
      [selectedStudent.id]: {
        ...(currentClass.students_attendance?.[selectedStudent.id] || {
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_grade: selectedStudent.grade,
        }),
        status,
        updated_at: new Date().toISOString(),
      },
    };

    saveClassState({
      ...currentClass,
      students_attendance: nextAttendance,
      updated_at: new Date().toISOString(),
    });
  };

  // Handle text field updates
  const handleFieldChange = (
    field: 'absent_reason' | 'action_notes' | 'previous_homework' | 'today_homework',
    val: string
  ) => {
    if (!selectedStudent) return;
    const nextAttendance = {
      ...(currentClass.students_attendance || {}),
      [selectedStudent.id]: {
        ...(currentClass.students_attendance?.[selectedStudent.id] || {
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_grade: selectedStudent.grade,
          status: 'ATTEND',
        }),
        [field]: val,
        updated_at: new Date().toISOString(),
      },
    };

    saveClassState({
      ...currentClass,
      students_attendance: nextAttendance,
      updated_at: new Date().toISOString(),
    });
  };

  // Quick Action: Set all students to ATTEND
  const handleSetAllAttend = () => {
    const nextAttendance = { ...(currentClass.students_attendance || {}) };
    currentClass.student_ids.forEach(sid => {
      const existing = nextAttendance[sid] || {
        student_id: sid,
        student_name: allStudents.find(s => s.id === sid)?.name || '',
        student_grade: allStudents.find(s => s.id === sid)?.grade || '',
      };
      nextAttendance[sid] = {
        ...existing,
        status: 'ATTEND',
        updated_at: new Date().toISOString(),
      };
    });

    saveClassState(
      {
        ...currentClass,
        students_attendance: nextAttendance,
        updated_at: new Date().toISOString(),
      },
      '모든 학생이 출석 처리되었습니다!'
    );
  };

  // Quick Action: Apply today's homework to ALL students in this class
  const handleCopyTodayHwToAll = () => {
    if (!selectedStudent) return;
    const currentHw = currentClass.students_attendance?.[selectedStudent.id]?.today_homework || '';
    if (!currentHw.trim()) {
      alert('복사할 오늘 숙제 내용을 먼저 입력해주세요.');
      return;
    }

    if (!confirm(`현재 입력된 오늘 숙제를 이 수업의 모든 학생(${classStudents.length}명)에게 일괄 적용하시겠습니까?`)) {
      return;
    }

    const nextAttendance = { ...(currentClass.students_attendance || {}) };
    currentClass.student_ids.forEach(sid => {
      const existing = nextAttendance[sid] || {
        student_id: sid,
        student_name: allStudents.find(s => s.id === sid)?.name || '',
        student_grade: allStudents.find(s => s.id === sid)?.grade || '',
        status: 'ATTEND',
      };
      nextAttendance[sid] = {
        ...existing,
        today_homework: currentHw,
        updated_at: new Date().toISOString(),
      };
    });

    saveClassState(
      {
        ...currentClass,
        students_attendance: nextAttendance,
        updated_at: new Date().toISOString(),
      },
      '모든 학생에게 오늘 숙제가 일괄 적용되었습니다! 📢'
    );
  };

  // Navigate to previous/next student
  const goToPrevStudent = () => {
    if (selectedIndex > 0) {
      setSelectedStudentId(classStudents[selectedIndex - 1].id);
    }
  };

  const goToNextStudent = () => {
    if (selectedIndex < classStudents.length - 1) {
      setSelectedStudentId(classStudents[selectedIndex + 1].id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden animate-in fade-in duration-200">
      {/* 1. 상단 GNB / 수업 헤더 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            <ArrowLeft size={16} />
            달력으로 돌아가기
          </button>
          <div className="h-7 w-[1px] bg-slate-200 hidden sm:block"></div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                {currentClass.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <Clock size={12} /> {currentClass.time}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 flex items-center gap-1">
                <Calendar size={12} /> {currentClass.date}
              </span>
            </div>
            {/* 요약 뱃지 */}
            <div className="flex items-center gap-3 mt-1.5 text-xs font-bold">
              <span className="text-slate-500 flex items-center gap-1">
                <Users size={13} /> 총 {classStudents.length}명
              </span>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                🟢 출석 {attendCount}
              </span>
              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                🟡 지각 {lateCount}
              </span>
              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                🔴 결석 {absentCount}
              </span>
            </div>
          </div>
        </div>

        {/* 상단 우측 버튼들 */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 animate-pulse flex items-center gap-1.5">
              <Check size={14} /> {toastMessage}
            </span>
          )}

          <button
            onClick={() => onOpenAbsenteeReport(currentClass.date)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <UserX size={15} />
            결석생 보고
          </button>

          <button
            onClick={() => onEditClassInfo(currentClass)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            <Edit3 size={15} />
            수업 정보 수정
          </button>

          <button
            onClick={() => {
              if (confirm(`'${currentClass.name}' 수업을 정말 삭제하시겠습니까?`)) {
                onDeleteClass(currentClass.id);
              }
            }}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            title="수업 삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* 2. 본문 2컬럼 레이아웃: 왼쪽(학생 목록) + 오른쪽(상세 기록) */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* [왼쪽 컬럼] 학생들 리스트 */}
        <div className="w-80 md:w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          {/* 리스트 헤더 */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                <span className="text-sm font-black text-slate-800">학생 명단</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full">
                  {classStudents.length}
                </span>
              </div>
              <button
                onClick={handleSetAllAttend}
                className="text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-colors"
                title="모든 학생을 출석으로 일괄 변경합니다"
              >
                ✓ 전원 출석 처리
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="학생 검색..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 학생 아이템 리스트 */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
            {classStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                수업에 등록된 학생이 없습니다.
                <br />
                [수업 정보 수정]에서 학생을 추가해주세요.
              </div>
            ) : filteredClassStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                검색 결과가 없습니다.
              </div>
            ) : (
              filteredClassStudents.map(student => {
                const isSelected = student.id === selectedStudentId;
                return (
                  <div
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between mb-1 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {student.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {student.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {student.grade}
                          </span>
                        </div>
                        {/* 결석 사유 미리보기 */}
                        {student.status === 'ABSENT' && (
                          <p className={`text-[11px] truncate max-w-[140px] mt-0.5 ${
                            isSelected ? 'text-rose-200 font-medium' : 'text-rose-600 font-semibold'
                          }`}>
                            ⚠️ {student.absent_reason || '사유 미기입'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 상태 뱃지 */}
                    <div>
                      {student.status === 'ATTEND' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          출석
                        </span>
                      )}
                      {student.status === 'LATE' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          isSelected ? 'bg-amber-400 text-amber-950' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          지각
                        </span>
                      )}
                      {student.status === 'ABSENT' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          isSelected ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          결석
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* [오른쪽 컬럼] 선택된 학생 상세 기록 및 과제 일지 */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {selectedStudent ? (
            <>
              {/* 학생 상세 탑 바 */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-indigo-100">
                    {selectedStudent.name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-slate-900 tracking-tight">
                        {selectedStudent.name}
                      </h2>
                      <span className="px-2.5 py-0.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-md">
                        {selectedStudent.grade}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {currentClass.name} | 출석 및 과제 관리
                    </p>
                  </div>
                </div>

                {/* 이전/다음 학생 이동 컨트롤 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrevStudent}
                    disabled={selectedIndex <= 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-bold text-slate-700 transition-all"
                  >
                    <ChevronLeft size={16} />
                    이전 학생
                  </button>
                  <span className="text-xs font-bold text-slate-400 px-1">
                    {selectedIndex + 1} / {classStudents.length}
                  </span>
                  <button
                    onClick={goToNextStudent}
                    disabled={selectedIndex >= classStudents.length - 1}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-bold text-slate-700 transition-all"
                  >
                    다음 학생
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* 기록 폼 영역 */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                {/* 1. 출석 관련 체크 (출석 / 지각 / 결석) */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck size={16} className="text-indigo-600" />
                      출석 상태 체크
                    </label>
                    <span className="text-xs text-slate-400 font-medium">
                      클릭하여 즉시 변경
                    </span>
                  </div>

                  {/* 세그먼트 버튼 */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatusChange('ATTEND')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'ATTEND'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-emerald-50/50'
                      }`}
                    >
                      <UserCheck size={18} />
                      출석
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange('LATE')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'LATE'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-amber-50/50'
                      }`}
                    >
                      <AlertTriangle size={18} />
                      지각
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange('ABSENT')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'ABSENT'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50/50'
                      }`}
                    >
                      <UserX size={18} />
                      결석
                    </button>
                  </div>

                  {/* 결석 (또는 지각)의 경우: 사유와 처리내용 기입 */}
                  {selectedStudent.status === 'ABSENT' && (
                    <div className="pt-4 border-t border-rose-200/60 space-y-4 bg-rose-50/40 p-4 rounded-xl border">
                      <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                        <AlertTriangle size={14} className="text-rose-600" />
                        <span>결석생 관리: 결석 사유 및 조치/처리내용을 상세히 기록해주세요.</span>
                      </div>

                      {/* 사유 입력 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          📌 결석 사유
                        </label>
                        <input
                          type="text"
                          value={selectedStudent.absent_reason}
                          onChange={e => handleFieldChange('absent_reason', e.target.value)}
                          placeholder="예: 독감으로 인한 병결, 가족 행사 등"
                          className="w-full px-4 py-2.5 bg-white border border-rose-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400 mb-2"
                        />
                        {/* 빠른 사유 칩 */}
                        <div className="flex flex-wrap gap-1.5">
                          {ABSENT_REASONS.map(r => (
                            <button
                              type="button"
                              key={r}
                              onClick={() => handleFieldChange('absent_reason', r)}
                              className="px-2.5 py-1 text-xs bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-medium transition-all"
                            >
                              + {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 처리내용 입력 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          🛠️ 결석 처리 및 후속 조치 내용
                        </label>
                        <input
                          type="text"
                          value={selectedStudent.action_notes}
                          onChange={e => handleFieldChange('action_notes', e.target.value)}
                          placeholder="예: 다음 주 화요일 5시 보충 일정 잡음, 온라인 강의 링크 전송 완료"
                          className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 mb-2"
                        />
                        {/* 빠른 처리내용 칩 */}
                        <div className="flex flex-wrap gap-1.5">
                          {ACTION_SUGGESTIONS.map(act => (
                            <button
                              type="button"
                              key={act}
                              onClick={() => handleFieldChange('action_notes', act)}
                              className="px-2.5 py-1 text-xs bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-medium transition-all"
                            >
                              + {act}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 지각일 때 간편 메모 */}
                  {selectedStudent.status === 'LATE' && (
                    <div className="pt-3 border-t border-amber-200 space-y-2">
                      <label className="block text-xs font-bold text-amber-800">
                        ⏱️ 지각 사유 및 지각 시간
                      </label>
                      <input
                        type="text"
                        value={selectedStudent.absent_reason}
                        onChange={e => handleFieldChange('absent_reason', e.target.value)}
                        placeholder="예: 버스 지연으로 15분 늦음"
                        className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>

                {/* 2. 최근 숙제 내용 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={16} className="text-slate-500" />
                      최근 숙제 검사 및 내용
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {HW_STATUS_SUGGESTIONS.map(hw => (
                        <button
                          type="button"
                          key={hw}
                          onClick={() => {
                            const cur = selectedStudent.previous_homework ? `${selectedStudent.previous_homework} / ${hw}` : hw;
                            handleFieldChange('previous_homework', cur);
                          }}
                          className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-bold transition-all"
                        >
                          {hw}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={selectedStudent.previous_homework}
                    onChange={e => handleFieldChange('previous_homework', e.target.value)}
                    placeholder="이전 숙제 수행도, 오답 정리 상태, 학생 질의사항 등을 기록하세요."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* 3. 오늘 숙제 내용 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen size={16} className="text-indigo-600" />
                      오늘 숙제 내용
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyTodayHwToAll}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
                      title="이 학생의 오늘 숙제 내용을 반 전체 학생에게 복사합니다"
                    >
                      <Share2 size={13} />
                      이 수업 전체 학생에게 동일 적용
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={selectedStudent.today_homework}
                    onChange={e => handleFieldChange('today_homework', e.target.value)}
                    placeholder="오늘 부여한 숙제 범위, 교재 페이지, 제출 기한 등을 입력하세요."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Footer 저장 바 */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Check size={14} className="text-emerald-500" />
                  내용 변경 시 자동으로 저장 및 동기화됩니다.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    saveClassState(currentClass, '저장되었습니다!');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all"
                >
                  <Save size={15} />
                  저장하기
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <Users size={36} className="mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">선택된 학생이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">왼쪽 목록에서 학생을 클릭하여 상세 내용을 관리하세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
