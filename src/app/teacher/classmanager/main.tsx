'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Copy, 
  ClipboardPaste, 
  UserX, 
  Clock, 
  Users, 
  Sparkles, 
  Check, 
  Trash2, 
  AlertCircle,
  RefreshCw,
  Search,
  BookOpen
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { ClassItem, StudentBasicInfo } from './types';
import ClassModal from './ClassModal';
import ClassDetail from './ClassDetail';
import AbsenteeModal from './AbsenteeModal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const LOCAL_STORAGE_KEY = 'eduest_classes_v1';
const CLIPBOARD_STORAGE_KEY = 'eduest_class_clipboard_v1';

export default function ClassManagerMain() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [allStudents, setAllStudents] = useState<StudentBasicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Navigation View: 'CALENDAR' | 'DETAIL'
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [isAbsenteeModalOpen, setIsAbsenteeModalOpen] = useState(false);
  const [absenteeReportDate, setAbsenteeReportDate] = useState<string>(selectedDate);

  // Clipboard buffer
  const [clipboardClasses, setClipboardClasses] = useState<ClassItem[]>([]);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'warn' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 1. Fetch Students
  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, grade')
        .order('name');
      if (data && !error) {
        setAllStudents(data);
      }
    } catch (e) {
      console.error('Failed to load students:', e);
    }
  };

  // 2. Fetch Classes from Cloud & LocalStorage
  const fetchClasses = async () => {
    try {
      setLoading(true);
      // First read local cache for 0ms render
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        try {
          setClasses(JSON.parse(local));
        } catch (_) {}
      }

      // Read clipboard cache
      const clip = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      if (clip) {
        try {
          setClipboardClasses(JSON.parse(clip));
        } catch (_) {}
      }

      // Fetch from API
      const res = await fetch('/api/classes');
      const data = await res.json();
      if (data.classes && Array.isArray(data.classes)) {
        setClasses(data.classes);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.classes));
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  // Save classes to cloud & localStorage
  const saveClassesToCloud = async (newClasses: ClassItem[]) => {
    setClasses(newClasses);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newClasses));
    try {
      setSaving(true);
      await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: newClasses }),
      });
    } catch (err) {
      console.error('Failed to save classes to cloud:', err);
    } finally {
      setSaving(false);
    }
  };

  // 3. Add or Update Class
  const handleSaveClassModal = (data: {
    id?: string;
    date: string;
    name: string;
    time: string;
    student_ids: string[];
  }) => {
    if (data.id) {
      // Edit
      const updated = classes.map(c => {
        if (c.id === data.id) {
          // Keep existing attendance records for students still in the class
          const updatedAttendance = { ...(c.students_attendance || {}) };
          data.student_ids.forEach(sid => {
            if (!updatedAttendance[sid]) {
              const studentInfo = allStudents.find(s => s.id === sid);
              updatedAttendance[sid] = {
                student_id: sid,
                student_name: studentInfo?.name || '',
                student_grade: studentInfo?.grade || '',
                status: 'ATTEND',
              };
            }
          });

          return {
            ...c,
            name: data.name,
            time: data.time,
            student_ids: data.student_ids,
            students_attendance: updatedAttendance,
            updated_at: new Date().toISOString(),
          };
        }
        return c;
      });
      saveClassesToCloud(updated);
      showToast(`'${data.name}' 수업이 수정되었습니다.`, 'success');
    } else {
      // Create new
      const initialAttendance: Record<string, any> = {};
      data.student_ids.forEach(sid => {
        const studentInfo = allStudents.find(s => s.id === sid);
        initialAttendance[sid] = {
          student_id: sid,
          student_name: studentInfo?.name || '',
          student_grade: studentInfo?.grade || '',
          status: 'ATTEND',
        };
      });

      const newClass: ClassItem = {
        id: crypto.randomUUID(),
        date: data.date,
        name: data.name,
        time: data.time,
        student_ids: data.student_ids,
        students_attendance: initialAttendance,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updated = [...classes, newClass];
      saveClassesToCloud(updated);
      showToast(`'${data.name}' 수업이 등록되었습니다.`, 'success');
    }
  };

  // Delete Class
  const handleDeleteClass = (classId: string) => {
    const updated = classes.filter(c => c.id !== classId);
    saveClassesToCloud(updated);
    if (activeClassId === classId) {
      setActiveClassId(null);
    }
    showToast('수업이 삭제되었습니다.', 'info');
  };

  // Update Single Class
  const handleUpdateClass = (updatedClass: ClassItem) => {
    const next = classes.map(c => (c.id === updatedClass.id ? updatedClass : c));
    saveClassesToCloud(next);
  };

  // 4. Copy and Paste Functionality
  const handleCopyDateClasses = useCallback((targetDate: string) => {
    const targetClasses = classes.filter(c => c.date === targetDate);
    if (targetClasses.length === 0) {
      showToast(`선택한 날짜(${targetDate})에 복사할 수업이 없습니다.`, 'warn');
      return;
    }

    setClipboardClasses(targetClasses);
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(targetClasses));
    showToast(
      `📋 [${targetDate}]의 수업 ${targetClasses.length}개가 복사되었습니다! 붙여넣을 날짜를 클릭하고 Ctrl+V를 누르세요.`,
      'success'
    );
  }, [classes]);

  const handlePasteClassesToDate = useCallback((targetDate: string) => {
    if (!clipboardClasses || clipboardClasses.length === 0) {
      showToast('복사된 수업이 없습니다. 먼저 복사할 날짜를 선택하고 Ctrl+C를 누르세요.', 'warn');
      return;
    }

    // Clone the classes for the target date
    const newItems: ClassItem[] = clipboardClasses.map(c => {
      // Create fresh attendance records
      const freshAttendance: Record<string, any> = {};
      (c.student_ids || []).forEach(sid => {
        const studentInfo = allStudents.find(s => s.id === sid);
        const existingRecord = c.students_attendance?.[sid];
        freshAttendance[sid] = {
          student_id: sid,
          student_name: existingRecord?.student_name || studentInfo?.name || '',
          student_grade: existingRecord?.student_grade || studentInfo?.grade || '',
          status: 'ATTEND', // default to ATTEND
          absent_reason: '',
          action_notes: '',
          previous_homework: existingRecord?.today_homework || existingRecord?.previous_homework || '', // Today's HW can become next class's previous HW!
          today_homework: '',
          updated_at: new Date().toISOString(),
        };
      });

      return {
        id: crypto.randomUUID(),
        date: targetDate,
        name: c.name,
        time: c.time,
        student_ids: [...c.student_ids],
        students_attendance: freshAttendance,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const updated = [...classes, ...newItems];
    saveClassesToCloud(updated);
    showToast(`✅ [${targetDate}]에 수업 ${newItems.length}개가 성공적으로 복사 및 등록되었습니다!`, 'success');
  }, [clipboardClasses, classes, allStudents]);

  // Global Keyboard listener for Ctrl+C and Ctrl+V
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not hijack if user is typing in an input, textarea or modal
      const activeElem = document.activeElement;
      const isInput =
        activeElem?.tagName === 'INPUT' ||
        activeElem?.tagName === 'TEXTAREA' ||
        (activeElem as HTMLElement)?.isContentEditable;

      if (isInput) return;
      if (isClassModalOpen || isAbsenteeModalOpen || activeClassId) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyDateClasses(selectedDate);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteClassesToDate(selectedDate);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedDate,
    handleCopyDateClasses,
    handlePasteClassesToDate,
    isClassModalOpen,
    isAbsenteeModalOpen,
    activeClassId,
  ]);

  // Calendar Date Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days: {
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSunday: boolean;
      isSaturday: boolean;
    }[] = [];

    // Prev month overflow days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const pYear = month === 0 ? year - 1 : year;
      const pMonth = month === 0 ? 12 : month;
      const dateString = `${pYear}-${String(pMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(pYear, pMonth - 1, d).getDay();
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: false,
        isSunday: dayOfWeek === 0,
        isSaturday: dayOfWeek === 6,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, d).getDay();
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: true,
        isSunday: dayOfWeek === 0,
        isSaturday: dayOfWeek === 6,
      });
    }

    // Next month overflow days
    const totalSlots = Math.ceil(days.length / 7) * 7;
    const remaining = totalSlots - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nYear = month === 11 ? year + 1 : year;
      const nMonth = month === 11 ? 1 : month + 2;
      const dateString = `${nYear}-${String(nMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(nYear, nMonth - 1, d).getDay();
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: false,
        isSunday: dayOfWeek === 0,
        isSaturday: dayOfWeek === 6,
      });
    }

    return days;
  }, [year, month]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Map classes by date for fast lookup
  const classesByDate = useMemo(() => {
    const map: Record<string, ClassItem[]> = {};
    classes.forEach(c => {
      if (!map[c.date]) map[c.date] = [];
      map[c.date].push(c);
    });
    return map;
  }, [classes]);

  // Selected class for Detail view
  const activeClass = useMemo(() => {
    return classes.find(c => c.id === activeClassId) || null;
  }, [classes, activeClassId]);

  // If Detail View is active, render ClassDetail
  if (activeClass) {
    return (
      <ClassDetail
        classItem={activeClass}
        allStudents={allStudents}
        onBack={() => setActiveClassId(null)}
        onUpdateClass={handleUpdateClass}
        onDeleteClass={handleDeleteClass}
        onOpenAbsenteeReport={date => {
          setAbsenteeReportDate(date);
          setIsAbsenteeModalOpen(true);
        }}
        onEditClassInfo={c => {
          setEditingClass(c);
          setIsClassModalOpen(true);
        }}
      />
    );
  }

  const selectedDateClasses = classesByDate[selectedDate] || [];
  const selectedDateAbsentCount = selectedDateClasses.reduce((acc, c) => {
    const abs = Object.values(c.students_attendance || {}).filter(r => r.status === 'ABSENT').length;
    return acc + abs;
  }, 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xs flex-shrink-0 z-10">
        
        {/* 달력 월 이동 네비게이션 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-all"
              title="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 text-lg font-black text-slate-900 min-w-[140px] text-center">
              {year}년 {month + 1}월
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-all"
              title="다음 달"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={goToToday}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
          >
            오늘
          </button>

          {saving && (
            <span className="text-xs text-indigo-600 font-bold flex items-center gap-1.5 animate-pulse">
              <RefreshCw size={13} className="animate-spin" /> 동기화 중...
            </span>
          )}
        </div>

        {/* 선택된 날짜 단축키 툴바 & 액션 */}
        <div className="flex items-center gap-2.5">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 font-medium">
            <span className="font-bold text-indigo-700">선택된 날짜:</span>
            <span className="font-black text-indigo-950">{selectedDate}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 font-bold">수업 {selectedDateClasses.length}개</span>
          </div>

          {/* 복사 버튼 (Ctrl+C) */}
          <button
            onClick={() => handleCopyDateClasses(selectedDate)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
            title="선택된 날짜의 수업 복사 (Ctrl+C)"
          >
            <Copy size={14} className="text-indigo-600" />
            수업 복사 <span className="text-[10px] text-slate-400 font-mono">Ctrl+C</span>
          </button>

          {/* 붙여넣기 버튼 (Ctrl+V) */}
          <button
            onClick={() => handlePasteClassesToDate(selectedDate)}
            disabled={clipboardClasses.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-xs font-bold transition-all shadow-xs"
            title="복사한 수업을 선택된 날짜에 붙여넣기 (Ctrl+V)"
          >
            <ClipboardPaste size={14} className="text-emerald-600" />
            붙여넣기 <span className="text-[10px] text-slate-400 font-mono">Ctrl+V</span>
            {clipboardClasses.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">
                {clipboardClasses.length}
              </span>
            )}
          </button>

          {/* 결석생 보고 */}
          <button
            onClick={() => {
              setAbsenteeReportDate(selectedDate);
              setIsAbsenteeModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <UserX size={15} />
            결석생 보고
            {selectedDateAbsentCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                {selectedDateAbsentCount}
              </span>
            )}
          </button>

          {/* 수업 등록 버튼 */}
          <button
            onClick={() => {
              setEditingClass(null);
              setIsClassModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 transition-all"
          >
            <Plus size={16} />
            수업 등록
          </button>
        </div>
      </div>

      {/* 2. 단축키 및 복사 상태 배너 */}
      <div className="bg-slate-100/80 border-b border-slate-200 px-8 py-2 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span className="font-bold flex items-center gap-1 text-slate-700">
            💡 단축키 가이드:
          </span>
          <span>날짜 클릭 후 <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-[11px]">Ctrl + C</kbd> 로 해당 날짜 전체 수업 복사,</span>
          <span>다른 날짜 클릭 후 <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-[11px]">Ctrl + V</kbd> 로 수업 붙여넣기!</span>
        </div>
        {clipboardClasses.length > 0 && (
          <div className="text-emerald-700 font-bold flex items-center gap-1">
            <Check size={14} /> 복사된 수업: {clipboardClasses.length}개 대기 중
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-24 right-8 z-50 animate-in slide-in-from-top-3 fade-in duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-sm font-bold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : toastMessage.type === 'warn'
                ? 'bg-amber-500 text-white border-amber-400'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <Sparkles size={16} />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 3. 달력 그리드 영역 */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          
          {/* 요일 헤더 (일 ~ 토) */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center py-2.5 text-xs font-black">
            <div className="text-rose-500">일 (SUN)</div>
            <div className="text-slate-700">월 (MON)</div>
            <div className="text-slate-700">화 (TUE)</div>
            <div className="text-slate-700">수 (WED)</div>
            <div className="text-slate-700">목 (THU)</div>
            <div className="text-slate-700">금 (FRI)</div>
            <div className="text-indigo-600">토 (SAT)</div>
          </div>

          {/* 달력 날짜 셀 그리드 */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6 divide-x divide-y divide-slate-100 overflow-y-auto">
            {calendarDays.map((dayItem, idx) => {
              const dayClasses = classesByDate[dayItem.dateString] || [];
              const isSelected = selectedDate === dayItem.dateString;
              const isToday = todayStr === dayItem.dateString;

              // Total absent count for this date
              const dayAbsentCount = dayClasses.reduce((acc, c) => {
                const count = Object.values(c.students_attendance || {}).filter(
                  r => r.status === 'ABSENT'
                ).length;
                return acc + count;
              }, 0);

              return (
                <div
                  key={`${dayItem.dateString}-${idx}`}
                  onClick={() => setSelectedDate(dayItem.dateString)}
                  className={`min-h-[110px] p-2 flex flex-col transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-indigo-50/40 ring-2 ring-indigo-500 ring-inset z-10'
                      : !dayItem.isCurrentMonth
                      ? 'bg-slate-50/40 opacity-40 hover:opacity-80'
                      : 'hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  {/* 날짜 번호 및 상단 뱃지 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-7 h-7 flex items-center justify-center rounded-xl text-xs font-black transition-all ${
                          isToday
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                            : isSelected
                            ? 'bg-indigo-100 text-indigo-900 font-extrabold'
                            : dayItem.isSunday
                            ? 'text-rose-500'
                            : dayItem.isSaturday
                            ? 'text-indigo-600'
                            : 'text-slate-700'
                        }`}
                      >
                        {dayItem.dayNumber}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-black text-indigo-600">오늘</span>
                      )}
                    </div>

                    {/* 빠른 수업 추가 & 결석생 뱃지 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedDate(dayItem.dateString);
                          setEditingClass(null);
                          setIsClassModalOpen(true);
                        }}
                        className="w-6 h-6 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-all"
                        title="이 날짜에 수업 추가"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* 결석생 뱃지 (상시 표시) */}
                    {dayAbsentCount > 0 && (
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          setAbsenteeReportDate(dayItem.dateString);
                          setIsAbsenteeModalOpen(true);
                        }}
                        className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md text-[10px] font-black text-rose-600 flex items-center gap-0.5 shadow-2xs"
                        title="결석생 보고서 열기"
                      >
                        <UserX size={10} /> {dayAbsentCount}
                      </span>
                    )}
                  </div>

                  {/* 해당 일자의 수업 카드 리스트 */}
                  <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
                    {dayClasses.map(c => {
                      const absentNum = Object.values(c.students_attendance || {}).filter(
                        r => r.status === 'ABSENT'
                      ).length;

                      return (
                        <div
                          key={c.id}
                          onClick={e => {
                            e.stopPropagation();
                            setActiveClassId(c.id);
                          }}
                          className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-xs p-1.5 rounded-lg text-left transition-all cursor-pointer group/card"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-slate-800 truncate group-hover/card:text-indigo-600">
                              {c.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {c.time.split('~')[0]?.trim()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1 font-bold">
                              <Users size={11} className="text-slate-400" />
                              {c.student_ids?.length || 0}명
                            </span>
                            {absentNum > 0 ? (
                              <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                                결석 {absentNum}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-medium">
                                전원출석
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 수업 등록 / 수정 모달 */}
      <ClassModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        date={editingClass?.date || selectedDate}
        initialClass={editingClass}
        onSave={handleSaveClassModal}
        allStudents={allStudents}
      />

      {/* 결석생 보고 모달 */}
      <AbsenteeModal
        isOpen={isAbsenteeModalOpen}
        onClose={() => setIsAbsenteeModalOpen(false)}
        date={absenteeReportDate}
        classes={classes}
      />
    </div>
  );
}
