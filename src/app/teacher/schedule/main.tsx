'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  School, 
  Pin, 
  Sparkles, 
  Trash2, 
  Edit3, 
  X, 
  Check, 
  AlertCircle,
  CalendarDays,
  Search,
  Filter,
  Flame,
  Zap,
  Activity,
  Award
} from 'lucide-react';
import { 
  ScheduleItem, 
  ScheduleType, 
  VisualEffect, 
  SCHEDULES_STORAGE_KEY, 
  COLOR_PRESETS,
  isDateInScheduleRange 
} from '@/lib/scheduleTypes';

const QUICK_SCHOOLS = ['대치중', '역삼중', '도곡중', '휘문중', '단대부중', '숙명여중', '중동중', '개원중', '구룡중', '단대부고', '휘문고', '중대부고'];
const QUICK_EXAMS = ['1학기 중간고사', '1학기 기말고사', '2학기 중간고사', '2학기 기말고사', '전국연합학력평가', '수능 모의평가'];
const QUICK_SPECIAL_TITLES = ['📢 학원 공식 휴원일', '📝 중간고사 직전 총정리 특강', '🔥 주말 집중 보강 클리닉', '🎯 전국 모의고사 실시', '☕ 전체 강사 회의', '👨‍👩‍👧 학부모 입시 설명회'];

