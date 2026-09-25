'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles, 
  BookOpen, 
  Settings,
  CalendarDays,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowDownLeft
} from 'lucide-react';
import { 
  ClassItem, 
  AttendanceStatus, 
  HomeworkCheckStatus, 
  StudentBasicInfo, 
  SuggestionItem 
} from './types';
import SuggestionsManagerModal from './SuggestionsManagerModal';

interface ClassDetailProps {
  classItem: ClassItem;
  allClasses: ClassItem[];
  allStudents: StudentBasicInfo[];
  onBack: () => void;
  onUpdateClass: (updated: ClassItem) => void;
  onDeleteClass: (classId: string) => void;
  onEditClassInfo: (classItem: ClassItem) => void;
  reasons: SuggestionItem[];
  actions: SuggestionItem[];
  onUpdateReasons: (reasons: SuggestionItem[]) => void;
  onUpdateActions: (actions: SuggestionItem[]) => void;
}

export default function ClassDetail({
  classItem,
  allClasses,
  allStudents,
  onBack,
  onUpdateClass,
  onDeleteClass,
  onEditClassInfo,
  reasons,
  actions,
  onUpdateReasons,
  onUpdateActions,
}: ClassDetailProps) {
  const [currentClass, setCurrentClass] = useState<ClassItem>(classItem);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Suggestions Manager Modal state
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [suggestionsModalTab, setSuggestionsModalTab] = useState<'reason' | 'action'>('reason');

  // Sync internal state when classItem prop changes
  useEffect(() => {
    setCurrentClass(classItem);
    if (!selectedStudentId && classItem.student_ids && classItem.student_ids.length > 0) {
      setSelectedStudentId(classItem.student_ids[0]);
    }
  }, [classItem]);

  // Ensure every student in student_ids has an attendance record initialized (default: UNCHECKED)
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
          status: 'UNCHECKED', // 🌟 디폴트는 아무것도 선택되지 않음
          absent_reason: '',
          action_notes: '',
          previous_homework: '',
          previous_homework_due_date: '',
          homework_check: 'UNCHECKED', // 🌟 숙제 검사 디폴트도 아무것도 선택되지 않음
          today_homework: '',
          today_homework_due_date: '',
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
    if (msg) showNotification(msg);
  };

  // Auto-learning & frequency-based sorting for absent reasons
  const registerReasonUsage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const existingIndex = reasons.findIndex(
      r => r.text.trim().toLowerCase() === trimmed.toLowerCase()
    );

    let updatedList: SuggestionItem[];
    if (existingIndex >= 0) {
      updatedList = reasons.map((r, idx) =>
        idx === existingIndex ? { ...r, count: r.count + 1 } : r
      );
    } else {
      updatedList = [
        ...reasons,
        { id: crypto.randomUUID(), text: trimmed, count: 1 },
      ];
    }

    updatedList.sort((a, b) => b.count - a.count);
    onUpdateReasons(updatedList);
  };

  // Auto-learning & frequency-based sorting for actions
  const registerActionUsage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const existingIndex = actions.findIndex(
      a => a.text.trim().toLowerCase() === trimmed.toLowerCase()
    );

    let updatedList: SuggestionItem[];
    if (existingIndex >= 0) {
      updatedList = actions.map((a, idx) =>
        idx === existingIndex ? { ...a, count: a.count + 1 } : a
      );
    } else {
      updatedList = [
        ...actions,
        { id: crypto.randomUUID(), text: trimmed, count: 1 },
      ];
    }

    updatedList.sort((a, b) => b.count - a.count);
    onUpdateActions(updatedList);
  };

  // Student list belonging to this class
  const classStudents = currentClass.student_ids.map(sid => {
    const info = allStudents.find(s => s.id === sid);
    const record = currentClass.students_attendance?.[sid];
    return {
      id: sid,
      name: record?.student_name || info?.name || '이름 미상',
      grade: record?.student_grade || info?.grade || '',
      status: (record?.status || 'UNCHECKED') as AttendanceStatus,
      absent_reason: record?.absent_reason || '',
      action_notes: record?.action_notes || '',
      previous_homework: record?.previous_homework || '',
      previous_homework_due_date: record?.previous_homework_due_date || '',
      homework_check: (record?.homework_check || 'UNCHECKED') as HomeworkCheckStatus,
      today_homework: record?.today_homework || '',
      today_homework_due_date: record?.today_homework_due_date || '',
    };
  });

  const filteredClassStudents = classStudents.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedStudent = classStudents.find(s => s.id === selectedStudentId) || classStudents[0];
  const selectedIndex = classStudents.findIndex(s => s.id === selectedStudentId);

  // 🌟 이 학생의 이전 수업 과제 자동 탐색 (이전 날짜 수업의 today_homework)
  const detectedPreviousHomework = useMemo(() => {
    if (!selectedStudent) return null;
    const studentId = selectedStudent.id;
    const currentClassDate = currentClass.date;

    const previousClasses = (allClasses || [])
      .filter(c => c.date < currentClassDate && c.student_ids?.includes(studentId))
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const pc of previousClasses) {
      const rec = pc.students_attendance?.[studentId];
      if (rec?.today_homework && rec.today_homework.trim()) {
        return {
          content: rec.today_homework,
          dueDate: rec.today_homework_due_date || '',
          sourceDate: pc.date,
          sourceClassName: pc.name,
        };
      }
    }
    return null;
  }, [selectedStudentId, currentClass.date, allClasses]);

  // Statistics
  const attendCount = classStudents.filter(s => s.status === 'ATTEND').length;
  const lateCount = classStudents.filter(s => s.status === 'LATE').length;
  const absentCount = classStudents.filter(s => s.status === 'ABSENT').length;
  const uncheckedCount = classStudents.filter(s => !s.status || s.status === 'UNCHECKED').length;

  // 🌟 [2번 스샷 반영] 출석 상태 토글: 클릭 시 선택, 한번 더 클릭 시 취소(UNCHECKED)
  const handleToggleAttendance = (targetStatus: 'ATTEND' | 'LATE' | 'ABSENT') => {
    if (!selectedStudent) return;
    const currentStatus = selectedStudent.status;
    const nextStatus: AttendanceStatus = currentStatus === targetStatus ? 'UNCHECKED' : targetStatus;

    const nextAttendance = {
      ...(currentClass.students_attendance || {}),
      [selectedStudent.id]: {
        ...(currentClass.students_attendance?.[selectedStudent.id] || {
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_grade: selectedStudent.grade,
        }),
        status: nextStatus,
        updated_at: new Date().toISOString(),
      },
    };

    saveClassState({
      ...currentClass,
      students_attendance: nextAttendance,
      updated_at: new Date().toISOString(),
    });
  };

  // 🌟 [3번 스샷 반영] 숙제 검사 토글: 'DONE' (숙제 해옴) / 'NOT_DONE' (숙제 미이행) / 한번 더 클릭 시 취소
  const handleToggleHomeworkCheck = (targetCheck: 'DONE' | 'NOT_DONE') => {
    if (!selectedStudent) return;
    const currentCheck = selectedStudent.homework_check;
    const nextCheck: HomeworkCheckStatus = currentCheck === targetCheck ? 'UNCHECKED' : targetCheck;

    const nextAttendance = {
      ...(currentClass.students_attendance || {}),
      [selectedStudent.id]: {
        ...(currentClass.students_attendance?.[selectedStudent.id] || {
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_grade: selectedStudent.grade,
        }),
        homework_check: nextCheck,
        updated_at: new Date().toISOString(),
      },
    };

    saveClassState({
      ...currentClass,
      students_attendance: nextAttendance,
      updated_at: new Date().toISOString(),
    });
  };

  // Handle generic field change
  const handleFieldChange = (
    field: 'absent_reason' | 'action_notes' | 'previous_homework' | 'previous_homework_due_date' | 'today_homework' | 'today_homework_due_date',
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
          status: 'UNCHECKED',
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

  // 🌟 [3번 스샷 반영] 오늘 숙제 내용 및 기한일을 이 수업 전체 학생에게 일괄 적용
  const handleCopyTodayHwToAll = () => {
    if (!selectedStudent) return;
    const currentHw = currentClass.students_attendance?.[selectedStudent.id]?.today_homework || '';
    const currentDueDate = currentClass.students_attendance?.[selectedStudent.id]?.today_homework_due_date || '';

    if (!currentHw.trim() && !currentDueDate) {
      alert('복사할 오늘 숙제 내용 또는 제출 기한일을 먼저 입력해주세요.');
      return;
    }

    const dueDateNotice = currentDueDate ? ` (제출 기한: ${currentDueDate})` : ' (기한 미설정)';
    if (!confirm(`현재 입력된 오늘 숙제와 제출 기한${dueDateNotice}을 이 수업의 모든 학생(${classStudents.length}명)에게 일괄 적용하시겠습니까?`)) {
      return;
    }

    const nextAttendance = { ...(currentClass.students_attendance || {}) };
    currentClass.student_ids.forEach(sid => {
      const existing = nextAttendance[sid] || {
        student_id: sid,
        student_name: allStudents.find(s => s.id === sid)?.name || '',
        student_grade: allStudents.find(s => s.id === sid)?.grade || '',
        status: 'UNCHECKED',
      };
      nextAttendance[sid] = {
        ...existing,
        today_homework: currentHw,
        today_homework_due_date: currentDueDate,
        updated_at: new Date().toISOString(),
      };
    });

    saveClassState(
      {
        ...currentClass,
        students_attendance: nextAttendance,
        updated_at: new Date().toISOString(),
      },
      '모든 학생에게 오늘 숙제 및 기한일이 일괄 적용되었습니다! 📢'
    );
  };

  // 이전 수업 숙제를 현재 학생의 최근 숙제로 불러오기
  const applyDetectedPreviousHomework = () => {
    if (!detectedPreviousHomework || !selectedStudent) return;
    const nextAttendance = {
      ...(currentClass.students_attendance || {}),
      [selectedStudent.id]: {
        ...(currentClass.students_attendance?.[selectedStudent.id] || {
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_grade: selectedStudent.grade,
        }),
        previous_homework: detectedPreviousHomework.content,
        previous_homework_due_date: detectedPreviousHomework.dueDate,
        updated_at: new Date().toISOString(),
      },
    };

    saveClassState(
      {
        ...currentClass,
        students_attendance: nextAttendance,
        updated_at: new Date().toISOString(),
      },
      '이전 수업 과제 내용을 불러왔습니다!'
    );
  };

  // 🌟 [사용자 요청] 반 전체 학생의 이전 수업 과제 내용 일괄 불러오기
  const handleBatchLoadPreviousHomework = () => {
    const currentClassDate = currentClass.date;
    const currentClassName = currentClass.name;

    // 1. Find previous classes before today with same class name or overlapping students
    const previousClasses = (allClasses || [])
      .filter(
        c =>
          c.date < currentClassDate &&
          (c.name.trim() === currentClassName.trim() ||
            c.student_ids?.some(id => currentClass.student_ids.includes(id)))
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    if (previousClasses.length === 0) {
      alert('이전 일자에 등록된 수업이 없어 불러올 과제 내역이 없습니다.');
      return;
    }

    // 2. Find any general or default homework assigned in the latest previous class
    let fallbackHwContent = '';
    let fallbackHwDueDate = '';
    let sourceDate = '';

    for (const pc of previousClasses) {
      const records = Object.values(pc.students_attendance || {});
      const withHw = records.find(r => r.today_homework && r.today_homework.trim());
      if (withHw) {
        fallbackHwContent = withHw.today_homework!.trim();
        fallbackHwDueDate = withHw.today_homework_due_date || '';
        sourceDate = pc.date;
        break;
      }
    }

    if (!fallbackHwContent) {
      alert('이전 수업들에 등록된 과제 내용이 없습니다.');
      return;
    }

    const dueDateNotice = fallbackHwDueDate ? ` (제출 기한: ${fallbackHwDueDate})` : '';
    if (
      !confirm(
        `이전 수업(${sourceDate}) 과제:\n"${fallbackHwContent}"${dueDateNotice}\n\n이 과제 내용을 반 전체 학생(${classStudents.length}명)의 최근 숙제로 일괄 불러오시겠습니까?`
      )
    ) {
      return;
    }

    const nextAttendance = { ...(currentClass.students_attendance || {}) };
    let count = 0;

    currentClass.student_ids.forEach(sid => {
      let studentHw = fallbackHwContent;
      let studentDueDate = fallbackHwDueDate;

      for (const pc of previousClasses) {
        const r = pc.students_attendance?.[sid];
        if (r?.today_homework && r.today_homework.trim()) {
          studentHw = r.today_homework.trim();
          studentDueDate = r.today_homework_due_date || studentDueDate;
          break;
        }
      }

      const existing = nextAttendance[sid] || {
        student_id: sid,
        student_name: allStudents.find(s => s.id === sid)?.name || '',
        student_grade: allStudents.find(s => s.id === sid)?.grade || '',
        status: 'UNCHECKED',
      };

      nextAttendance[sid] = {
        ...existing,
        previous_homework: studentHw,
        previous_homework_due_date: studentDueDate,
        updated_at: new Date().toISOString(),
      };
      count++;
    });

    saveClassState(
      {
        ...currentClass,
        students_attendance: nextAttendance,
        updated_at: new Date().toISOString(),
      },
      `반 전체 학생(${count}명)의 이전 과제 내용을 성공적으로 일괄 불러왔습니다! 📥`
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
              {uncheckedCount > 0 && (
                <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  ⚪ 미체크 {uncheckedCount}
                </span>
              )}
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
            onClick={handleBatchLoadPreviousHomework}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black transition-all shadow-xs"
            title="이전 수업의 과제를 반 전체 학생에게 일괄 불러옵니다"
          >
            <ArrowDownLeft size={15} />
            과제내용 일괄 불러오기
          </button>

          <button
            onClick={() => onEditClassInfo(currentClass)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition-all shadow-xs"
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
        
        {/* 🌟 [1번 스샷 반영] [왼쪽 컬럼] 학생들 리스트 - 전용 눈에 띄는 스크롤바 장착 */}
        <div className="w-80 md:w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0 h-full">
          {/* 리스트 헤더 */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3 flex-shrink-0">
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

          {/* 🌟 학생 아이템 리스트 (전용 상시 표시 스크롤바) */}
          <div 
            className="flex-1 overflow-y-scroll p-2 pr-2.5 space-y-1"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#818cf8 #f1f5f9',
            }}
          >
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
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-100 hover:border-slate-200'
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
                          <p className={`text-[11px] truncate max-w-[130px] mt-0.5 ${
                            isSelected ? 'text-rose-200 font-medium' : 'text-rose-600 font-semibold'
                          }`}>
                            ⚠️ {student.absent_reason || '사유 미기입'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 출석 & 숙제 뱃지 */}
                    <div className="flex flex-col items-end gap-1">
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
                        {(!student.status || student.status === 'UNCHECKED') && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            미체크
                          </span>
                        )}
                      </div>

                      {/* 숙제 검사 뱃지 */}
                      {student.homework_check === 'DONE' && (
                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}>
                          ✓ 숙제 완료
                        </span>
                      )}
                      {student.homework_check === 'NOT_DONE' && (
                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                          isSelected ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-600 border border-rose-200'
                        }`}>
                          ✕ 숙제 미이행
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
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
          {selectedStudent ? (
            <>
              {/* 학생 상세 탑 바 */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between flex-shrink-0">
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
                
                {/* 🌟 [2번 스샷 반영] 1. 출석 관련 체크 (클릭 시 선택, 한번 더 클릭 시 취소, 디폴트: 미선택) */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck size={16} className="text-indigo-600" />
                      출석 상태 체크
                    </label>
                    <span className="text-xs text-slate-400 font-medium">
                      클릭하여 선택 / 재클릭 시 선택 취소 (기본값: 미선택)
                    </span>
                  </div>

                  {/* 세그먼트 토글 버튼 */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleAttendance('ATTEND')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'ATTEND'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-emerald-700'
                      }`}
                    >
                      <UserCheck size={18} />
                      출석
                      {selectedStudent.status === 'ATTEND' && <span className="text-xs bg-emerald-700/60 px-1.5 py-0.5 rounded">선택됨</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAttendance('LATE')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'LATE'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-amber-700'
                      }`}
                    >
                      <AlertTriangle size={18} />
                      지각
                      {selectedStudent.status === 'LATE' && <span className="text-xs bg-amber-600/60 px-1.5 py-0.5 rounded">선택됨</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAttendance('ABSENT')}
                      className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 border transition-all ${
                        selectedStudent.status === 'ABSENT'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-200 scale-[1.01]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-rose-700'
                      }`}
                    >
                      <UserX size={18} />
                      결석
                      {selectedStudent.status === 'ABSENT' && <span className="text-xs bg-rose-700/60 px-1.5 py-0.5 rounded">선택됨</span>}
                    </button>
                  </div>

                  {/* 결석의 경우: 사유와 처리내용 기입 */}
                  {selectedStudent.status === 'ABSENT' && (
                    <div className="pt-4 border-t border-rose-200/60 space-y-4 bg-rose-50/40 p-4 rounded-xl border">
                      <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                        <AlertTriangle size={14} className="text-rose-600" />
                        <span>결석생 관리: 새로운 사유 및 조치를 입력하면 자주 쓰는 목록에 자동 저장 및 정렬됩니다.</span>
                      </div>

                      {/* 사유 입력 & 자동 학습 리스트 */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700">
                            📌 결석 사유
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setSuggestionsModalTab('reason');
                              setIsSuggestionsModalOpen(true);
                            }}
                            className="text-[11px] text-rose-700 hover:text-rose-900 font-bold flex items-center gap-1 hover:underline"
                          >
                            <Settings size={12} />
                            사유 목록 관리/수정
                          </button>
                        </div>

                        <input
                          type="text"
                          value={selectedStudent.absent_reason}
                          onChange={e => handleFieldChange('absent_reason', e.target.value)}
                          onBlur={e => {
                            if (e.target.value.trim()) {
                              registerReasonUsage(e.target.value);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="결석 사유를 입력하세요 (입력 시 자동으로 자주 쓰는 목록에 저장됩니다)"
                          className="w-full px-4 py-2.5 bg-white border border-rose-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400 mb-2"
                        />

                        {/* 자주 사용된 순서대로 나열된 사유 칩 */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] font-bold text-rose-800 mr-1 flex items-center gap-0.5">
                            <Sparkles size={11} className="text-amber-500" /> 자주 쓰는 사유:
                          </span>
                          {reasons.slice(0, 10).map(r => (
                            <button
                              type="button"
                              key={r.id}
                              onClick={() => {
                                handleFieldChange('absent_reason', r.text);
                                registerReasonUsage(r.text);
                              }}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                                selectedStudent.absent_reason === r.text
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-white hover:bg-rose-100 text-rose-700 border border-rose-200'
                              }`}
                            >
                              <span>+ {r.text}</span>
                              <span className="text-[10px] opacity-70">({r.count})</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 후속 조치 내용 입력 & 자동 학습 리스트 */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700">
                            🛠️ 결석 처리 및 후속 조치 내용
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setSuggestionsModalTab('action');
                              setIsSuggestionsModalOpen(true);
                            }}
                            className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 hover:underline"
                          >
                            <Settings size={12} />
                            조치 목록 관리/수정
                          </button>
                        </div>

                        <input
                          type="text"
                          value={selectedStudent.action_notes}
                          onChange={e => handleFieldChange('action_notes', e.target.value)}
                          onBlur={e => {
                            if (e.target.value.trim()) {
                              registerActionUsage(e.target.value);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="처리 및 조치 내용을 입력하세요 (입력 시 자동으로 자주 쓰는 목록에 저장됩니다)"
                          className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 mb-2"
                        />

                        {/* 자주 사용된 순서대로 나열된 후속 조치 칩 */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] font-bold text-indigo-800 mr-1 flex items-center gap-0.5">
                            <Sparkles size={11} className="text-amber-500" /> 자주 쓰는 조치:
                          </span>
                          {actions.slice(0, 10).map(act => (
                            <button
                              type="button"
                              key={act.id}
                              onClick={() => {
                                handleFieldChange('action_notes', act.text);
                                registerActionUsage(act.text);
                              }}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                                selectedStudent.action_notes === act.text
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              <span>+ {act.text}</span>
                              <span className="text-[10px] opacity-70">({act.count})</span>
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

                {/* 🌟 [3번 스샷 반영] 2. 최근 숙제 검사 및 내용 (숙제 해옴 / 숙제 미이행 체크) */}
                <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={16} className="text-indigo-600" />
                        최근 숙제 검사 및 내용
                      </label>
                      {selectedStudent.previous_homework_due_date && (
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                          📅 제출 기한: {selectedStudent.previous_homework_due_date}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleBatchLoadPreviousHomework}
                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-black transition-all shadow-2xs"
                        title="이전 수업의 과제를 이 반 전체 학생에게 일괄 불러옵니다"
                      >
                        <ArrowDownLeft size={13} />
                        과제내용 일괄 불러오기
                      </button>
                    </div>

                    {/* 숙제 검사 토글 버튼: [ 숙제 해옴 ] / [ 숙제 미이행 ] */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 mr-1">검사 체크:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleHomeworkCheck('DONE')}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 border transition-all ${
                          selectedStudent.homework_check === 'DONE'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        숙제 해옴
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleHomeworkCheck('NOT_DONE')}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 border transition-all ${
                          selectedStudent.homework_check === 'NOT_DONE'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700'
                        }`}
                      >
                        <XCircle size={14} />
                        숙제 미이행
                      </button>
                    </div>
                  </div>

                  {/* 💡 이전 수업에서 자동으로 탐색된 숙제 안내 바 */}
                  {detectedPreviousHomework && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-indigo-900 font-medium">
                        <BookOpen size={15} className="text-indigo-600 flex-shrink-0" />
                        <span>
                          <strong className="font-bold text-indigo-950">이전 수업({detectedPreviousHomework.sourceDate}) 과제:</strong>{' '}
                          {detectedPreviousHomework.content}
                          {detectedPreviousHomework.dueDate && (
                            <span className="ml-1.5 text-indigo-700 font-bold">
                              (기한: {detectedPreviousHomework.dueDate})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={applyDetectedPreviousHomework}
                          className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-300 rounded-lg text-[11px] font-bold transition-all shadow-2xs"
                          title="이 학생 한 명에게만 과제 내용을 적용합니다"
                        >
                          이 학생만 불러오기
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchLoadPreviousHomework}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1"
                          title="반 전체 학생에게 이전 수업 과제를 일괄 적용합니다"
                        >
                          <ArrowDownLeft size={12} />
                          과제내용 일괄 불러오기
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={selectedStudent.previous_homework}
                    onChange={e => handleFieldChange('previous_homework', e.target.value)}
                    placeholder="해당 학생의 최근 숙제 내용 및 검사 메모를 확인하거나 기록하세요."
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* 🌟 [3번 스샷 반영] 3. 오늘 숙제 내용 (제출 기한일 설정 & 일괄 적용) */}
                <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen size={16} className="text-indigo-600" />
                      오늘 숙제 부여
                    </label>

                    {/* 제출 기한일 설정 (달력 선택) & 반 전체 일괄 적용 버튼 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs">
                        <CalendarDays size={14} className="text-indigo-600" />
                        <span className="text-[11px] font-bold text-slate-600">제출 기한일:</span>
                        <input
                          type="date"
                          value={selectedStudent.today_homework_due_date || ''}
                          onChange={e => handleFieldChange('today_homework_due_date', e.target.value)}
                          className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyTodayHwToAll}
                        className="flex items-center gap-1.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 rounded-xl shadow-sm transition-all"
                        title="이 학생의 오늘 숙제와 제출 기한을 반 전체 학생에게 일괄 적용합니다"
                      >
                        <Share2 size={13} />
                        반 전체 학생에게 일괄 적용
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={selectedStudent.today_homework}
                    onChange={e => handleFieldChange('today_homework', e.target.value)}
                    placeholder="오늘 부여할 숙제 범위, 교재 페이지, 안내 사항 등을 입력하세요."
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Footer 저장 바 */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs flex-shrink-0">
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

      {/* 사유 / 후속조치 항목 관리 모달 */}
      <SuggestionsManagerModal
        isOpen={isSuggestionsModalOpen}
        onClose={() => setIsSuggestionsModalOpen(false)}
        initialTab={suggestionsModalTab}
        reasons={reasons}
        actions={actions}
        onSaveReasons={onUpdateReasons}
        onSaveActions={onUpdateActions}
      />
    </div>
  );
}
