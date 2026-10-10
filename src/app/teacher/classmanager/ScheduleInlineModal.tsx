'use client';

import React, { useState } from 'react';
import { 
  X, 
  School, 
  Pin, 
  Edit3, 
  Trash2, 
  Check, 
  Plus, 
  Calendar, 
  Zap, 
  Activity, 
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { 
  ScheduleItem, 
  ScheduleType, 
  VisualEffect, 
  COLOR_PRESETS,
  SCHEDULES_STORAGE_KEY 
} from '@/lib/scheduleTypes';

interface ScheduleInlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateString: string;
  schedules: ScheduleItem[];
  allSchedules: ScheduleItem[];
  onUpdateAllSchedules: (updated: ScheduleItem[]) => void;
}

export default function ScheduleInlineModal({
  isOpen,
  onClose,
  dateString,
  schedules,
  allSchedules,
  onUpdateAllSchedules,
}: ScheduleInlineModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newType, setNewType] = useState<ScheduleType>('SPECIAL');

  // Form states for editing/adding
  const [formTitle, setFormTitle] = useState('');
  const [formSchool, setFormSchool] = useState('');
  const [formGrade, setFormGrade] = useState('공통');
  const [formExamType, setFormExamType] = useState('2학기 중간고사');
  const [formStartDate, setFormStartDate] = useState(dateString);
  const [formEndDate, setFormEndDate] = useState(dateString);
  const [formColor, setFormColor] = useState('yellow');
  const [formEffect, setFormEffect] = useState<VisualEffect>('normal');
  const [formContent, setFormContent] = useState('');

  if (!isOpen) return null;

  const startEdit = (item: ScheduleItem) => {
    setEditingId(item.id);
    setIsAddingNew(false);
    setFormTitle(item.title);
    setFormSchool(item.schoolName || '');
    setFormGrade(item.grade || '공통');
    setFormExamType(item.examType || '2학기 중간고사');
    setFormStartDate(item.startDate);
    setFormEndDate(item.endDate);
    setFormColor(item.color || 'yellow');
    setFormEffect(item.effect || 'normal');
    setFormContent(item.content || '');
  };

  const startAdd = (type: ScheduleType) => {
    setIsAddingNew(true);
    setEditingId(null);
    setNewType(type);
    setFormStartDate(dateString);
    setFormEndDate(dateString);
    if (type === 'ACADEMIC') {
      setFormSchool('');
      setFormGrade('공통');
      setFormExamType('2학기 중간고사');
      setFormTitle('');
      setFormColor('indigo');
      setFormEffect('glow');
      setFormContent('');
    } else {
      setFormTitle('📢 특이사항');
      setFormColor('yellow');
      setFormEffect('shake');
      setFormContent('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAddingNew(false);
  };

  const handleSave = () => {
    const isAcademic = isAddingNew ? newType === 'ACADEMIC' : allSchedules.find(s => s.id === editingId)?.type === 'ACADEMIC';

    if (isAcademic && !formSchool.trim()) {
      alert('학교명을 입력해주세요!');
      return;
    }
    if (!isAcademic && !formTitle.trim()) {
      alert('일정 제목을 입력해주세요!');
      return;
    }

    const title = isAcademic 
      ? `[${formSchool.trim()}] ${formGrade} ${formExamType}` 
      : formTitle.trim();

    if (isAddingNew) {
      const newItem: ScheduleItem = {
        id: crypto.randomUUID(),
        type: newType,
        title,
        startDate: formStartDate,
        endDate: formEndDate,
        schoolName: isAcademic ? formSchool.trim() : undefined,
        grade: isAcademic ? formGrade : undefined,
        examType: isAcademic ? formExamType : undefined,
        color: formColor,
        effect: formEffect,
        content: formContent.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onUpdateAllSchedules([...allSchedules, newItem]);
    } else if (editingId) {
      const updated = allSchedules.map(item => {
        if (item.id === editingId) {
          return {
            ...item,
            title,
            startDate: formStartDate,
            endDate: formEndDate,
            schoolName: isAcademic ? formSchool.trim() : undefined,
            grade: isAcademic ? formGrade : undefined,
            examType: isAcademic ? formExamType : undefined,
            color: formColor,
            effect: formEffect,
            content: formContent.trim(),
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });
      onUpdateAllSchedules(updated);
    }

    cancelEdit();
  };

  const handleDelete = (id: string) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    const updated = allSchedules.filter(s => s.id !== id);
    onUpdateAllSchedules(updated);
    cancelEdit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>{dateString}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                  등록 일정 {schedules.length}건
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">
                학사일정 및 주요일정을 확인하고 바로 수정할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 영역 */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* 수정/추가 폼이 열려 있을 때 */}
          {(editingId || isAddingNew) ? (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Edit3 size={14} className="text-indigo-600" />
                  {isAddingNew ? (newType === 'ACADEMIC' ? '새 학사일정 등록' : '새 주요일정(포스트잇) 부착') : '일정 내용 수정'}
                </span>
                <button
                  onClick={cancelEdit}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  취소
                </button>
              </div>

              {((isAddingNew && newType === 'ACADEMIC') || (!isAddingNew && allSchedules.find(s => s.id === editingId)?.type === 'ACADEMIC')) ? (
                <>
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">학교명 *</label>
                    <input
                      type="text"
                      placeholder="예: 대치중, 휘문고"
                      value={formSchool}
                      onChange={e => setFormSchool(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-black text-slate-700 mb-1">학년</label>
                      <select
                        value={formGrade}
                        onChange={e => setFormGrade(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
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
                      <label className="block text-[11px] font-black text-slate-700 mb-1">시험 구분</label>
                      <input
                        type="text"
                        value={formExamType}
                        onChange={e => setFormExamType(e.target.value)}
                        placeholder="예: 중간고사, 기말고사"
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">제목 *</label>
                  <input
                    type="text"
                    placeholder="예: 📢 학원 휴원일"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* 기간 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">시작일</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">종료일</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* 색상 및 시각 효과 */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1">색상</label>
                  <div className="flex items-center gap-1.5">
                    {Object.entries(COLOR_PRESETS).slice(0, 5).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormColor(key)}
                        className={`w-5 h-5 rounded-lg transition-all cursor-pointer ${preset.bg} ${
                          formColor === key ? 'ring-2 ring-indigo-600 scale-110' : 'opacity-70'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1">시각 효과</label>
                  <select
                    value={formEffect}
                    onChange={e => setFormEffect(e.target.value as VisualEffect)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700"
                  >
                    <option value="normal">일반</option>
                    <option value="glow">번쩍임 ✨</option>
                    <option value="shake">떨림 〰️</option>
                    <option value="sparkle">반짝임 🌟</option>
                  </select>
                </div>
              </div>

              {/* 메모 내용 */}
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">상세 메모</label>
                <textarea
                  rows={2}
                  placeholder="특이사항이나 세부 내용을 적어주세요."
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 resize-none"
                />
              </div>

              {/* 폼 버튼 */}
              <div className="flex items-center justify-between pt-1">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingId)}
                    className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={13} /> 삭제
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-1.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm cursor-pointer"
                  >
                    저장 완료
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* 일정 목록 카드 */}
          {schedules.length === 0 && !isAddingNew ? (
            <div className="py-8 text-center text-slate-400 text-xs font-bold space-y-2">
              <p>이 날짜에는 등록된 학사일정이나 주요일정이 없습니다.</p>
            </div>
          ) : (
            schedules.map(item => {
              const preset = COLOR_PRESETS[item.color] || COLOR_PRESETS.yellow;
              const isAcademic = item.type === 'ACADEMIC';
              const effectClass = item.effect ? `effect-${item.effect}` : '';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all shadow-xs flex flex-col gap-2 relative ${
                    isAcademic ? `${preset.lightBg} ${preset.border}` : `${preset.postItBg} ${preset.border}`
                  } ${effectClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl ${isAcademic ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-800'}`}>
                        {isAcademic ? <School size={16} /> : <Pin size={16} />}
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <span>{item.title}</span>
                          {item.effect === 'glow' && <Zap size={11} className="text-amber-500" />}
                          {item.effect === 'shake' && <Activity size={11} className="text-rose-500" />}
                          {item.effect === 'sparkle' && <Sparkles size={11} className="text-indigo-500" />}
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold">
                          기간: {item.startDate} ~ {item.endDate}
                        </div>
                      </div>
                    </div>

                    {/* 수정 버튼 */}
                    <button
                      onClick={() => startEdit(item)}
                      className="px-2.5 py-1 bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 border border-slate-200/60 rounded-xl text-[11px] font-black flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                    >
                      <Edit3 size={11} />
                      수정
                    </button>
                  </div>

                  {item.content && (
                    <div className="text-xs text-slate-700 bg-white/60 p-2 rounded-xl font-medium whitespace-pre-wrap leading-relaxed">
                      {item.content}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 하단 빠른 추가 버튼들 */}
        {!isAddingNew && !editingId && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => startAdd('SPECIAL')}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                <Plus size={13} />
                + 주요일정(포스트잇) 추가
              </button>
              <button
                type="button"
                onClick={() => startAdd('ACADEMIC')}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                <Plus size={13} />
                + 학사일정(시험) 추가
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
