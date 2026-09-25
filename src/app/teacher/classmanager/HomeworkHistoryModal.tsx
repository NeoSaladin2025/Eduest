'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  History, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Trash2, 
  Save, 
  Calendar, 
  Clock, 
  Check, 
  ArrowDownLeft, 
  Filter, 
  ArrowUpDown,
  BookOpen,
  CalendarDays
} from 'lucide-react';
import { ClassItem, HomeworkCheckStatus, StudentBasicInfo } from './types';

export interface HomeworkHistoryEntry {
  id: string;
  displayDate: string;
  className: string;
  assignClassId?: string;
  checkClassId?: string;
  content: string;
  dueDate: string;
  status: HomeworkCheckStatus;
  sourceType: 'ASSIGNED' | 'CHECKED' | 'BOTH';
  assignedDate?: string;
  checkedDate?: string;
}

interface HomeworkHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentBasicInfo | null;
  currentClass: ClassItem;
  allClasses: ClassItem[];
  onUpdateAllClasses: (classes: ClassItem[]) => void;
  onApplyHomeworkToCurrentClass?: (content: string, dueDate: string) => void;
}

export default function HomeworkHistoryModal({
  isOpen,
  onClose,
  student,
  currentClass,
  allClasses,
  onUpdateAllClasses,
  onApplyHomeworkToCurrentClass,
}: HomeworkHistoryModalProps) {
  // Period filter: default '1_MONTH' (최근 1개월)
  const [periodFilter, setPeriodFilter] = useState<'1_MONTH' | '3_MONTHS' | 'ALL'>('1_MONTH');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DONE' | 'NOT_DONE' | 'UNCHECKED'>('ALL');
  // Sort order: default 'DESC' (최근 숙제부터 빠른 순서)
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Extract all homework history entries for this student from allClasses
  const allEntries = useMemo(() => {
    if (!student) return [];
    const sid = student.id;

    const assignedList: { classItem: ClassItem; content: string; dueDate: string; checkStatus?: HomeworkCheckStatus }[] = [];
    const checkedList: { classItem: ClassItem; content: string; dueDate: string; status: HomeworkCheckStatus }[] = [];

    (allClasses || []).forEach(c => {
      const rec = c.students_attendance?.[sid];
      if (!rec) return;

      if (rec.today_homework && rec.today_homework.trim()) {
        assignedList.push({
          classItem: c,
          content: rec.today_homework.trim(),
          dueDate: rec.today_homework_due_date || '',
          checkStatus: rec.homework_check,
        });
      }

      if (rec.previous_homework && rec.previous_homework.trim()) {
        checkedList.push({
          classItem: c,
          content: rec.previous_homework.trim(),
          dueDate: rec.previous_homework_due_date || '',
          status: (rec.homework_check || 'UNCHECKED') as HomeworkCheckStatus,
        });
      }
    });

    const entries: HomeworkHistoryEntry[] = [];
    const usedCheckedIndices = new Set<number>();

    // Merge matching assigned & checked records
    assignedList.forEach(a => {
      let matchIdx = -1;
      for (let i = 0; i < checkedList.length; i++) {
        if (usedCheckedIndices.has(i)) continue;
        const ch = checkedList[i];
        if (ch.content === a.content && ch.classItem.date >= a.classItem.date) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx !== -1) {
        usedCheckedIndices.add(matchIdx);
        const ch = checkedList[matchIdx];
        entries.push({
          id: `both_${a.classItem.id}_${ch.classItem.id}`,
          displayDate: ch.classItem.date,
          assignedDate: a.classItem.date,
          checkedDate: ch.classItem.date,
          className: a.classItem.name,
          assignClassId: a.classItem.id,
          checkClassId: ch.classItem.id,
          content: a.content,
          dueDate: a.dueDate || ch.dueDate,
          status: ch.status,
          sourceType: 'BOTH',
        });
      } else {
        entries.push({
          id: `assign_${a.classItem.id}`,
          displayDate: a.classItem.date,
          assignedDate: a.classItem.date,
          className: a.classItem.name,
          assignClassId: a.classItem.id,
          content: a.content,
          dueDate: a.dueDate,
          status: a.checkStatus || 'UNCHECKED',
          sourceType: 'ASSIGNED',
        });
      }
    });

    checkedList.forEach((ch, idx) => {
      if (usedCheckedIndices.has(idx)) return;
      entries.push({
        id: `check_${ch.classItem.id}`,
        displayDate: ch.classItem.date,
        checkedDate: ch.classItem.date,
        className: ch.classItem.name,
        checkClassId: ch.classItem.id,
        content: ch.content,
        dueDate: ch.dueDate,
        status: ch.status,
        sourceType: 'CHECKED',
      });
    });

    return entries;
  }, [student, allClasses]);

  // Calculate cutoff dates based on currentClass.date
  const { oneMonthAgoStr, threeMonthsAgoStr } = useMemo(() => {
    const baseDate = new Date(currentClass?.date || new Date().toISOString().slice(0, 10));
    
    const d1 = new Date(baseDate);
    d1.setMonth(d1.getMonth() - 1);
    const oneMonthAgoStr = d1.toISOString().slice(0, 10);

    const d3 = new Date(baseDate);
    d3.setMonth(d3.getMonth() - 3);
    const threeMonthsAgoStr = d3.toISOString().slice(0, 10);

    return { oneMonthAgoStr, threeMonthsAgoStr };
  }, [currentClass?.date]);

  // Filtered & sorted entries
  const filteredEntries = useMemo(() => {
    let result = [...allEntries];

    if (periodFilter === '1_MONTH') {
      result = result.filter(e => e.displayDate >= oneMonthAgoStr);
    } else if (periodFilter === '3_MONTHS') {
      result = result.filter(e => e.displayDate >= threeMonthsAgoStr);
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(e => e.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortOrder === 'DESC') {
        return b.displayDate.localeCompare(a.displayDate);
      } else {
        return a.displayDate.localeCompare(b.displayDate);
      }
    });

    return result;
  }, [allEntries, periodFilter, statusFilter, sortOrder, oneMonthAgoStr, threeMonthsAgoStr]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredEntries.length;
    const done = filteredEntries.filter(e => e.status === 'DONE').length;
    const notDone = filteredEntries.filter(e => e.status === 'NOT_DONE').length;
    const unchecked = filteredEntries.filter(e => !e.status || e.status === 'UNCHECKED').length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, notDone, unchecked, rate };
  }, [filteredEntries]);

  if (!isOpen || !student) return null;

  // 1. Toggle Homework Status (DONE, NOT_DONE, UNCHECKED)
  const handleToggleStatus = (entry: HomeworkHistoryEntry, targetStatus: 'DONE' | 'NOT_DONE') => {
    const nextStatus: HomeworkCheckStatus = entry.status === targetStatus ? 'UNCHECKED' : targetStatus;
    const sid = student.id;

    const nextClasses = (allClasses || []).map(c => {
      let isTarget = false;
      const curRec = c.students_attendance?.[sid];
      if (!curRec) return c;

      const updatedRec = { ...curRec };

      if (entry.checkClassId && c.id === entry.checkClassId) {
        updatedRec.homework_check = nextStatus;
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      } else if (!entry.checkClassId && entry.assignClassId && c.id === entry.assignClassId) {
        updatedRec.homework_check = nextStatus;
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      }

      if (isTarget) {
        return {
          ...c,
          students_attendance: {
            ...c.students_attendance,
            [sid]: updatedRec,
          },
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });

    onUpdateAllClasses(nextClasses);
    const label = nextStatus === 'DONE' ? '숙제 완료' : nextStatus === 'NOT_DONE' ? '숙제 미완료' : '선택 취소';
    showToast(`'${entry.displayDate}' 숙제 상태가 [${label}]로 변경되었습니다.`);
  };

  // 2. Start Editing Content
  const handleStartEdit = (entry: HomeworkHistoryEntry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
    setEditDueDate(entry.dueDate || '');
  };

  // 3. Save Edited Content
  const handleSaveEdit = (entry: HomeworkHistoryEntry) => {
    if (!editContent.trim()) {
      alert('숙제 내용을 입력해주세요.');
      return;
    }
    const sid = student.id;

    const nextClasses = (allClasses || []).map(c => {
      let isTarget = false;
      const curRec = c.students_attendance?.[sid];
      if (!curRec) return c;

      const updatedRec = { ...curRec };

      if (entry.assignClassId && c.id === entry.assignClassId) {
        updatedRec.today_homework = editContent.trim();
        updatedRec.today_homework_due_date = editDueDate;
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      }

      if (entry.checkClassId && c.id === entry.checkClassId) {
        updatedRec.previous_homework = editContent.trim();
        updatedRec.previous_homework_due_date = editDueDate;
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      }

      if (isTarget) {
        return {
          ...c,
          students_attendance: {
            ...c.students_attendance,
            [sid]: updatedRec,
          },
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });

    onUpdateAllClasses(nextClasses);
    setEditingId(null);
    showToast('숙제 내용이 성공적으로 수정되었습니다.');
  };

  // 4. Delete / Remove Entry from History
  const handleDeleteEntry = (entry: HomeworkHistoryEntry) => {
    if (!confirm(`"${entry.content}" 숙제 내역을 히스토리에서 제거하시겠습니까?\n해당 수업의 숙제 기록에서도 삭제됩니다.`)) {
      return;
    }
    const sid = student.id;

    const nextClasses = (allClasses || []).map(c => {
      let isTarget = false;
      const curRec = c.students_attendance?.[sid];
      if (!curRec) return c;

      const updatedRec = { ...curRec };

      if (entry.assignClassId && c.id === entry.assignClassId) {
        updatedRec.today_homework = '';
        updatedRec.today_homework_due_date = '';
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      }

      if (entry.checkClassId && c.id === entry.checkClassId) {
        updatedRec.previous_homework = '';
        updatedRec.previous_homework_due_date = '';
        updatedRec.homework_check = 'UNCHECKED';
        updatedRec.updated_at = new Date().toISOString();
        isTarget = true;
      }

      if (isTarget) {
        return {
          ...c,
          students_attendance: {
            ...c.students_attendance,
            [sid]: updatedRec,
          },
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });

    onUpdateAllClasses(nextClasses);
    showToast('숙제 내역이 리스트에서 제거되었습니다.');
  };

  // 5. Load into current class previous homework
  const handleApplyToCurrentClass = (entry: HomeworkHistoryEntry) => {
    if (onApplyHomeworkToCurrentClass) {
      onApplyHomeworkToCurrentClass(entry.content, entry.dueDate);
      showToast(`이 숙제 내용이 오늘 최근 숙제칸에 성공적으로 반영되었습니다! 📥`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* 1. Modal Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 font-black">
              <History size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  {student.name} 학생 숙제 히스토리
                </h3>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-md">
                  {student.grade}
                </span>
                {toastMsg && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-pulse flex items-center gap-1">
                    <Check size={12} /> {toastMsg}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                최근 1개월간의 부여 및 검사된 숙제 내역을 확인하고, 완료 여부·내용 수정 및 리스트 제거를 관리합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2. Filter & Statistics Toolbar */}
        <div className="px-6 py-3 bg-slate-50/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
          {/* 기간 필터 & 정렬 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-xl shadow-2xs">
              <button
                type="button"
                onClick={() => setPeriodFilter('1_MONTH')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  periodFilter === '1_MONTH'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                최근 1개월
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter('3_MONTHS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  periodFilter === '3_MONTHS'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                최근 3개월
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  periodFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체
              </button>
            </div>

            {/* 정렬 토글 */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => (prev === 'DESC' ? 'ASC' : 'DESC'))}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition-all shadow-2xs"
              title="정렬 순서 변경"
            >
              <ArrowUpDown size={13} className="text-indigo-600" />
              <span>{sortOrder === 'DESC' ? '⬇️ 최근순 (빠른 순)' : '⬆️ 오래된순'}</span>
            </button>
          </div>

          {/* 통계 요약 뱃지 */}
          <div className="flex items-center gap-2 font-bold">
            <span className="text-slate-500">
              총 <strong className="text-slate-800">{stats.total}</strong>건
            </span>
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ 완료 {stats.done}건
            </span>
            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ✕ 미완료 {stats.notDone}건
            </span>
            {stats.unchecked > 0 && (
              <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                미체크 {stats.unchecked}건
              </span>
            )}
            <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              달성률 {stats.rate}%
            </span>
          </div>
        </div>

        {/* 3. Modal Body: List of Homework Cards */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {filteredEntries.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                <BookOpen size={28} />
              </div>
              <p className="text-base font-bold text-slate-700">해당 기간에 등록된 숙제 내역이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">
                {periodFilter === '1_MONTH'
                  ? '최근 1개월간의 숙제가 없습니다. 필터를 "전체"로 변경하여 과거 내역을 확인해보세요.'
                  : '수업 상세 화면에서 숙제를 부여하거나 검사하면 자동으로 히스토리에 기록됩니다.'}
              </p>
              {periodFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setPeriodFilter('ALL')}
                  className="mt-4 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all"
                >
                  전체 기간 숙제 보기
                </button>
              )}
            </div>
          ) : (
            filteredEntries.map((item, idx) => {
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4.5 shadow-2xs transition-all space-y-3 ${
                    item.status === 'DONE'
                      ? 'border-emerald-200 hover:border-emerald-300'
                      : item.status === 'NOT_DONE'
                      ? 'border-rose-200 hover:border-rose-300'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                        <Calendar size={13} className="text-indigo-600" />
                        <span>{item.displayDate}</span>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {item.className}
                      </span>
                      {item.dueDate && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <CalendarDays size={11} className="text-amber-600" />
                          기한: {item.dueDate}
                        </span>
                      )}
                    </div>

                    {/* 완료 / 미완료 토글 버튼 (사용자 요청: 수정 가능 - 숙제완료, 숙제미완료) */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item, 'DONE')}
                        className={`px-2.5 py-1 rounded-xl font-black text-xs flex items-center gap-1 border transition-all ${
                          item.status === 'DONE'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs scale-[1.02]'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                        title="숙제완료로 변경 (재클릭 시 취소)"
                      >
                        <CheckCircle2 size={13} />
                        숙제완료
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item, 'NOT_DONE')}
                        className={`px-2.5 py-1 rounded-xl font-black text-xs flex items-center gap-1 border transition-all ${
                          item.status === 'NOT_DONE'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-2xs scale-[1.02]'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700'
                        }`}
                        title="숙제미완료로 변경 (재클릭 시 취소)"
                      >
                        <XCircle size={13} />
                        숙제미완료
                      </button>
                    </div>
                  </div>

                  {/* Item Content Area (사용자 요청: 내용 수정) */}
                  {isEditing ? (
                    <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-indigo-200">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-indigo-900">
                          ✏️ 숙제 내용 및 기한일 수정
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-500">기한일:</span>
                          <input
                            type="date"
                            value={editDueDate}
                            onChange={e => setEditDueDate(e.target.value)}
                            className="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        placeholder="숙제 내용을 입력하세요"
                        className="w-full p-2.5 bg-white border border-indigo-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item)}
                          className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <Save size={13} />
                          수정 저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-xs font-medium text-slate-800 whitespace-pre-wrap leading-relaxed flex-1 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                        {item.content}
                      </p>
                    </div>
                  )}

                  {/* Item Footer Controls: 내용수정, 리스트제거, 오늘 수업에 불러오기 */}
                  {!isEditing && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-2">
                        {onApplyHomeworkToCurrentClass && (
                          <button
                            type="button"
                            onClick={() => handleApplyToCurrentClass(item)}
                            className="text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 transition-all flex items-center gap-1"
                            title="이 숙제를 현재 진행 중인 수업의 최근 숙제칸에 반영합니다"
                          >
                            <ArrowDownLeft size={12} />
                            오늘 수업에 불러오기
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-indigo-200 transition-all flex items-center gap-1"
                          title="숙제 내용 및 기한일 수정"
                        >
                          <Edit3 size={12} />
                          내용수정
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(item)}
                          className="text-[11px] font-bold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition-all flex items-center gap-1"
                          title="리스트에서 이 숙제 제거"
                        >
                          <Trash2 size={12} />
                          리스트제거
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 4. Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between text-xs flex-shrink-0">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Check size={14} className="text-emerald-500" />
            완료 여부 변경, 내용 수정 및 제거 내역은 클라우드에 실시간 자동 동기화됩니다.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-2xs transition-all"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
}
