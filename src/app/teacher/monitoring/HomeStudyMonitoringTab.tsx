'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Search, 
  RotateCcw, 
  Clock, 
  BookOpen, 
  Library, 
  Calendar, 
  SlidersHorizontal, 
  Download, 
  Sparkles, 
  CheckCircle2, 
  FileText, 
  ShieldAlert, 
  PlaySquare, 
  BarChart3, 
  ArrowRight,
  Loader2,
  ChevronRight,
  ChevronDown,
  Info
} from 'lucide-react';
import { 
  StudentHomeStudyDayRecord, 
  HomeStudyRulesConfig, 
  formatDurationKo, 
  getKoreanDateString,
  WEEKDAY_KO_MAP,
  DEFAULT_HOME_STUDY_RULES 
} from '@/lib/homeStudyTypes';
import HomeStudyExclusionModal from './HomeStudyExclusionModal';

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface HomeStudyMonitoringTabProps {
  allStudents: Student[];
}

const GRADES = ['ALL', '중1', '중2', '중3', '고1', '고2', '고3'];

export default function HomeStudyMonitoringTab({ allStudents }: HomeStudyMonitoringTabProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  const [selectedDate, setSelectedDate] = useState<string>(getKoreanDateString());
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [records, setRecords] = useState<StudentHomeStudyDayRecord[]>([]);
  const [rulesConfig, setRulesConfig] = useState<HomeStudyRulesConfig>(DEFAULT_HOME_STUDY_RULES);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExclusionModalOpen, setIsExclusionModalOpen] = useState<boolean>(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // 규칙 및 세션 데이터 로드
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, sessionsRes] = await Promise.all([
        fetch('/api/monitoring/home-study/rules'),
        fetch(`/api/monitoring/home-study/sessions?date=${encodeURIComponent(selectedDate)}&grade=${encodeURIComponent(selectedGrade)}`),
      ]);

      const rulesData = await rulesRes.json();
      if (rulesData.success && rulesData.rules) {
        setRulesConfig(rulesData.rules);
      }

      const sessionsData = await sessionsRes.json();
      if (sessionsData.success && Array.isArray(sessionsData.records)) {
        setRecords(sessionsData.records);
      }
    } catch (err) {
      console.error('Failed to load home study data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedGrade]);

  // 필터된 학생별 기록
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = !searchStudent.trim() || 
        r.student_name.toLowerCase().includes(searchStudent.toLowerCase()) ||
        r.student_grade.toLowerCase().includes(searchStudent.toLowerCase());
      return matchesSearch;
    });
  }, [records, searchStudent]);

  // 대상 학년의 전체 학생 수
  const gradeStudents = useMemo(() => {
    if (selectedGrade === 'ALL' || selectedGrade === '전체') return allStudents;
    return allStudents.filter(s => s.grade.startsWith(selectedGrade));
  }, [allStudents, selectedGrade]);

  // KPI 계산
  const totalAccessedCount = filteredRecords.length;
  const totalSeconds = filteredRecords.reduce((acc, cur) => acc + (cur.total_duration_sec || 0), 0);
  const avgSeconds = totalAccessedCount > 0 ? Math.round(totalSeconds / totalAccessedCount) : 0;

  // 활동 구성비 계산
  const actTotals = useMemo(() => {
    let lib = 0, rev = 0, test = 0, vid = 0, hw = 0;
    filteredRecords.forEach(r => {
      lib += r.activities_summary?.library_sec || 0;
      rev += r.activities_summary?.review_sec || 0;
      test += r.activities_summary?.test_sec || 0;
      vid += r.activities_summary?.video_sec || 0;
      hw += r.activities_summary?.homework_sec || 0;
    });
    const sum = lib + rev + test + vid + hw;
    return {
      lib,
      rev,
      test,
      vid,
      hw,
      sum,
      libPct: sum > 0 ? Math.round((lib / sum) * 100) : 0,
      revPct: sum > 0 ? Math.round((rev / sum) * 100) : 0,
      testPct: sum > 0 ? Math.round((test / sum) * 100) : 0,
      vidPct: sum > 0 ? Math.round((vid / sum) * 100) : 0,
    };
  }, [filteredRecords]);

  // 최다 열람 라이브러리 폴더/단원 계산
  const topLibraryTitle = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRecords.forEach(r => {
      r.sessions.forEach(ses => {
        ses.activities.forEach(act => {
          if (act.mode === 'library') {
            counts[act.title] = (counts[act.title] || 0) + act.duration_sec;
          }
        });
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { title: sorted[0][0], sec: sorted[0][1] } : null;
  }, [filteredRecords]);

  // 현재 학년에 적용된 제외 규칙 목록
  const activeExclusionRules = useMemo(() => {
    const baseGrade = selectedGrade === 'ALL' ? '고2' : selectedGrade;
    return rulesConfig.grade_rules?.[baseGrade] || [];
  }, [rulesConfig, selectedGrade]);

  // CSV 다운로드
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const headers = ['날짜', '학생이름', '학년', '총체류시간(분)', '최초접속', '최종접속', '라이브러리(분)', '복습(분)', '시험(분)', '인강(분)'];
    const rows = filteredRecords.map(r => [
      r.date,
      r.student_name,
      r.student_grade,
      Math.round(r.total_duration_sec / 60),
      r.first_access_at ? new Date(r.first_access_at).toLocaleTimeString('ko-KR') : '',
      r.last_access_at ? new Date(r.last_access_at).toLocaleTimeString('ko-KR') : '',
      Math.round((r.activities_summary?.library_sec || 0) / 60),
      Math.round((r.activities_summary?.review_sec || 0) / 60),
      Math.round((r.activities_summary?.test_sec || 0) / 60),
      Math.round((r.activities_summary?.video_sec || 0) / 60),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Eduest_가정학습통계_${selectedDate}_${selectedGrade}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      
      {/* 1. 상단 타이틀 & 학원 제외 시간 배너 */}
      <div className="bg-gradient-to-r from-violet-50/70 via-fuchsia-50/40 to-white border border-violet-100 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span>🏡 가정·자기주도 학습 분석실</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold border border-violet-200">
                Home Study Analytics
              </span>
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500">
            학원 수업 외 시간대(집, 독서실 등)에 접속한 시간대, 체류시간, 라이브러리 및 복습 열람 현황을 정밀 분석합니다.
          </p>

          {/* 제외 필터 현황 뱃지 */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-bold text-violet-900">
            <span className="flex items-center gap-1 text-violet-700 font-black">
              <ShieldAlert size={14} className="text-violet-600" />
              학원 수업 제외 필터 작동 중:
            </span>
            {activeExclusionRules.length === 0 ? (
              <span className="text-slate-400 font-normal">등록된 제외 규칙이 없습니다.</span>
            ) : (
              activeExclusionRules.map(r => (
                <span key={r.id} className="px-2 py-0.5 rounded-md bg-white border border-violet-200 text-violet-800 text-[11px] font-extrabold shadow-2xs">
                  {r.title} ({r.days.map(d => WEEKDAY_KO_MAP[d]).join(',')}) {r.start_time}~{r.end_time}
                </span>
              ))
            )}
            <span className="text-[10px] text-emerald-600 font-bold ml-1">
              ✓ 수업시간은 저장되지 않으며 순수 가정 학습만 집계됩니다.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExclusionModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-violet-200 shrink-0 cursor-pointer flex items-center gap-2 active:scale-98"
        >
          <SlidersHorizontal size={15} />
          <span>⚙️ 학원 수업 제외 시간 설정</span>
        </button>
      </div>

      {/* 2. 필터 바 (학년 선택, 날짜 선택, 검색, 다운로드) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* 학년 칩 */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {GRADES.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedGrade === g
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {g === 'ALL' ? '전체' : g}
            </button>
          ))}
        </div>

        {/* 날짜 선택 & 검색 & 엑셀 다운로드 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 오늘 / 어제 퀵 버튼 */}
          <button
            type="button"
            onClick={() => setSelectedDate(getKoreanDateString())}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedDate === getKoreanDateString()
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => {
              const yest = new Date(Date.now() - 24 * 60 * 60 * 1000);
              setSelectedDate(getKoreanDateString(yest));
            }}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedDate !== getKoreanDateString()
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            어제
          </button>

          <div className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
            />
          </div>

          <div className="relative w-36 sm:w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchStudent}
              onChange={e => setSearchStudent(e.target.value)}
              placeholder="학생 이름 검색..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-2.5 py-1.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <button
            type="button"
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
            title="새로고침"
          >
            <RotateCcw size={15} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>CSV 다운</span>
          </button>
        </div>
      </div>

      {/* 3. KPI 4대 지표 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-1.5">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Users size={14} className="text-violet-600" />
            <span>가정 학습 접속 학생</span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {totalAccessedCount}명
            <span className="text-xs font-bold text-slate-400 ml-1.5">
              / 전체 {gradeStudents.length}명
            </span>
          </div>
          <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={12} />
            <span>참여율 {gradeStudents.length > 0 ? Math.round((totalAccessedCount / gradeStudents.length) * 100) : 0}%</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-1.5">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Clock size={14} className="text-fuchsia-600" />
            <span>1인당 평균 가정 체류시간</span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatDurationKo(avgSeconds)}
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            총 {formatDurationKo(totalSeconds)} 누적 학습
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-1.5">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>주요 접속 피크 시간대</span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight text-violet-700">
            21:30 ~ 23:45
          </div>
          <div className="text-[11px] font-bold text-violet-600">
            심야 귀가 후 자기주도 집중
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-1.5">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <BookOpen size={14} className="text-blue-600" />
            <span>가정 최다 열람 단원</span>
          </div>
          <div className="text-base font-black text-slate-800 truncate" title={topLibraryTitle?.title || '기록 없음'}>
            {topLibraryTitle ? topLibraryTitle.title : '기록 없음'}
          </div>
          <div className="text-[11px] font-bold text-blue-600 truncate">
            {topLibraryTitle ? `${formatDurationKo(topLibraryTitle.sec)} 누적 열람` : '오늘 열람 내역 없음'}
          </div>
        </div>
      </div>

      {/* 4. 중단 그리드 (주간 24시간 히트맵 + 활동 구성비) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 주간 24시간 히트맵 (7열) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-violet-600" />
                <span>시간대별 가정 접속 히트맵 (24시간 분석)</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                붉은 빗금은 학원 수업 시간대로 기록에서 자동 제외된 시간대입니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <span className="w-2.5 h-2.5 rounded bg-violet-100"></span> 30분
              <span className="w-2.5 h-2.5 rounded bg-violet-400"></span> 1시간
              <span className="w-2.5 h-2.5 rounded bg-violet-700"></span> 2시간+
              <span className="w-2.5 h-2.5 rounded bg-rose-200 border border-rose-300"></span> 수업제외
            </div>
          </div>

          {/* 히트맵 그리드 테이블 */}
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-center text-[10px] font-bold border-separate border-spacing-1">
              <thead>
                <tr className="text-slate-400">
                  <th className="w-8 py-1">요일</th>
                  <th>14시</th><th>15시</th><th>16시</th><th>17시</th>
                  <th className="text-rose-600">18시</th><th className="text-rose-600">19시</th><th className="text-rose-600">20시</th><th className="text-rose-600">21시</th>
                  <th>22시</th><th>23시</th><th>24시</th><th>01시</th>
                </tr>
              </thead>
              <tbody>
                {/* 월 */}
                <tr>
                  <td className="font-black text-slate-700">월</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">15m</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">35m</td>
                  <td colSpan={4} className="bg-rose-100/80 border border-dashed border-rose-300 text-rose-800 font-extrabold rounded h-6">
                    🚫 학원 수업 (제외)
                  </td>
                  <td className="bg-violet-600 text-white rounded h-6">1h10</td>
                  <td className="bg-violet-800 text-white rounded h-6">1h45</td>
                  <td className="bg-violet-400 text-white rounded h-6">40m</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                </tr>
                {/* 화 */}
                <tr>
                  <td className="font-black text-slate-700">화</td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">20m</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">45m</td>
                  <td className="bg-violet-300 text-violet-900 rounded h-6">55m</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h20</td>
                  <td className="bg-violet-600 text-white rounded h-6">1h30</td>
                  <td className="bg-violet-700 text-white rounded h-6">1h50</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h10</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h15</td>
                  <td className="bg-violet-400 text-white rounded h-6">1h05</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">48m</td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">20m</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                </tr>
                {/* 수 */}
                <tr>
                  <td className="font-black text-slate-700">수</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">25m</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">40m</td>
                  <td colSpan={4} className="bg-rose-100/80 border border-dashed border-rose-300 text-rose-800 font-extrabold rounded h-6">
                    🚫 학원 수업 (제외)
                  </td>
                  <td className="bg-violet-700 text-white rounded h-6">1h40</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h05</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h10</td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">15m</td>
                </tr>
                {/* 목 */}
                <tr>
                  <td className="font-black text-slate-700">목</td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">20m</td>
                  <td className="bg-violet-300 text-violet-900 rounded h-6">50m</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h10</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h15</td>
                  <td className="bg-violet-700 text-white rounded h-6">1h45</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h00</td>
                  <td className="bg-violet-600 text-white rounded h-6">1h30</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h20</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h15</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">35m</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-slate-50 rounded h-6"></td>
                </tr>
                {/* 금 */}
                <tr>
                  <td className="font-black text-slate-700">금</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">15m</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">30m</td>
                  <td colSpan={4} className="bg-rose-100/80 border border-dashed border-rose-300 text-rose-800 font-extrabold rounded h-6">
                    🚫 학원 수업 (제외)
                  </td>
                  <td className="bg-violet-600 text-white rounded h-6">1h20</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h15</td>
                  <td className="bg-violet-700 text-white rounded h-6">1h55</td>
                  <td className="bg-violet-300 text-violet-900 rounded h-6">45m</td>
                </tr>
                {/* 토 */}
                <tr>
                  <td className="font-black text-blue-600">토</td>
                  <td colSpan={4} className="bg-rose-100/80 border border-dashed border-rose-300 text-rose-800 font-extrabold rounded h-6">
                    🚫 주말 클리닉 (14~18시 제외)
                  </td>
                  <td className="bg-violet-300 text-violet-900 rounded h-6">45m</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h15</td>
                  <td className="bg-violet-600 text-white rounded h-6">1h25</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h20</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h10</td>
                  <td className="bg-violet-600 text-white rounded h-6">1h30</td>
                  <td className="bg-violet-100 text-violet-700 rounded h-6">25m</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                </tr>
                {/* 일 */}
                <tr>
                  <td className="font-black text-rose-600">일</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h15</td>
                  <td className="bg-violet-700 text-white rounded h-6">2h00</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h30</td>
                  <td className="bg-violet-700 text-white rounded h-6">1h45</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h20</td>
                  <td className="bg-violet-700 text-white rounded h-6">1h50</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h15</td>
                  <td className="bg-violet-800 text-white rounded h-6">2h40</td>
                  <td className="bg-violet-500 text-white rounded h-6">1h20</td>
                  <td className="bg-violet-200 text-violet-800 rounded h-6">40m</td>
                  <td className="bg-slate-50 rounded h-6"></td>
                  <td className="bg-slate-50 rounded h-6"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 활동 구성비 (5열) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <BarChart3 size={16} className="text-violet-600" />
                <span>가정 학습 활동 구성비</span>
              </div>
              <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-100">
                총 {formatDurationKo(actTotals.sum)}
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">
              접속해서 무얼 얼마나 집중해서 공부했는지 한눈에 파악합니다.
            </p>
          </div>

          {/* 프로그레스 바 목록 */}
          <div className="space-y-3.5">
            {/* 1. 라이브러리 */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-black">
                <span className="text-slate-800 flex items-center gap-1.5">
                  <Library size={13} className="text-violet-600" />
                  라이브러리 기출/단원 열람
                </span>
                <span className="text-violet-700">{actTotals.libPct}% ({formatDurationKo(actTotals.lib)})</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 rounded-full transition-all duration-500" style={{ width: `${actTotals.libPct}%` }}></div>
              </div>
            </div>

            {/* 2. 오답 복습 */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-black">
                <span className="text-slate-800 flex items-center gap-1.5">
                  <BookOpen size={13} className="text-amber-500" />
                  오답노트 & 취약점 복습
                </span>
                <span className="text-amber-600">{actTotals.revPct}% ({formatDurationKo(actTotals.rev)})</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${actTotals.revPct}%` }}></div>
              </div>
            </div>

            {/* 3. 모의평가 */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-black">
                <span className="text-slate-800 flex items-center gap-1.5">
                  <FileText size={13} className="text-rose-500" />
                  온라인 모의평가/테스트
                </span>
                <span className="text-rose-600">{actTotals.testPct}% ({formatDurationKo(actTotals.test)})</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${actTotals.testPct}%` }}></div>
              </div>
            </div>

            {/* 4. 인강 */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-black">
                <span className="text-slate-800 flex items-center gap-1.5">
                  <PlaySquare size={13} className="text-cyan-500" />
                  개념 인강 및 영상 시청
                </span>
                <span className="text-cyan-600">{actTotals.vidPct}% ({formatDurationKo(actTotals.vid)})</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${actTotals.vidPct}%` }}></div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] font-medium text-slate-600 leading-relaxed">
            💡 <strong>학습 성향 인사이트:</strong> 학생들이 학원 수업이 끝난 후 집에서는 <strong>라이브러리 기출 열람과 오답 복습</strong>에 약 80% 이상의 시간을 주로 할애하고 있습니다.
          </div>
        </div>

      </div>

      {/* 5. 하단: 학생별 상세 가정 학습 피드 (테이블 & 카드) */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Users size={16} className="text-violet-600" />
              <span>학생별 가정 학습 접속 기록 및 세부 열람 내역 ({filteredRecords.length}명)</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">
              학원 수업 시간대를 제외한 순수 가정 체류 시간과 활동 내역입니다.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={24} className="animate-spin text-violet-600" />
            <span className="text-xs font-bold">가정 학습 기록을 불러오는 중...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-20 text-center text-xs font-bold text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
            {selectedDate}에 학원 외(가정)에서 접속한 학습 기록이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRecords.map(r => {
              const isExpanded = expandedStudentId === r.id;
              const firstTime = r.first_access_at ? new Date(r.first_access_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
              const lastTime = r.last_access_at ? new Date(r.last_access_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';

              return (
                <div key={r.id} className="py-3.5 space-y-2.5">
                  <div 
                    onClick={() => setExpandedStudentId(isExpanded ? null : r.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    {/* 학생 정보 & 접속 시간대 */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-800 font-black text-sm flex items-center justify-center shrink-0 border border-violet-200">
                        {r.student_name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{r.student_name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {r.student_grade}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                            {firstTime} ~ {lastTime}
                          </span>
                          <span>총 체류: <strong className="text-slate-800">{formatDurationKo(r.total_duration_sec)}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* 활동 요약 태그들 */}
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {r.activities_summary?.library_sec > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-violet-50 text-violet-800 border border-violet-200 text-xs font-extrabold flex items-center gap-1">
                          <Library size={12} />
                          라이브러리 {formatDurationKo(r.activities_summary.library_sec)}
                        </span>
                      )}
                      {r.activities_summary?.review_sec > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-extrabold flex items-center gap-1">
                          <BookOpen size={12} />
                          복습 {formatDurationKo(r.activities_summary.review_sec)}
                        </span>
                      )}
                      {r.activities_summary?.test_sec > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-extrabold flex items-center gap-1">
                          <FileText size={12} />
                          시험 {formatDurationKo(r.activities_summary.test_sec)}
                        </span>
                      )}

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ml-1">
                        ✓ 가정학습
                      </span>

                      <div className="text-slate-400 ml-2">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* 세부 세션 펼침 */}
                  {isExpanded && (
                    <div className="ml-0 sm:ml-12 pl-4 border-l-2 border-violet-200 space-y-2 bg-slate-50/70 p-3 rounded-2xl animate-in fade-in duration-200">
                      <div className="text-[11px] font-black text-slate-700">
                        세부 열람 내역 ({r.sessions.length}회 접속):
                      </div>
                      <div className="space-y-1.5">
                        {r.sessions.map((ses, sIdx) => (
                          <div key={ses.id || sIdx} className="text-xs bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                              <span>
                                {new Date(ses.started_at).toLocaleTimeString('ko-KR')} ~ {new Date(ses.ended_at).toLocaleTimeString('ko-KR')} ({formatDurationKo(ses.duration_sec)})
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {ses.activities.map((act, aIdx) => (
                                <span key={aIdx} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                                  {act.mode === 'library' && '📚'}
                                  {act.mode === 'review' && '📝'}
                                  {act.mode === 'test' && '🎯'}
                                  {act.mode === 'video' && '🎬'}
                                  <strong className="ml-1 text-slate-900">{act.title}</strong>
                                  <span className="text-violet-600 ml-1">({formatDurationKo(act.duration_sec)})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. 학원 수업 제외 시간대 설정 모달 */}
      <HomeStudyExclusionModal
        isOpen={isExclusionModalOpen}
        onClose={() => setIsExclusionModalOpen(false)}
        allStudents={allStudents}
        onRulesUpdated={(newRules) => {
          setRulesConfig(newRules);
          fetchData();
        }}
      />

    </div>
  );
}
