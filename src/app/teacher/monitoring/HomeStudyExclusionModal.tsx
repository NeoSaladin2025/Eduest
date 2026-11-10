'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Clock, 
  Calendar, 
  Check, 
  Sparkles, 
  Users, 
  Loader2, 
  Info,
  HelpCircle
} from 'lucide-react';
import { 
  ExclusionRule, 
  HomeStudyRulesConfig, 
  WeekdayCode, 
  WEEKDAY_KO_MAP, 
  WEEKDAY_ORDER,
  DEFAULT_HOME_STUDY_RULES 
} from '@/lib/homeStudyTypes';

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface HomeStudyExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStudents: Student[];
  onRulesUpdated?: (rules: HomeStudyRulesConfig) => void;
}

export default function HomeStudyExclusionModal({
  isOpen,
  onClose,
  allStudents,
  onRulesUpdated,
}: HomeStudyExclusionModalProps) {
  const [activeTab, setActiveTab] = useState<'grade' | 'student'>('grade');
  const [rulesConfig, setRulesConfig] = useState<HomeStudyRulesConfig>(DEFAULT_HOME_STUDY_RULES);
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 새 규칙 입력 폼 상태
  const [formTitle, setFormTitle] = useState<string>('정규 단과 수업');
  const [formDays, setFormDays] = useState<WeekdayCode[]>(['MON', 'WED', 'FRI']);
  const [formStartTime, setFormStartTime] = useState<string>('18:00');
  const [formEndTime, setFormEndTime] = useState<string>('22:00');

  // 규칙 로드
  useEffect(() => {
    if (!isOpen) return;
    const fetchRules = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/monitoring/home-study/rules');
        const data = await res.json();
        if (data.success && data.rules) {
          setRulesConfig(data.rules);
        }
      } catch (err) {
        console.error('Failed to load rules:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, [isOpen]);

  // 요일 칩 토글
  const toggleDay = (day: WeekdayCode) => {
    setFormDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day]
    );
  };

  // 새 규칙 추가 (현재 선택된 학년 또는 학생에게)
  const handleAddRule = () => {
    if (formDays.length === 0) {
      alert('제외할 요일을 최소 1개 이상 선택해주세요.');
      return;
    }
    if (formStartTime >= formEndTime) {
      alert('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    const newRule: ExclusionRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: formTitle.trim() || '학원 수업',
      days: formDays,
      start_time: formStartTime,
      end_time: formEndTime,
      created_at: new Date().toISOString(),
    };

    setRulesConfig(prev => {
      const next = { ...prev };
      if (activeTab === 'grade') {
        const existing = next.grade_rules[selectedGrade] || [];
        next.grade_rules = {
          ...next.grade_rules,
          [selectedGrade]: [...existing, newRule],
        };
      } else {
        if (!selectedStudentId) {
          alert('예외 룰을 적용할 학생을 먼저 선택해주세요.');
          return prev;
        }
        const existing = next.student_overrides[selectedStudentId] || [];
        next.student_overrides = {
          ...next.student_overrides,
          [selectedStudentId]: [...existing, newRule],
        };
      }
      return next;
    });

    // 폼 초기화 (제목만 유지)
    setFormDays(['MON', 'WED', 'FRI']);
  };

  // 규칙 삭제
  const handleDeleteRule = (ruleId: string) => {
    setRulesConfig(prev => {
      const next = { ...prev };
      if (activeTab === 'grade') {
        const existing = next.grade_rules[selectedGrade] || [];
        next.grade_rules = {
          ...next.grade_rules,
          [selectedGrade]: existing.filter(r => r.id !== ruleId),
        };
      } else {
        if (!selectedStudentId) return prev;
        const existing = next.student_overrides[selectedStudentId] || [];
        next.student_overrides = {
          ...next.student_overrides,
          [selectedStudentId]: existing.filter(r => r.id !== ruleId),
        };
      }
      return next;
    });
  };

  // 최종 저장
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/monitoring/home-study/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: rulesConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      setToastMsg('🎉 학원 수업 제외 시간대 설정이 성공적으로 저장되었습니다!');
      if (onRulesUpdated) onRulesUpdated(rulesConfig);
      setTimeout(() => {
        setToastMsg(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(err.message || '저장 중 오류 발생');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // 현재 표시할 규칙 목록
  const activeRulesList: ExclusionRule[] = activeTab === 'grade'
    ? (rulesConfig.grade_rules[selectedGrade] || [])
    : (selectedStudentId ? (rulesConfig.student_overrides[selectedStudentId] || []) : []);

  // 학생 검색 필터
  const filteredStudents = allStudents.filter(s => 
    !studentSearch.trim() || 
    s.name.includes(studentSearch) || 
    s.grade.includes(studentSearch)
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white w-full max-w-4xl rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh]">
        
        {/* 토스트 알림 */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-xl text-xs font-black flex items-center gap-2 border border-violet-500/40 animate-in slide-in-from-top-2">
            <Sparkles size={16} className="text-amber-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* 1. 상단 모달 헤더 */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50/60 via-fuchsia-50/30 to-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-violet-200 shrink-0">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
                  학원 수업 제외 시간대 설정
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold border border-violet-200">
                  가정 학습 필터
                </span>
              </div>
              <p className="text-xs text-slate-400 font-bold mt-1">
                설정한 요일과 시간대에는 <strong>가정 학습 통계를 누적하지 않고</strong>, 순수 학원 외(집/독서실) 학습만 집계합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/80 hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2. 스코프 탭 (학년별 일괄 vs 학생별 개별 예외) */}
        <div className="shrink-0 px-6 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('grade')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'grade'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={14} />
              <span>🏫 학년별 일괄 설정 (권장)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('student')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'student'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤 특정 학생 개별 예외 설정</span>
            </button>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {activeTab === 'grade' ? (
              <span>선택 학년 전체 학생에게 수업 시간표가 공통 적용됩니다.</span>
            ) : (
              <span>수업 요일이 다른 학생에게만 개별 오버라이드를 적용합니다.</span>
            )}
          </div>
        </div>

        {/* 3. 모달 메인 콘텐츠 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
          
          {/* 학년 선택 (학년 탭일 때) */}
          {activeTab === 'grade' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-700 shrink-0">대상 학년 선택:</span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {['중1', '중2', '중3', '고1', '고2', '고3'].map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGrade(g)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      selectedGrade === g
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 학생 선택 (학생 탭일 때) */}
          {activeTab === 'student' && (
            <div className="space-y-2 bg-slate-50/60 p-4 rounded-2xl border border-slate-200/70">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-700">예외를 적용할 학생 선택:</span>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="학생 이름 또는 학년 검색..."
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 w-48"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none max-h-24">
                {filteredStudents.slice(0, 20).map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStudentId(st.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                      selectedStudentId === st.id
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <span>{st.name}</span>
                    <span className="text-[10px] ml-1 opacity-70">({st.grade})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 새로운 제외 시간대 추가 폼 박스 */}
          <div className="bg-gradient-to-r from-violet-50/70 via-fuchsia-50/30 to-purple-50/50 border-2 border-dashed border-violet-300 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-violet-900 flex items-center gap-1.5">
                <Plus size={15} className="text-violet-600" />
                새로운 학원 수업 제외 시간대 등록
              </span>
              <span className="text-[11px] font-bold text-violet-600">
                {activeTab === 'grade' ? `[${selectedGrade}] 학년에 추가` : (selectedStudentId ? '선택 학생에 추가' : '학생 선택 필요')}
              </span>
            </div>

            {/* 요일 칩 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600 w-16 shrink-0">제외 요일:</span>
              <div className="flex items-center gap-1.5">
                {WEEKDAY_ORDER.map(day => {
                  const isSelected = formDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`w-9 h-9 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-xs scale-105'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-violet-300'
                      }`}
                    >
                      {WEEKDAY_KO_MAP[day]}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-bold text-violet-700 ml-2">
                ({formDays.map(d => WEEKDAY_KO_MAP[d]).join(', ') || '요일을 선택해주세요'})
              </span>
            </div>

            {/* 시간대 선택 & 제목 */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-16 shrink-0">제외 시간:</span>
              
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                <Clock size={14} className="text-slate-400" />
                <input
                  type="time"
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="time"
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
                />
              </div>

              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="수업명 또는 메모 (예: 정규 단과 수업)"
                className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />

              <button
                type="button"
                onClick={handleAddRule}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-violet-200 shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-98"
              >
                <Plus size={14} />
                <span>규칙 추가</span>
              </button>
            </div>
          </div>

          {/* 현재 등록된 규칙 카드 목록 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800">
                {activeTab === 'grade' 
                  ? `[${selectedGrade}] 학년에 등록된 수업 제외 규칙 (${activeRulesList.length}건)`
                  : `선택 학생의 개별 예외 규칙 (${activeRulesList.length}건)`}
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                이 시간대에는 실시간 감시는 계속되나 가정 학습 통계는 저장되지 않습니다.
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={24} className="animate-spin text-violet-600" />
                <span className="text-xs font-bold">규칙을 불러오는 중...</span>
              </div>
            ) : activeRulesList.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
                등록된 제외 규칙이 없습니다. 위에서 요일과 시간대를 설정하고 [+ 규칙 추가]를 눌러주세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeRulesList.map(rule => (
                  <div
                    key={rule.id}
                    className="p-3.5 bg-white border border-slate-200 hover:border-violet-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-black text-xs shrink-0">
                        🚫
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-slate-800 truncate">{rule.title}</span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            기록 제외
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                          매주 <strong className="text-slate-800">{rule.days.map(d => WEEKDAY_KO_MAP[d]).join(', ')}</strong> | {rule.start_time} ~ {rule.end_time}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all shrink-0 cursor-pointer"
                      title="규칙 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 부하 제로 & 2-Track 원리 안내 콜아웃 */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-950 font-medium">
            <Info size={17} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-emerald-900 font-black">2-Track 스마트 필터 작동 안내:</strong>
              <p className="text-[11px] text-emerald-800/90 leading-relaxed">
                위 제외 시간대 동안에도 <strong>선생님의 [실시간 모니터링 센터] 화면에는 학생의 상태가 100% 정상 중계</strong>됩니다. 
                단지 <strong>가정 학습 누적 통계 DB에서만 학원 수업 시간을 안전하게 걸러내어</strong>, 순수하게 집이나 독서실에서 혼자 공부한 시간만 투명하게 기록됩니다.
              </p>
            </div>
          </div>

        </div>

        {/* 4. 모달 하단 액션 툴바 */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 font-bold">
            ✓ 설정을 저장하면 학생 태블릿 앱에 실시간으로 규칙이 자동 배포됩니다.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-black text-xs transition-all shadow-md shadow-violet-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>규칙 저장 중...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>💾 설정 저장 및 전체 적용</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