export default function ScheduleManagerMain() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Filter & Search
  const [filterType, setFilterType] = useState<'ALL' | 'ACADEMIC' | 'SPECIAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ScheduleType>('ACADEMIC');
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);

  // Form State
  const [formSchool, setFormSchool] = useState('');
  const [formGrade, setFormGrade] = useState('공통');
  const [formExamType, setFormExamType] = useState('2학기 중간고사');
  const [formTitle, setFormTitle] = useState('');
  const [formStartDate, setFormStartDate] = useState(selectedDate);
  const [formEndDate, setFormEndDate] = useState(selectedDate);
  const [formColor, setFormColor] = useState('yellow');
  const [formEffect, setFormEffect] = useState<VisualEffect>('normal');
  const [formContent, setFormContent] = useState('');

  // Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warn' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'warn' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 1. Fetch schedules from Cloud & LocalStorage
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      // Read local cache for immediate 0ms render
      const local = localStorage.getItem(SCHEDULES_STORAGE_KEY);
      let localData: ScheduleItem[] = [];
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) {
            localData = parsed;
            setSchedules(localData);
          }
        } catch (_) {}
      }

      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        const serverSchedules: ScheduleItem[] = Array.isArray(data.schedules) ? data.schedules : [];
        if (serverSchedules.length > 0) {
          setSchedules(serverSchedules);
          localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(serverSchedules));
        } else if (localData.length > 0) {
          // If server is empty but local has data, save to cloud
          saveSchedulesToCloud(localData);
        }
      }
    } catch (e) {
      console.error('Failed to load schedules:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  // Save to Cloud and local
  const saveSchedulesToCloud = async (updated: ScheduleItem[]) => {
    setSchedules(updated);
    localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(updated));

    try {
      setSaving(true);
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: updated }),
      });
    } catch (e) {
      console.error('Save to cloud failed:', e);
      showToast('클라우드 동기화 실패 (로컬에 안전하게 보관됨)', 'warn');
    } finally {
      setSaving(false);
    }
  };

  // Open Modal for Add
  const openAddModal = (type: ScheduleType, targetDate?: string) => {
    const d = targetDate || selectedDate;
    setEditingSchedule(null);
    setModalMode(type);
    setFormStartDate(d);
    setFormEndDate(d);
    if (type === 'ACADEMIC') {
      setFormSchool('대치중');
      setFormGrade('2학년');
      setFormExamType('2학기 중간고사');
      setFormTitle('대치중 2학기 중간고사');
      setFormColor('indigo');
      setFormEffect('glow');
      setFormContent('');
    } else {
      setFormTitle('📢 특이사항 메모');
      setFormColor('yellow');
      setFormEffect('shake');
      setFormContent('');
    }
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const openEditModal = (item: ScheduleItem) => {
    setEditingSchedule(item);
    setModalMode(item.type);
    setFormTitle(item.title);
    setFormStartDate(item.startDate);
    setFormEndDate(item.endDate);
    setFormSchool(item.schoolName || '');
    setFormGrade(item.grade || '공통');
    setFormExamType(item.examType || '중간고사');
    setFormColor(item.color || 'yellow');
    setFormEffect(item.effect || 'normal');
    setFormContent(item.content || '');
    setIsModalOpen(true);
  };

  // Save (Create or Update)
  const handleSaveModal = () => {
    if (modalMode === 'ACADEMIC') {
      if (!formSchool.trim()) {
        showToast('학교명을 입력하거나 선택해주세요!', 'warn');
        return;
      }
    } else {
      if (!formTitle.trim()) {
        showToast('일정 제목을 입력해주세요!', 'warn');
        return;
      }
    }

    if (formStartDate > formEndDate) {
      showToast('종료일이 시작일보다 빠를 수 없습니다.', 'warn');
      return;
    }

    const title = modalMode === 'ACADEMIC' 
      ? `[${formSchool.trim()}] ${formGrade} ${formExamType}` 
      : formTitle.trim();

    if (editingSchedule) {
      // Update
      const updated = schedules.map(item => {
        if (item.id === editingSchedule.id) {
          return {
            ...item,
            title,
            startDate: formStartDate,
            endDate: formEndDate,
            schoolName: modalMode === 'ACADEMIC' ? formSchool.trim() : undefined,
            grade: modalMode === 'ACADEMIC' ? formGrade : undefined,
            examType: modalMode === 'ACADEMIC' ? formExamType : undefined,
            color: formColor,
            effect: formEffect,
            content: formContent.trim(),
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });
      saveSchedulesToCloud(updated);
      showToast(`✨ 일정이 성공적으로 수정되었습니다!`, 'success');
    } else {
      // Create
      const newItem: ScheduleItem = {
        id: crypto.randomUUID(),
        type: modalMode,
        title,
        startDate: formStartDate,
        endDate: formEndDate,
        schoolName: modalMode === 'ACADEMIC' ? formSchool.trim() : undefined,
        grade: modalMode === 'ACADEMIC' ? formGrade : undefined,
        examType: modalMode === 'ACADEMIC' ? formExamType : undefined,
        color: formColor,
        effect: formEffect,
        content: formContent.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...schedules, newItem];
      saveSchedulesToCloud(updated);
      showToast(
        modalMode === 'ACADEMIC' 
          ? `🏫 ${formSchool} 시험 일정이 등록되었습니다!` 
          : `📌 포스트잇 특이사항이 달력에 부착되었습니다!`,
        'success'
      );
    }

    setIsModalOpen(false);
  };

  // Delete
  const handleDeleteSchedule = (id: string) => {
    if (!confirm('정말 이 일정을 삭제하시겠습니까?')) return;
    const updated = schedules.filter(s => s.id !== id);
    saveSchedulesToCloud(updated);
    showToast('일정이 삭제되었습니다.', 'info');
    setIsModalOpen(false);
  };

  // Keyboard navigation for date cell selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElem = document.activeElement;
      const isInput =
        activeElem?.tagName === 'INPUT' ||
        activeElem?.tagName === 'TEXTAREA' ||
        (activeElem as HTMLElement)?.isContentEditable;

      if (isInput || isModalOpen) return;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const [y, m, d] = selectedDate.split('-').map(Number);
        const curr = new Date(y, m - 1, d);

        if (e.key === 'ArrowLeft') curr.setDate(curr.getDate() - 1);
        if (e.key === 'ArrowRight') curr.setDate(curr.getDate() + 1);
        if (e.key === 'ArrowUp') curr.setDate(curr.getDate() - 7);
        if (e.key === 'ArrowDown') curr.setDate(curr.getDate() + 7);

        const newDateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
        setSelectedDate(newDateStr);

        // 월 변경 자동 동기화
        if (curr.getMonth() !== currentDate.getMonth() || curr.getFullYear() !== currentDate.getFullYear()) {
          setCurrentDate(new Date(curr.getFullYear(), curr.getMonth(), 1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openAddModal('SPECIAL', selectedDate);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, currentDate, isModalOpen]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days: {
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSunday: boolean;
      isSaturday: boolean;
    }[] = [];

    // Prev month overflow
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

    // Current month
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

    // Next month overflow
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

  // Filter schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (filterType !== 'ALL' && s.type !== filterType) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = s.title.toLowerCase().includes(query);
        const matchesSchool = s.schoolName?.toLowerCase().includes(query);
        const matchesContent = s.content?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSchool && !matchesContent) return false;
      }
      return true;
    });
  }, [schedules, filterType, searchQuery]);

  // Group schedules by date for easy day-cell display
  const schedulesByDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    calendarDays.forEach(day => {
      const matched = filteredSchedules.filter(s => 
        isDateInScheduleRange(day.dateString, s.startDate, s.endDate)
      );
      if (matched.length > 0) {
        map[day.dateString] = matched;
      }
    });
    return map;
  }, [calendarDays, filteredSchedules]);

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-sans relative">
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-xs flex-shrink-0 z-10">
        {/* 달력 월 이동 & 오늘 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 text-base md:text-lg font-black text-slate-900 min-w-[130px] text-center">
              {year}년 {month + 1}월
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
              title="다음 달"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            오늘
          </button>

          {/* 탭 필터 (전체 / 학사일정 / 주요일정) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-white text-indigo-600 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              전체 보기
            </button>
            <button
              onClick={() => setFilterType('ACADEMIC')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterType === 'ACADEMIC'
                  ? 'bg-white text-rose-600 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <School size={13} />
              학사일정 (학교시험)
            </button>
            <button
              onClick={() => setFilterType('SPECIAL')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterType === 'SPECIAL'
                  ? 'bg-white text-amber-600 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Pin size={13} />
              주요일정 (포스트잇)
            </button>
          </div>
        </div>

        {/* 우측 검색 & 일정 등록 버튼들 */}
        <div className="flex items-center gap-3">
          {/* 검색창 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="학교명, 일정 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 md:w-52"
            />
          </div>

          {/* 학사일정 추가 버튼 */}
          <button
            onClick={() => openAddModal('ACADEMIC')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 transition-all cursor-pointer"
          >
            <School size={14} />
            학사일정 등록
          </button>

          {/* 주요일정 (포스트잇) 추가 버튼 */}
          <button
            onClick={() => openAddModal('SPECIAL')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-slate-950 rounded-xl text-xs font-black shadow-md shadow-amber-200 transition-all cursor-pointer"
          >
            <Pin size={14} />
            주요일정(포스트잇) 부착
          </button>
        </div>
      </div>

      {/* 2. 단축키 안내 배너 */}
      <div className="bg-slate-100/90 border-b border-slate-200 px-6 py-2 flex items-center justify-between text-xs text-slate-600 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold flex items-center gap-1 text-slate-700">
            💡 키보드 단축키:
          </span>
          <span>방향키 <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-[10px]">← ↑ ↓ →</kbd> 로 날짜 이동,</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-[10px]">Enter</kbd> 누르면 해당 날짜에 일정 즉시 등록!</span>
        </div>
        <div className="text-slate-500 font-bold text-[11px] flex items-center gap-2">
          <span>선택된 날짜: <span className="text-indigo-600 font-black">{selectedDate}</span></span>
          <span>•</span>
          <span>총 등록 일정: <span className="text-slate-800 font-black">{schedules.length}개</span></span>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 animate-in slide-in-from-top-3 fade-in duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-black ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-200'
                : toastMessage.type === 'warn'
                ? 'bg-amber-500 text-white border-amber-400 shadow-amber-200'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <Sparkles size={16} />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 3. 달력 그리드 영역 */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center py-2.5 text-xs font-black flex-shrink-0">
            <div className="text-rose-500">일 (SUN)</div>
            <div className="text-slate-700">월 (MON)</div>
            <div className="text-slate-700">화 (TUE)</div>
            <div className="text-slate-700">수 (WED)</div>
            <div className="text-slate-700">목 (THU)</div>
            <div className="text-slate-700">금 (FRI)</div>
            <div className="text-indigo-600">토 (SAT)</div>
          </div>

          {/* 날짜 셀 그리드 */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6 divide-x divide-y divide-slate-100 overflow-y-auto">
            {calendarDays.map((dayItem, idx) => {
              const daySchedules = schedulesByDate[dayItem.dateString] || [];
              const isSelected = selectedDate === dayItem.dateString;
              const isToday = todayStr === dayItem.dateString;

              return (
                <div
                  key={`${dayItem.dateString}-${idx}`}
                  onClick={() => setSelectedDate(dayItem.dateString)}
                  className={`min-h-[125px] p-2 flex flex-col transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-indigo-50/40 ring-2 ring-indigo-500 ring-inset z-10'
                      : !dayItem.isCurrentMonth
                      ? 'bg-slate-50/40 opacity-40 hover:opacity-80'
                      : 'hover:bg-slate-50/70 bg-white'
                  }`}
                >
                  {/* 날짜 번호 및 추가 버튼 */}
                  <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
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

                    {/* 빠른 추가 버튼 (마우스 오버 시 노출) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          openAddModal('SPECIAL', dayItem.dateString);
                        }}
                        className="p-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 transition-all"
                        title="주요일정 포스트잇 부착"
                      >
                        <Pin size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          openAddModal('ACADEMIC', dayItem.dateString);
                        }}
                        className="p-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 transition-all"
                        title="학사일정(시험) 추가"
                      >
                        <School size={12} />
                      </button>
                    </div>
                  </div>

                  {/* 해당 일자의 일정 목록 카드 */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                    {daySchedules.map(item => {
                      const preset = COLOR_PRESETS[item.color] || COLOR_PRESETS.yellow;
                      const effectClass = item.effect ? `effect-${item.effect}` : '';

                      if (item.type === 'ACADEMIC') {
                        // 🏫 학사일정 (학교 시험 배너)
                        return (
                          <div
                            key={item.id}
                            onClick={e => {
                              e.stopPropagation();
                              openEditModal(item);
                            }}
                            className={`p-1.5 rounded-lg border text-[11px] font-bold transition-all hover:scale-[1.02] cursor-pointer shadow-xs flex items-center justify-between gap-1 ${preset.lightBg} ${preset.border} ${preset.badgeText} ${effectClass}`}
                            title={`[학사일정] ${item.title}\n기간: ${item.startDate} ~ ${item.endDate}${item.content ? `\n메모: ${item.content}` : ''}`}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <School size={12} className="shrink-0 text-rose-500" />
                              <span className="truncate font-black">{item.title}</span>
                            </div>
                            <span className="text-[9px] px-1 py-0.2 bg-white/80 rounded font-semibold shrink-0">
                              시험
                            </span>
                          </div>
                        );
                      }

                      // 📌 주요일정 (포스트잇 메모 카드)
                      return (
                        <div
                          key={item.id}
                          onClick={e => {
                            e.stopPropagation();
                            openEditModal(item);
                          }}
                          className={`p-2 rounded-xl text-[11px] border transition-all hover:scale-[1.03] cursor-pointer shadow-sm relative group/postit ${preset.postItBg} ${preset.border} ${preset.text} ${effectClass}`}
                          style={{ transform: 'rotate(-1deg)' }}
                          title={`[주요일정] ${item.title}${item.content ? `\n${item.content}` : ''}`}
                        >
                          {/* 포스트잇 핀 장식 */}
                          <div className="absolute -top-1.5 left-2 w-3 h-3 flex items-center justify-center text-rose-500">
                            <Pin size={10} className="fill-rose-500" />
                          </div>

                          <div className="font-black truncate pt-0.5 flex items-center justify-between">
                            <span>{item.title}</span>
                            {item.effect === 'glow' && <Zap size={10} className="text-amber-500 animate-pulse" />}
                            {item.effect === 'shake' && <Activity size={10} className="text-rose-500 animate-spin" />}
                            {item.effect === 'sparkle' && <Sparkles size={10} className="text-indigo-500" />}
                          </div>

                          {item.content && (
                            <p className="text-[10px] line-clamp-2 opacity-80 mt-0.5 font-medium leading-tight whitespace-pre-wrap">
                              {item.content}
                            </p>
                          )}
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

      {/* 4. 일정 등록 / 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className={`p-2.5 rounded-2xl ${modalMode === 'ACADEMIC' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
                  {modalMode === 'ACADEMIC' ? <School size={20} /> : <Pin size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {editingSchedule ? '일정 수정하기' : modalMode === 'ACADEMIC' ? '새 학사일정 (학교 시험) 등록' : '새 주요일정 (포스트잇) 부착'}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    {modalMode === 'ACADEMIC' ? '각 학교별 시험 기간을 등록하여 학사 일정을 관리합니다.' : '달력에 메모할 특이사항과 포스트잇을 등록합니다.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* 일정 타입 전환 탭 (신규 생성 시에만 전환 가능) */}
            {!editingSchedule && (
              <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 text-xs font-black">
                <button
                  type="button"
                  onClick={() => setModalMode('ACADEMIC')}
                  className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    modalMode === 'ACADEMIC'
                      ? 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <School size={14} />
                  학사일정 (학교 시험)
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('SPECIAL')}
                  className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    modalMode === 'SPECIAL'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Pin size={14} />
                  주요일정 (포스트잇)
                </button>
              </div>
            )}

            {/* 폼 본문 */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
              {modalMode === 'ACADEMIC' ? (
                <>
                  {/* 학교명 입력 & 추천 칩 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      학교명 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 대치중, 휘문고"
                      value={formSchool}
                      onChange={e => setFormSchool(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {QUICK_SCHOOLS.map(sch => (
                        <button
                          key={sch}
                          type="button"
                          onClick={() => setFormSchool(sch)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            formSchool === sch
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {sch}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 학년 및 시험 구분 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5">학년</label>
                      <select
                        value={formGrade}
                        onChange={e => setFormGrade(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="공통">공통 (전학년)</option>
                        <option value="중1">중학교 1학년</option>
                        <option value="중2">중학교 2학년</option>
                        <option value="중3">중학교 3학년</option>
                        <option value="고1">고등학교 1학년</option>
                        <option value="고2">고등학교 2학년</option>
                        <option value="고3">고등학교 3학년</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5">시험 구분</label>
                      <select
                        value={formExamType}
                        onChange={e => setFormExamType(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {QUICK_EXAMS.map(ex => (
                          <option key={ex} value={ex}>{ex}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 주요일정 제목 & 추천 칩 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      포스트잇 제목 <span className="text-amber-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 📢 10월 9일 한글날 휴원"
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {QUICK_SPECIAL_TITLES.map(title => (
                        <button
                          key={title}
                          type="button"
                          onClick={() => setFormTitle(title)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 bg-white hover:bg-amber-50 text-slate-700 transition-all cursor-pointer"
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 기간 지정 (시작일 ~ 종료일) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">시작일</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">종료일</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* 포스트잇 / 배너 색상 선택 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">컬러 테마</label>
                <div className="flex items-center gap-2">
                  {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormColor(key)}
                      className={`w-7 h-7 rounded-xl transition-all cursor-pointer flex items-center justify-center ${preset.bg} ${
                        formColor === key ? 'ring-3 ring-offset-2 ring-indigo-600 scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
                      }`}
                      title={preset.name}
                    >
                      {formColor === key && <Check size={14} className="text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 시각 효과 선택 (번쩍임, 떨림 등) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  시각 효과 (인터랙션 효과 ✨)
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs font-bold">
                  {[
                    { id: 'normal', label: '일반 (없음)', icon: null },
                    { id: 'glow', label: '번쩍임 ✨', icon: <Zap size={12} className="text-amber-500" /> },
                    { id: 'shake', label: '떨림 〰️', icon: <Activity size={12} className="text-rose-500" /> },
                    { id: 'sparkle', label: '반짝임 🌟', icon: <Sparkles size={12} className="text-indigo-500" /> },
                  ].map(eff => (
                    <button
                      key={eff.id}
                      type="button"
                      onClick={() => setFormEffect(eff.id as VisualEffect)}
                      className={`py-2 px-2 rounded-xl border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formEffect === eff.id
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs font-black'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {eff.icon}
                      <span>{eff.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세 메모 내용 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  상세 메모 / 특이사항 내용
                </label>
                <textarea
                  rows={3}
                  placeholder={modalMode === 'ACADEMIC' ? "예: 수학/과학 시험 일정 및 직전대비 보강 일정" : "자유롭게 메모를 적어주세요. 달력에 포스트잇처럼 부착됩니다!"}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              {editingSchedule ? (
                <button
                  type="button"
                  onClick={() => handleDeleteSchedule(editingSchedule.id)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                  일정 삭제
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="px-5 py-2 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200 transition-all cursor-pointer"
                >
                  {editingSchedule ? '수정 완료' : '등록하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
