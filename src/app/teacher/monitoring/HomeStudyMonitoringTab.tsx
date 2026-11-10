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
  Info,
  Flame,
  Trophy,
  Award,
  TrendingUp,
  Layers,
  X,
  Printer
} from 'lucide-react';
import { 
  StudentHomeStudyDayRecord,
  HomeStudySessionItem, 
  HomeStudyRulesConfig, 
  ExclusionRule,
  WeekdayCode,
  formatDurationKo, 
  getKoreanDateString,
  getKoreanDayOfWeek,
  WEEKDAY_KO_MAP,
  WEEKDAY_ORDER,
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
const HEATMAP_HOURS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1];
const WEEKDAY_KEYS: WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const COMPARISON_HOURS = [18, 19, 20, 21, 22, 23, 24];

function getExclusionForSlot(
  weekday: WeekdayCode,
  hour: number,
  grade: string,
  rulesConfig: HomeStudyRulesConfig
): ExclusionRule | null {
  if (!rulesConfig || !rulesConfig.grade_rules) return null;

  const rules = (grade === 'ALL' || grade === '전체')
    ? Object.values(rulesConfig.grade_rules).flat()
    : (rulesConfig.grade_rules[grade] || []);

  const rawHour = hour === 24 ? 0 : hour;
  const slotStartMin = rawHour * 60;
  const slotEndMin = slotStartMin + 60;

  for (const rule of rules) {
    if (!rule.days || !rule.days.includes(weekday)) continue;
    const [sH, sM] = rule.start_time.split(':').map(Number);
    const [eH, eM] = rule.end_time.split(':').map(Number);
    const ruleStartMin = sH * 60 + sM;
    const ruleEndMin = eH * 60 + eM;

    if (Math.max(slotStartMin, ruleStartMin) < Math.min(slotEndMin, ruleEndMin)) {
      return rule;
    }
  }
  return null;
}

interface ExcludedSlot {
  type: 'excluded';
  rule: ExclusionRule;
  colSpan: number;
  startHour: number;
}

interface DataSlot {
  type: 'data';
  hour: number;
  totalSec: number;
  studentCount: number;
  studentNames: string[];
}

type RowSlot = ExcludedSlot | DataSlot;

function buildRowSlots(
  weekday: WeekdayCode,
  hours: number[],
  grade: string,
  rulesConfig: HomeStudyRulesConfig,
  gridData: Record<WeekdayCode, Record<number, { totalSec: number; students: Map<string, number> }>>
): RowSlot[] {
  const slots: RowSlot[] = [];
  let i = 0;
  while (i < hours.length) {
    const h = hours[i];
    const exc = getExclusionForSlot(weekday, h, grade, rulesConfig);
    if (exc) {
      let count = 1;
      while (
        i + count < hours.length &&
        getExclusionForSlot(weekday, hours[i + count], grade, rulesConfig)?.id === exc.id
      ) {
        count++;
      }
      slots.push({ type: 'excluded', rule: exc, colSpan: count, startHour: h });
      i += count;
    } else {
      const data = gridData[weekday]?.[h] || { totalSec: 0, students: new Map() };
      slots.push({
        type: 'data',
        hour: h,
        totalSec: data.totalSec,
        studentCount: data.students.size,
        studentNames: Array.from(data.students.keys()),
      });
      i++;
    }
  }
  return slots;
}

const GRADE_COLOR_THEME: Record<string, {
  bg: string;
  fill: string;
  border: string;
  text: string;
  badge: string;
}> = {
  '고1': {
    bg: 'bg-blue-50',
    fill: 'bg-gradient-to-r from-blue-400 to-blue-600',
    border: 'border-blue-400',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
  },
  '고2': {
    bg: 'bg-violet-50',
    fill: 'bg-gradient-to-r from-violet-400 to-violet-600',
    border: 'border-violet-400',
    text: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-800',
  },
  '고3': {
    bg: 'bg-orange-50',
    fill: 'bg-gradient-to-r from-orange-400 to-orange-600',
    border: 'border-orange-400',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-800',
  },
  '중3': {
    bg: 'bg-emerald-50',
    fill: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
    border: 'border-emerald-400',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  '중2': {
    bg: 'bg-cyan-50',
    fill: 'bg-gradient-to-r from-cyan-400 to-cyan-600',
    border: 'border-cyan-400',
    text: 'text-cyan-700',
    badge: 'bg-cyan-100 text-cyan-800',
  },
  '중1': {
    bg: 'bg-rose-50',
    fill: 'bg-gradient-to-r from-rose-400 to-rose-600',
    border: 'border-rose-400',
    text: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-800',
  },
};

// 세션별 학원 수업 시간대 칼차감 헬퍼 함수
function computeClippedRecord(
  record: StudentHomeStudyDayRecord,
  rulesConfig: HomeStudyRulesConfig
) {
  let pureSec = 0;
  let excludedSec = 0;

  const sessions = record.sessions || [];
  if (sessions.length === 0) {
    return { pureSec: record.total_duration_sec || 0, excludedSec: 0 };
  }

  sessions.forEach(ses => {
    if (!ses.started_at) {
      pureSec += ses.duration_sec || 0;
      return;
    }
    const d = new Date(ses.started_at);
    const kstDate = new Date(d.getTime() + 9 * 3600000);
    const dayIdx = kstDate.getUTCDay();
    const dayCodes: WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const mapDay: WeekdayCode = dayCodes[dayIdx];
    const rawHour = kstDate.getUTCHours();
    const mappedHour = rawHour === 0 ? 24 : rawHour;

    const exc = getExclusionForSlot(mapDay, mappedHour, record.student_grade, rulesConfig);
    if (exc) {
      // 학원 수업 시간표와 겹친 세션 -> 차감!
      excludedSec += ses.duration_sec || 0;
    } else {
      // 순수 가정 학습 세션!
      pureSec += ses.duration_sec || 0;
    }
  });

  return { pureSec, excludedSec };
}

export default function HomeStudyMonitoringTab({ allStudents }: HomeStudyMonitoringTabProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  const todayStr = getKoreanDateString();
  const [rangePreset, setRangePreset] = useState<'today' | '7days' | '14days' | '30days' | 'custom'>('7days');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return getKoreanDateString(d);
  });
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [searchStudent, setSearchStudent] = useState<string>('');
  
  // 전체 세션 레코드 (최근 30일치 전체를 로드하여 즉시 메모리 계산)
  const [weeklyRecords, setWeeklyRecords] = useState<StudentHomeStudyDayRecord[]>([]);
  const [rulesConfig, setRulesConfig] = useState<HomeStudyRulesConfig>(DEFAULT_HOME_STUDY_RULES);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExclusionModalOpen, setIsExclusionModalOpen] = useState<boolean>(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // 특정 학생 1인 맞춤 심층 분석 팝업 상태 & 동일 학년 평균 비교 ON/OFF 토글
  const [selectedStudentDeepDive, setSelectedStudentDeepDive] = useState<string | null>(null);
  const [showGradeAvgComparison, setShowGradeAvgComparison] = useState<boolean>(true);

  // 히트맵 뷰 모드 ('duration': 체류시간, 'headcount': 접속 인원수)
  const [heatmapView, setHeatmapView] = useState<'duration' | 'headcount'>('duration');

  // 클릭한 히트맵 슬롯 상세 팝업 상태
  const [activeSlotModal, setActiveSlotModal] = useState<{
    weekday: WeekdayCode;
    weekdayKo: string;
    hour: number;
    hourLabel: string;
    isExcluded: boolean;
    exclusionRule?: ExclusionRule;
    totalSec: number;
    students: {
      student_name: string;
      student_grade: string;
      duration_sec: number;
      started_at?: string;
      activities: {
        mode: string;
        title: string;
        duration_sec: number;
      }[];
    }[];
  } | null>(null);

  // 다중 학년 비교 상태
  const [comparisonGrades, setComparisonGrades] = useState<string[]>(['고1', '고2', '고3']);
  const [comparisonView, setComparisonView] = useState<'ranking' | 'sideBySide'>('ranking');

  // 빠른 기간 프리셋 핸들러
  const handlePresetChange = (preset: 'today' | '7days' | '14days' | '30days') => {
    setRangePreset(preset);
    const today = getKoreanDateString();
    setEndDate(today);
    const d = new Date();
    if (preset === 'today') {
      setStartDate(today);
    } else if (preset === '7days') {
      d.setDate(d.getDate() - 6);
      setStartDate(getKoreanDateString(d));
    } else if (preset === '14days') {
      d.setDate(d.getDate() - 13);
      setStartDate(getKoreanDateString(d));
    } else if (preset === '30days') {
      d.setDate(d.getDate() - 29);
      setStartDate(getKoreanDateString(d));
    }
  };

  // 규칙 및 세션 데이터 로드 (최대 30일치 로드하여 프론트 즉시 반응)
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, sessionsRes] = await Promise.all([
        fetch('/api/monitoring/home-study/rules'),
        fetch('/api/monitoring/home-study/sessions?days=30'),
      ]);

      const rulesData = await rulesRes.json();
      if (rulesData.success && rulesData.rules) {
        setRulesConfig(rulesData.rules);
      }

      const sessionsData = await sessionsRes.json();
      if (sessionsData.success && Array.isArray(sessionsData.records)) {
        setWeeklyRecords(sessionsData.records);
      }
    } catch (err) {
      console.error('Failed to load home study data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 선택된 날짜 범위와 학년에 해당하는 레코드 (수업 제외 세션 칼차감 반영)
  const records = useMemo(() => {
    return weeklyRecords
      .filter(r => {
        const matchesDate = (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate);
        const matchesGrade = selectedGrade === 'ALL' || selectedGrade === '전체' || (r.student_grade && r.student_grade.startsWith(selectedGrade));
        return matchesDate && matchesGrade;
      })
      .map(r => {
        const { pureSec, excludedSec } = computeClippedRecord(r, rulesConfig);
        return {
          ...r,
          pure_sec: pureSec,
          excluded_sec: excludedSec,
        };
      });
  }, [weeklyRecords, startDate, endDate, selectedGrade, rulesConfig]);

  // 대상 학년의 전체 학생 수
  const gradeStudents = useMemo(() => {
    if (selectedGrade === 'ALL' || selectedGrade === '전체') return allStudents;
    return allStudents.filter(s => s.grade.startsWith(selectedGrade));
  }, [allStudents, selectedGrade]);

  // 기간별 학생 집계 목록 (학생 1인당 단일 카드 집계)
  const studentAggregatedList = useMemo(() => {
    const map: Record<string, {
      student_id: string;
      student_name: string;
      student_grade: string;
      pure_sec: number;
      excluded_sec: number;
      total_duration_sec: number;
      session_count: number;
      days_count: number;
      first_access_at: string;
      last_access_at: string;
      activities_summary: {
        library_sec: number;
        review_sec: number;
        test_sec: number;
        video_sec: number;
        homework_sec: number;
        other_sec: number;
      };
      all_sessions: {
        id?: string;
        started_at: string;
        ended_at: string;
        duration_sec: number;
        activities: {
          mode: string;
          title: string;
          duration_sec: number;
          sub_detail?: string;
        }[];
      }[];
    }> = {};

    records.forEach(r => {
      if (!map[r.student_id]) {
        map[r.student_id] = {
          student_id: r.student_id,
          student_name: r.student_name,
          student_grade: r.student_grade,
          pure_sec: 0,
          excluded_sec: 0,
          total_duration_sec: 0,
          session_count: 0,
          days_count: 0,
          first_access_at: r.first_access_at,
          last_access_at: r.last_access_at,
          activities_summary: {
            library_sec: 0,
            review_sec: 0,
            test_sec: 0,
            video_sec: 0,
            homework_sec: 0,
            other_sec: 0,
          },
          all_sessions: [],
        };
      }
      const item = map[r.student_id];
      item.pure_sec += r.pure_sec;
      item.excluded_sec += r.excluded_sec;
      item.total_duration_sec += r.total_duration_sec;
      item.days_count += 1;
      item.session_count += (r.sessions?.length || 0);

      if (!item.first_access_at || (r.first_access_at && r.first_access_at < item.first_access_at)) {
        item.first_access_at = r.first_access_at;
      }
      if (!item.last_access_at || (r.last_access_at && r.last_access_at > item.last_access_at)) {
        item.last_access_at = r.last_access_at;
      }

      if (r.activities_summary) {
        item.activities_summary.library_sec += r.activities_summary.library_sec || 0;
        item.activities_summary.review_sec += r.activities_summary.review_sec || 0;
        item.activities_summary.test_sec += r.activities_summary.test_sec || 0;
        item.activities_summary.video_sec += r.activities_summary.video_sec || 0;
        item.activities_summary.homework_sec += r.activities_summary.homework_sec || 0;
        item.activities_summary.other_sec += r.activities_summary.other_sec || 0;
      }

      if (r.sessions) {
        item.all_sessions.push(...r.sessions);
      }
    });

    return Object.values(map).sort((a, b) => b.pure_sec - a.pure_sec);
  }, [records]);

  // 검색어 필터링된 학생 기록
  const filteredStudentList = useMemo(() => {
    if (!searchStudent.trim()) return studentAggregatedList;
    const q = searchStudent.toLowerCase();
    return studentAggregatedList.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      s.student_grade.toLowerCase().includes(q)
    );
  }, [studentAggregatedList, searchStudent]);

  // 4대 핵심 KPI 계산 (학원 수업 칼차감 100% 반영)
  const totalAccessedCount = studentAggregatedList.length;
  const totalPureSeconds = records.reduce((acc, cur) => acc + (cur.pure_sec || 0), 0);
  const totalExcludedClassSeconds = records.reduce((acc, cur) => acc + (cur.excluded_sec || 0), 0);
  const avgSeconds = totalAccessedCount > 0 ? Math.round(totalPureSeconds / totalAccessedCount) : 0;

  // 활동 구성비 계산
  const actTotals = useMemo(() => {
    let lib = 0, rev = 0, test = 0, vid = 0, hw = 0;
    records.forEach(r => {
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
  }, [records]);

  // 기간 최다 열람 라이브러리 폴더/단원 계산
  const topLibraryTitle = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => {
      (r.sessions || []).forEach(ses => {
        (ses.activities || []).forEach(act => {
          if (act.mode === 'library') {
            counts[act.title] = (counts[act.title] || 0) + act.duration_sec;
          }
        });
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { title: sorted[0][0], sec: sorted[0][1] } : null;
  }, [records]);

  // 현재 학년에 적용된 제외 규칙 목록
  const activeExclusionRules = useMemo(() => {
    const baseGrade = selectedGrade === 'ALL' ? '고2' : selectedGrade;
    return rulesConfig.grade_rules?.[baseGrade] || [];
  }, [rulesConfig, selectedGrade]);

  // 특정 학생 맞춤 심층 분석 데이터 계산 (일별 바차트, 동일 학년 평균 대비, 시간대 분포, TOP 3 교재)
  const deepDiveData = useMemo(() => {
    if (!selectedStudentDeepDive) return null;

    const stInfo = allStudents.find(s => s.id === selectedStudentDeepDive) || 
      studentAggregatedList.find(s => s.student_id === selectedStudentDeepDive);
    const studentName = stInfo ? ('name' in stInfo ? stInfo.name : stInfo.student_name) : '학생';
    const studentGrade = stInfo ? ('grade' in stInfo ? stInfo.grade : stInfo.student_grade) : '고2';

    // 해당 학생의 레코드들
    const studentRecords = weeklyRecords.filter(r => r.student_id === selectedStudentDeepDive);
    
    // 동일 학년 전체 학생들의 레코드들
    const gradeRecords = weeklyRecords.filter(r => r.student_grade && r.student_grade.startsWith(studentGrade));

    // 선택된 기간의 일자 목록 생성 (최대 30일)
    const dateList: string[] = [];
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end && dateList.length <= 30) {
      dateList.push(getKoreanDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (dateList.length === 0) dateList.push(getKoreanDateString());

    let studentTotalPureSec = 0;
    let studentTotalExcludedSec = 0;
    let gradeTotalPureSec = 0;

    const activeGradeStudentCount = allStudents.filter(s => s.grade.startsWith(studentGrade)).length || 1;

    const dailyPoints = dateList.map(dt => {
      const sDayRec = studentRecords.find(r => r.date === dt);
      let sPure = 0;
      let sExc = 0;
      if (sDayRec) {
        const clipped = computeClippedRecord(sDayRec, rulesConfig);
        sPure = clipped.pureSec;
        sExc = clipped.excludedSec;
      }
      studentTotalPureSec += sPure;
      studentTotalExcludedSec += sExc;

      // 동일 학년 평균 계산
      const gDayRecs = gradeRecords.filter(r => r.date === dt);
      let gPureSum = 0;
      gDayRecs.forEach(r => {
        const clipped = computeClippedRecord(r, rulesConfig);
        gPureSum += clipped.pureSec;
      });
      const gAvg = Math.round(gPureSum / Math.max(activeGradeStudentCount, 1));
      gradeTotalPureSec += gAvg;

      const diffSec = sPure - gAvg;

      return {
        date: dt,
        label: dt.slice(5),
        studentSec: sPure,
        gradeAvgSec: gAvg,
        diffSec,
      };
    });

    const maxChartSec = Math.max(
      ...dailyPoints.map(p => Math.max(p.studentSec, p.gradeAvgSec)),
      3600
    );

    // 시간대별 활동 분포 (14시 ~ 01시)
    const hourlyDistribution: { hour: number; hourLabel: string; sec: number; isClass: boolean }[] = [];
    const studentAllSessions: HomeStudySessionItem[] = [];
    studentRecords.forEach(r => {
      if (r.sessions) studentAllSessions.push(...r.sessions);
    });

    HEATMAP_HOURS.forEach(h => {
      let hSec = 0;
      const targetRawHour = h === 24 ? 0 : h;
      studentAllSessions.forEach(ses => {
        if (!ses.started_at) return;
        const d = new Date(ses.started_at);
        const kstDate = new Date(d.getTime() + 9 * 3600000);
        if (kstDate.getUTCHours() === targetRawHour) {
          hSec += ses.duration_sec || 0;
        }
      });

      const isClass = activeExclusionRules.some(rule => {
        const sH = parseInt(rule.start_time.split(':')[0], 10);
        const eH = parseInt(rule.end_time.split(':')[0], 10);
        return h >= sH && h < eH;
      });

      hourlyDistribution.push({
        hour: h,
        hourLabel: h === 24 ? '24시' : `${h}시`,
        sec: hSec,
        isClass,
      });
    });

    const maxHourSec = Math.max(...hourlyDistribution.map(h => h.sec), 1800);

    // 최다 열람 라이브러리 교재 TOP 3
    const libCounts: Record<string, number> = {};
    studentAllSessions.forEach(ses => {
      ses.activities?.forEach(act => {
        if (act.mode === 'library') {
          libCounts[act.title] = (libCounts[act.title] || 0) + act.duration_sec;
        }
      });
    });
    const topMaterials = Object.entries(libCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([title, sec]) => ({ title, sec }));

    const netDiffTotal = studentTotalPureSec - gradeTotalPureSec;
    const isAboveAvg = netDiffTotal >= 0;
    const peakHourItem = [...hourlyDistribution].sort((a, b) => b.sec - a.sec)[0];
    const peakHourText = peakHourItem && peakHourItem.sec > 0 
      ? peakHourItem.hour >= 23 || peakHourItem.hour <= 1 ? '🌙 심야 몰입 열공형 (23시~01시)' : `⚡ 저녁 집중 열공형 (${peakHourItem.hourLabel})`
      : '🌱 학습 패턴 형성 중';

    return {
      studentId: selectedStudentDeepDive,
      studentName,
      studentGrade,
      startDate,
      endDate,
      studentTotalPureSec,
      studentTotalExcludedSec,
      gradeTotalPureSec,
      netDiffTotal,
      isAboveAvg,
      dailyPoints,
      maxChartSec,
      hourlyDistribution,
      maxHourSec,
      topMaterials,
      peakHourText,
    };
  }, [selectedStudentDeepDive, allStudents, weeklyRecords, startDate, endDate, rulesConfig, activeExclusionRules, studentAggregatedList]);

  // ==========================================
  // 히트맵 실시간 동적 데이터 집계 (주간 7일 x 12시간)
  // ==========================================
  const heatmapGridData = useMemo(() => {
    const grid: Record<WeekdayCode, Record<number, { totalSec: number; students: Map<string, number> }>> = {
      MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {}, SAT: {}, SUN: {}
    };

    WEEKDAY_KEYS.forEach(w => {
      HEATMAP_HOURS.forEach(h => {
        grid[w][h] = { totalSec: 0, students: new Map() };
      });
    });

    const targetRecords = selectedGrade === 'ALL' || selectedGrade === '전체'
      ? weeklyRecords.filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate))
      : weeklyRecords.filter(r => r.student_grade && r.student_grade.startsWith(selectedGrade) && (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));

    targetRecords.forEach(r => {
      (r.sessions || []).forEach(ses => {
        if (!ses.started_at) return;
        const d = new Date(ses.started_at);
        const kstDate = new Date(d.getTime() + 9 * 3600000);
        const dayIdx = kstDate.getUTCDay();
        const dayCodes: WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const mapDay: WeekdayCode = dayCodes[dayIdx];
        const rawHour = kstDate.getUTCHours();
        const mappedHour = rawHour === 0 ? 24 : rawHour;

        if (grid[mapDay] && grid[mapDay][mappedHour]) {
          grid[mapDay][mappedHour].totalSec += ses.duration_sec || 0;
          const prev = grid[mapDay][mappedHour].students.get(r.student_name) || 0;
          grid[mapDay][mappedHour].students.set(r.student_name, prev + (ses.duration_sec || 0));
        }
      });
    });

    return grid;
  }, [weeklyRecords, selectedGrade]);

  // 인원수 기준 골든타임 & 피크 분석 (학원 수업 제외 시간대는 100% 원천 배제)
  const headcountKpi = useMemo(() => {
    let maxHour = 22;
    let maxDay: WeekdayCode = 'MON';
    let maxCount = 0;
    let eveningTotalCount = 0;
    let eveningSlotCount = 0;
    let midnightCount = 0;

    WEEKDAY_KEYS.forEach(w => {
      HEATMAP_HOURS.forEach(h => {
        // 학원 수업 제외 시간대인지 확인하여 골든타임 후보 및 저녁 평균 집계에서 완전 제외!
        const exc = getExclusionForSlot(w, h, selectedGrade, rulesConfig);
        if (exc) {
          return;
        }

        const item = heatmapGridData[w]?.[h];
        const cnt = item?.students.size || 0;
        if (cnt > maxCount) {
          maxCount = cnt;
          maxHour = h;
          maxDay = w;
        }
        if (h >= 19 && h <= 24) {
          eveningTotalCount += cnt;
          eveningSlotCount++;
        }
        if (h === 24) {
          midnightCount += cnt;
        }
      });
    });

    const avgEvening = eveningSlotCount > 0 ? (eveningTotalCount / eveningSlotCount).toFixed(1) : '0';
    return {
      peakTimeText: maxCount > 0 ? `${WEEKDAY_KO_MAP[maxDay]}요일 ${maxHour === 24 ? '자정 (24시)' : `${maxHour}시`}` : '기록 없음',
      peakCount: maxCount,
      avgEvening,
      midnightCount,
    };
  }, [heatmapGridData, selectedGrade, rulesConfig]);

  // ==========================================
  // 다중 학년 시간대별 1·2·3등 랭킹 및 비교 데이터 계산
  // ==========================================
  const multiGradeRankingData = useMemo(() => {
    return COMPARISON_HOURS.map(h => {
      const targetRawHour = h === 24 ? 0 : h;

      const gradeResults = comparisonGrades.map(grade => {
        const gRecords = weeklyRecords.filter(r => r.student_grade && r.student_grade.startsWith(grade) && (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));
        const activeStudents = new Set<string>();
        let totalSec = 0;

        gRecords.forEach(r => {
          (r.sessions || []).forEach(ses => {
            if (!ses.started_at) return;
            const d = new Date(ses.started_at);
            const kstDate = new Date(d.getTime() + 9 * 3600000);
            if (kstDate.getUTCHours() === targetRawHour) {
              activeStudents.add(r.student_name);
              totalSec += ses.duration_sec || 0;
            }
          });
        });

        const todayDay = getKoreanDayOfWeek();
        const exc = getExclusionForSlot(todayDay, h, grade, rulesConfig);

        return {
          grade,
          count: activeStudents.size,
          students: Array.from(activeStudents),
          totalSec,
          isExcluded: !!exc,
          exclusionTitle: exc?.title || '',
        };
      });

      // 학원 수업으로 제외된 학년은 랭킹 맨 아래로 배치
      const sorted = [...gradeResults].sort((a, b) => {
        const aVal = a.isExcluded ? -1 : a.count;
        const bVal = b.isExcluded ? -1 : b.count;
        return bVal - aVal;
      });
      const nonExcludedCounts = gradeResults.filter(g => !g.isExcluded).map(g => g.count);
      const maxCount = Math.max(...nonExcludedCounts, 1);

      return {
        hour: h,
        hourLabel: h === 24 ? '24:00 (자정 심야)' : `${h}:00 (${h}시대)`,
        ranks: sorted,
        maxCount,
      };
    });
  }, [weeklyRecords, comparisonGrades, rulesConfig]);

  // 다중 비교 학년 토글 핸들러
  const toggleComparisonGrade = (g: string) => {
    setComparisonGrades(prev => {
      if (prev.includes(g)) {
        if (prev.length === 1) return prev; // 최소 1개 유지
        return prev.filter(item => item !== g);
      } else {
        return [...prev, g];
      }
    });
  };

  // 히트맵 셀 클릭 핸들러 (상세 학생 명단 및 열람 내역 조회 모달 오픈)
  const handleSlotClick = (weekday: WeekdayCode, hour: number, slot: RowSlot) => {
    if (slot.type === 'excluded') {
      setActiveSlotModal({
        weekday,
        weekdayKo: WEEKDAY_KO_MAP[weekday],
        hour: slot.startHour || hour,
        hourLabel: `${slot.rule.start_time.slice(0, 5)} ~ ${slot.rule.end_time.slice(0, 5)}`,
        isExcluded: true,
        exclusionRule: slot.rule,
        totalSec: 0,
        students: [],
      });
      return;
    }

    const targetRecords = selectedGrade === 'ALL' || selectedGrade === '전체'
      ? weeklyRecords.filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate))
      : weeklyRecords.filter(r => r.student_grade && r.student_grade.startsWith(selectedGrade) && (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));

    const matchedStudents: {
      student_name: string;
      student_grade: string;
      duration_sec: number;
      started_at?: string;
      activities: {
        mode: string;
        title: string;
        duration_sec: number;
      }[];
    }[] = [];
    let slotTotalSec = 0;

    targetRecords.forEach(r => {
      const studentHourSessions = (r.sessions || []).filter(ses => {
        if (!ses.started_at) return false;
        const d = new Date(ses.started_at);
        const kstDate = new Date(d.getTime() + 9 * 3600000);
        const dayIdx = kstDate.getUTCDay();
        const dayCodes: WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const mapDay: WeekdayCode = dayCodes[dayIdx];
        const rawHour = kstDate.getUTCHours();
        const mappedHour = rawHour === 0 ? 24 : rawHour;
        return mapDay === weekday && mappedHour === hour;
      });

      if (studentHourSessions.length > 0) {
        let dur = 0;
        const acts: { mode: string; title: string; duration_sec: number }[] = [];
        let firstStarted = studentHourSessions[0].started_at;

        studentHourSessions.forEach(s => {
          dur += s.duration_sec || 0;
          (s.activities || []).forEach(a => acts.push(a));
        });

        slotTotalSec += dur;
        matchedStudents.push({
          student_name: r.student_name,
          student_grade: r.student_grade || selectedGrade,
          duration_sec: dur,
          started_at: firstStarted,
          activities: acts,
        });
      }
    });

    matchedStudents.sort((a, b) => b.duration_sec - a.duration_sec);

    setActiveSlotModal({
      weekday,
      weekdayKo: WEEKDAY_KO_MAP[weekday],
      hour,
      hourLabel: hour === 24 ? '24:00 (자정 심야)' : `${hour}:00 ~ ${hour + 1}:00`,
      isExcluded: false,
      totalSec: slotTotalSec,
      students: matchedStudents,
    });
  };
  // CSV 다운로드 (수업 차감 및 기간 집계 반영)
  const handleExportCSV = () => {
    if (filteredStudentList.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const headers = ['학생이름', '학년', '순수가정체류(분)', '학원수업차감(분)', '학습일수(일)', '세션수(회)', '최초접속', '최종접속', '기출열람(분)', '복습(분)', '시험(분)', '인강(분)'];
    const rows = filteredStudentList.map(s => [
      s.student_name,
      s.student_grade,
      Math.round(s.pure_sec / 60),
      Math.round(s.excluded_sec / 60),
      s.days_count,
      s.session_count,
      s.first_access_at ? new Date(s.first_access_at).toLocaleTimeString('ko-KR') : '',
      s.last_access_at ? new Date(s.last_access_at).toLocaleTimeString('ko-KR') : '',
      Math.round((s.activities_summary?.library_sec || 0) / 60),
      Math.round((s.activities_summary?.review_sec || 0) / 60),
      Math.round((s.activities_summary?.test_sec || 0) / 60),
      Math.round((s.activities_summary?.video_sec || 0) / 60),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(',')).join('\n')];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Eduest_가정학습통계_${startDate}_${endDate}_${selectedGrade}.csv`);
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
            학원 정규 수업 시간표를 자동 제외하여, <strong>학생이 집이나 독서실에서 혼자 앱을 켜고 공부한 순수 시간</strong>만 정밀 집계합니다.
          </p>
        </div>

        {/* 학원 수업 제외 시간대 설정 버튼 */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsExclusionModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-black text-xs shadow-md shadow-violet-200 transition-all cursor-pointer active:scale-98"
          >
            <ShieldAlert size={16} />
            <span>학원 수업 제외 시간대 설정</span>
          </button>
        </div>
      </div>

      {/* 2. 필터 툴바 (학년 탭 + 날짜 + 검색 + CSV 다운로드) */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* 학년 탭 버튼 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-xs font-black text-slate-400 mr-1 shrink-0">학년:</span>
          {GRADES.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGrade(g)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition-all cursor-pointer shrink-0 ${
                selectedGrade === g
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-105'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* 날짜 선택 + 검색 + 액션 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 기간 프리셋 버튼 그룹 */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 gap-0.5">
            <button
              type="button"
              onClick={() => handlePresetChange('today')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                rangePreset === 'today' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('7days')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                rangePreset === '7days' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              최근 7일
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('14days')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                rangePreset === '14days' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              최근 14일
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('30days')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                rangePreset === '30days' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              최근 30일
            </button>
          </div>

          {/* 날짜 범위 인풋 */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200/80 text-xs font-bold text-slate-700">
            <Calendar size={14} className="text-violet-600 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setRangePreset('custom');
              }}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer w-28"
            />
            <span className="text-slate-400 font-bold">~</span>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setRangePreset('custom');
              }}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer w-28"
            />
          </div>

          {/* 학생 검색 인풋 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchStudent}
              onChange={e => setSearchStudent(e.target.value)}
              placeholder="학생 이름/학년 검색..."
              className="bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 w-36 sm:w-44"
            />
          </div>

          {/* 새로고침 */}
          <button
            type="button"
            onClick={fetchData}
            className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
            title="새로고침"
          >
            <RotateCcw size={15} />
          </button>

          {/* CSV 내보내기 */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-all cursor-pointer shadow-2xs"
          >
            <Download size={14} className="text-slate-500" />
            <span>CSV 저장</span>
          </button>
        </div>
      </div>

      {/* 3. 상단 핵심 KPI 요약 카드 4종 (수업 칼차감 정밀 반영) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 총 순수 가정 학습 시간 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <Clock size={16} className="text-violet-600" />
              {rangePreset === 'today' ? '오늘 총 순수 가정 체류' : '선택 기간 순수 가정 학습량'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-extrabold border border-rose-200">
              {totalExcludedClassSeconds > 0 ? `🚫 수업 ${formatDurationKo(totalExcludedClassSeconds)} 차감` : '수업 제외 반영'}
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {formatDurationKo(totalPureSeconds)}
          </div>
          <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
            <Sparkles size={12} />
            <span>학원 밖 순수 자기주도 학습량</span>
          </div>
        </div>

        {/* KPI 2: 접속 학생 수 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <Users size={16} className="text-blue-600" />
              가정 학습 참여 학생
            </span>
            <span className="text-[10px] font-extrabold text-slate-500">
              {gradeStudents.length}명 중
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight flex items-baseline gap-2">
            <span>{totalAccessedCount}명</span>
            <span className="text-xs text-slate-400 font-bold">
              ({gradeStudents.length > 0 ? Math.round((totalAccessedCount / gradeStudents.length) * 100) : 0}%)
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            {rangePreset === 'today' ? `대상 학년 (${selectedGrade === 'ALL' ? '전체' : selectedGrade}) 접속률` : `선택 기간 내 1회 이상 자율 학습`}
          </div>
        </div>

        {/* KPI 3: 1인당 평균 체류시간 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={16} className="text-fuchsia-600" />
              학생 1인당 평균 시간
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {formatDurationKo(avgSeconds)}
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            {rangePreset === 'today' ? '접속 학생 기준 1인당 일일 평균' : '참여 학생 기준 1인당 누적 평균'}
          </div>
        </div>

        {/* KPI 4: 최다 열람 단원/라이브러리 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <Library size={16} className="text-amber-500" />
              {rangePreset === 'today' ? '오늘 최다 열람 컨텐츠' : '기간 최다 열람 컨텐츠'}
            </span>
          </div>
          <div className="text-base font-black text-slate-800 truncate" title={topLibraryTitle?.title || ''}>
            {topLibraryTitle ? topLibraryTitle.title : '기록 없음'}
          </div>
          <div className="text-[11px] font-bold text-blue-600 truncate">
            {topLibraryTitle ? `${formatDurationKo(topLibraryTitle.sec)} 누적 열람` : '기간 내 열람 내역 없음'}
          </div>
        </div>
      </div>

      {/* 4. 중단 그리드 (동적 24시간 히트맵 + 활동 구성비) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 주간 24시간 실시간 동적 히트맵 (7열) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-violet-600" />
                <span>시간대별 가정 접속 히트맵 (실시간 연동)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold">
                  {selectedGrade === 'ALL' ? '전체 학년' : `${selectedGrade} 맞춤 시간표`}
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                선택한 학년의 수업 제외 시간표(붉은 빗금)가 즉시 자동 반영됩니다.
              </p>
            </div>

            {/* 뷰 모드 토글: 체류시간 vs 인원수 */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 shrink-0 self-start sm:self-auto border border-slate-200/80">
              <button
                type="button"
                onClick={() => setHeatmapView('duration')}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  heatmapView === 'duration'
                    ? 'bg-white text-violet-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ⏱️ 체류시간 뷰
              </button>
              <button
                type="button"
                onClick={() => setHeatmapView('headcount')}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  heatmapView === 'headcount'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                👥 접속 인원수 뷰
              </button>
            </div>
          </div>

          {/* 범례 표시 (뷰 모드에 따라 다이내믹 변경) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[10px] font-bold text-slate-500">
            <span className="text-slate-400 font-extrabold">범례 (색상 농도):</span>
            {heatmapView === 'duration' ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-100"></span> 30분 미만</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-200"></span> 1시간</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-500 text-white px-0.5"></span> 1.5시간</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-700 text-white px-0.5"></span> 2시간+</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-200 border border-dashed border-rose-400"></span> 🚫 수업 제외</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50"></span> 1~5명</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-100"></span> 6~12명</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-400"></span> 13~20명</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-600"></span> 21~25명</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gradient-to-r from-violet-600 to-pink-600"></span> 26명+ (피크🔥)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-200 border border-dashed border-rose-400"></span> 🚫 수업 제외</span>
              </div>
            )}
          </div>

          {/* 히트맵 그리드 테이블 (실제 100% 동적 렌더링) */}
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-center text-[10px] font-bold border-separate border-spacing-1">
              <thead>
                <tr className="text-slate-400">
                  <th className="w-8 py-1">요일</th>
                  {HEATMAP_HOURS.map(h => (
                    <th key={h} className={h >= 19 && h <= 22 ? 'text-violet-600 font-black' : ''}>
                      {h === 24 ? '24시' : `${h}시`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_KEYS.map(wDay => {
                  const slots = buildRowSlots(wDay, HEATMAP_HOURS, selectedGrade, rulesConfig, heatmapGridData);
                  const isSun = wDay === 'SUN';
                  const isSat = wDay === 'SAT';

                  return (
                    <tr key={wDay}>
                      <td className={`font-black rounded h-7 ${
                        isSun ? 'text-rose-600 bg-rose-50' : isSat ? 'text-blue-600 bg-blue-50' : 'text-slate-700 bg-slate-100'
                      }`}>
                        {WEEKDAY_KO_MAP[wDay]}
                      </td>

                      {slots.map((slot, sIdx) => {
                        if (slot.type === 'excluded') {
                          return (
                            <td
                              key={sIdx}
                              colSpan={slot.colSpan}
                              onClick={() => handleSlotClick(wDay, slot.startHour, slot)}
                              className="bg-rose-100/90 hover:bg-rose-200/90 border border-dashed border-rose-300 text-rose-900 font-extrabold rounded-lg h-7 px-1 text-[10px] tracking-tight transition-all cursor-pointer shadow-2xs hover:scale-101 active:scale-98"
                              title={`${slot.rule.title} (${slot.rule.start_time.slice(0, 5)} ~ ${slot.rule.end_time.slice(0, 5)} 제외) - 클릭하여 상세 안내 보기`}
                            >
                              🚫 {slot.rule.title} ({slot.rule.start_time.slice(0, 5)}~{slot.rule.end_time.slice(0, 5)} 제외)
                            </td>
                          );
                        }

                        // Data Slot
                        if (heatmapView === 'duration') {
                          if (slot.totalSec === 0) {
                            return (
                              <td
                                key={sIdx}
                                onClick={() => handleSlotClick(wDay, slot.hour, slot)}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-300 rounded-lg h-7 text-[10px] font-normal cursor-pointer transition-colors"
                                title="접속 기록 없음 (클릭하여 확인)"
                              >
                                -
                              </td>
                            );
                          }
                          let bgClass = 'bg-violet-100 text-violet-800 hover:bg-violet-200';
                          if (slot.totalSec >= 5400) bgClass = 'bg-violet-700 text-white font-black shadow-2xs hover:bg-violet-800';
                          else if (slot.totalSec >= 3600) bgClass = 'bg-violet-500 text-white font-black hover:bg-violet-600';
                          else if (slot.totalSec >= 1800) bgClass = 'bg-violet-200 text-violet-900 font-black hover:bg-violet-300';

                          const tooltipText = slot.studentNames.length > 0 
                            ? `${slot.studentNames.slice(0, 4).join(', ')}${slot.studentNames.length > 4 ? ` 외 ${slot.studentNames.length - 4}명` : ''} (${formatDurationKo(slot.totalSec)})`
                            : formatDurationKo(slot.totalSec);

                          return (
                            <td
                              key={sIdx}
                              onClick={() => handleSlotClick(wDay, slot.hour, slot)}
                              className={`${bgClass} rounded-lg h-7 text-[10px] font-black cursor-pointer transition-all hover:scale-105 hover:ring-2 hover:ring-violet-400 active:scale-95 shadow-2xs`}
                              title={`${tooltipText} - 클릭하여 학생별 상세 보기`}
                            >
                              {formatDurationKo(slot.totalSec)}
                            </td>
                          );
                        } else {
                          // Headcount View
                          if (slot.studentCount === 0) {
                            return (
                              <td
                                key={sIdx}
                                onClick={() => handleSlotClick(wDay, slot.hour, slot)}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-300 rounded-lg h-7 text-[10px] font-normal cursor-pointer transition-colors"
                                title="접속자 없음 (클릭하여 확인)"
                              >
                                -
                              </td>
                            );
                          }
                          let bgClass = 'bg-blue-50 text-blue-700 hover:bg-blue-100';
                          if (slot.studentCount >= 26) bgClass = 'bg-gradient-to-r from-violet-600 to-pink-600 text-white font-black shadow-sm';
                          else if (slot.studentCount >= 21) bgClass = 'bg-indigo-600 text-white font-black hover:bg-indigo-700';
                          else if (slot.studentCount >= 13) bgClass = 'bg-indigo-400 text-white font-black hover:bg-indigo-500';
                          else if (slot.studentCount >= 6) bgClass = 'bg-blue-100 text-blue-900 font-black hover:bg-blue-200';

                          const tooltipText = slot.studentNames.join(', ');

                          return (
                            <td
                              key={sIdx}
                              onClick={() => handleSlotClick(wDay, slot.hour, slot)}
                              className={`${bgClass} rounded-lg h-7 text-[10px] font-black cursor-pointer transition-all hover:scale-105 hover:ring-2 hover:ring-indigo-400 active:scale-95 shadow-2xs`}
                              title={`${tooltipText} - 클릭하여 학생별 상세 보기`}
                            >
                              {slot.studentCount}명{slot.studentCount >= 26 ? ' 🔥' : ''}
                            </td>
                          );
                        }
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 인원수 뷰일 때 하단 피크 분석 뱃지 바 */}
          {heatmapView === 'headcount' && (
            <div className="p-3 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl flex flex-wrap items-center justify-between text-xs font-bold text-violet-950 gap-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-rose-500 shrink-0" />
                <span>
                  최고 골든타임: <strong className="text-violet-700 font-black">{headcountKpi.peakTimeText}</strong>
                  {headcountKpi.peakCount > 0 ? (
                    <> (동시 <span className="text-rose-600 font-black">{headcountKpi.peakCount}명</span> 집중 학습)</>
                  ) : (
                    <span className="text-slate-400 font-normal"> (수업 외 가정 학습 집계 대기)</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-extrabold flex items-center gap-3">
                <span>저녁 피크(19~24시) 평균: <strong className="text-slate-800">{headcountKpi.avgEvening}명</strong></span>
                <span>자정(24시) 심야 열공: <strong className="text-indigo-600">{headcountKpi.midnightCount}명</strong></span>
              </div>
            </div>
          )}
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

      {/* ========================================================================= */}
      {/* 5. 신규 기능: 다중 학년 동시 비교 & 골든타임 1·2·3등 랭킹 분석 */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="text-base font-black text-slate-800 flex items-center gap-2">
              <Trophy size={18} className="text-amber-500" />
              <span>📊 학년별 동시 비교 & 골든타임 1·2·3등 랭킹 분석</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-extrabold border border-amber-200">
                Multi-Grade Comparison
              </span>
            </div>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              고1, 고2, 고3 등 여러 학년을 동시에 켜놓고 "같은 시간대에 어느 학년이 더 열심히 접속하는지" 실시간 비교합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 다중 선택 학년 토글 버튼들 */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-200/80">
              <span className="text-[11px] font-black text-slate-400 ml-1.5 mr-1 shrink-0">비교 학년:</span>
              {['고1', '고2', '고3', '중3', '중2', '중1'].map(g => {
                const isSelected = comparisonGrades.includes(g);
                const theme = GRADE_COLOR_THEME[g] || GRADE_COLOR_THEME['고1'];
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleComparisonGrade(g)}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isSelected
                        ? `${theme.bg} ${theme.text} border ${theme.border} shadow-2xs font-black scale-105`
                        : 'bg-white hover:bg-slate-100 text-slate-400 border border-slate-200/60'
                    }`}
                  >
                    {isSelected ? `✓ ${g}` : g}
                  </button>
                );
              })}
            </div>

            {/* 비교 뷰 모드 스위치 */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setComparisonView('ranking')}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  comparisonView === 'ranking'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🥇 1·2·3등 메달 랭킹
              </button>
              <button
                type="button"
                onClick={() => setComparisonView('sideBySide')}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  comparisonView === 'sideBySide'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 나란히 비교 막대
              </button>
            </div>
          </div>
        </div>

        {/* 랭킹 뷰 vs 나란히 비교 막대 뷰 */}
        {comparisonView === 'ranking' ? (
          /* 🥇 1·2·3등 메달 랭킹 뷰 (피크 7개 시간대 카드 그리드) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {multiGradeRankingData.map(slot => {
              const topRank = slot.ranks[0];
              const isGolden = slot.hour === 22 || slot.hour === 23;
              const isMidnight = slot.hour === 24;

              return (
                <div
                  key={slot.hour}
                  className={`rounded-2xl p-4 border transition-all space-y-3 ${
                    isGolden
                      ? 'bg-gradient-to-b from-purple-50/70 to-white border-purple-200 shadow-sm'
                      : isMidnight
                      ? 'bg-gradient-to-b from-orange-50/60 to-white border-orange-200 shadow-sm'
                      : 'bg-slate-50/70 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${
                      isGolden ? 'text-purple-900' : isMidnight ? 'text-orange-950' : 'text-slate-800'
                    }`}>
                      ⏰ {slot.hourLabel}
                    </span>
                    {topRank && !topRank.isExcluded && topRank.count > 0 && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        🥇 1위: {topRank.grade}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {slot.ranks.map((item, rIdx) => {
                      const medal = rIdx === 0 ? '🥇' : rIdx === 1 ? '🥈' : rIdx === 2 ? '🥉' : `${rIdx + 1}위`;
                      const theme = GRADE_COLOR_THEME[item.grade] || GRADE_COLOR_THEME['고1'];
                      const pct = Math.round((item.count / slot.maxCount) * 100);

                      return (
                        <div key={item.grade} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-black">
                            <span className="flex items-center gap-1.5">
                              <span className="w-5 text-center">{medal}</span>
                              <span className={`px-1.5 py-0.2 rounded ${theme.badge} font-black text-[10px]`}>
                                {item.grade}
                              </span>
                            </span>

                            {item.isExcluded ? (
                              <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                🚫 학원 수업
                              </span>
                            ) : (
                              <span className={`${rIdx === 0 ? 'text-purple-700 font-black' : 'text-slate-600'}`}>
                                {item.count}명 {rIdx === 0 && item.count >= 10 ? '🔥' : ''}
                              </span>
                            )}
                          </div>

                          <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                item.isExcluded ? 'bg-rose-300' : theme.fill
                              }`}
                              style={{ width: `${item.isExcluded ? 100 : Math.max(pct, item.count > 0 ? 8 : 0)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 📊 나란히 비교 막대 뷰 */
          <div className="space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80">
            {multiGradeRankingData.map(slot => (
              <div key={slot.hour} className="space-y-1 bg-white p-3 rounded-xl border border-slate-200/70">
                <div className="flex items-center justify-between text-xs font-black text-slate-800">
                  <span>⏰ {slot.hourLabel}</span>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-extrabold">
                    {slot.ranks.map(g => (
                      <span key={g.grade}>
                        {g.grade}: {g.isExcluded ? '🚫수업' : `${g.count}명`}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 h-6">
                  {slot.ranks.map(item => {
                    const theme = GRADE_COLOR_THEME[item.grade] || GRADE_COLOR_THEME['고1'];
                    const pct = Math.round((item.count / slot.maxCount) * 100);

                    return (
                      <div
                        key={item.grade}
                        className={`h-full rounded-lg flex items-center justify-between px-2 text-[10px] font-black transition-all ${
                          item.isExcluded
                            ? 'bg-rose-100 text-rose-800 border border-dashed border-rose-300'
                            : `${theme.fill} text-white shadow-2xs`
                        }`}
                        style={{ width: `${item.isExcluded ? '25%' : `${Math.max(pct, 12)}%`}` }}
                        title={`${item.grade}: ${item.count}명 (${item.students.join(', ')})`}
                      >
                        <span>{item.grade}</span>
                        <span>{item.isExcluded ? '수업' : `${item.count}명`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. 하단: 학생별 상세 가정 학습 피드 (테이블 & 카드) */}
      <div id="home-study-student-list" className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Users size={16} className="text-violet-600" />
              <span>학생별 상세 가정 학습 기록 ({filteredStudentList.length}명)</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">
              학생을 클릭하면 세부 세션 타임라인을 확인하며, [심층 분석] 버튼으로 동일 학년 평균 대비 분석 팝업을 엽니다.
            </p>
          </div>

          <div className="text-xs font-bold text-slate-500">
            조회 기간: <strong className="text-violet-700">{startDate} ~ {endDate}</strong>
          </div>
        </div>

        {/* 학생 목록 테이블 */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={28} className="animate-spin text-violet-600" />
            <span className="text-xs font-bold">가정 학습 데이터를 불러오는 중...</span>
          </div>
        ) : filteredStudentList.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
            선택한 기간/학년에 가정 학습 기록이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStudentList.map(record => {
              const isExpanded = expandedStudentId === record.student_id;
              const firstTime = record.first_access_at 
                ? new Date(record.first_access_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '-';
              const lastTime = record.last_access_at 
                ? new Date(record.last_access_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '-';

              return (
                <div
                  key={record.student_id}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    isExpanded ? 'border-violet-300 bg-violet-50/20 shadow-sm' : 'border-slate-200/80 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* 요약 바 */}
                  <div
                    onClick={() => setExpandedStudentId(isExpanded ? null : record.student_id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 font-black text-sm flex items-center justify-center shrink-0 border border-violet-200">
                        {record.student_name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{record.student_name}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {record.student_grade}
                          </span>
                          {record.days_count > 1 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                              {record.days_count}일간 학습
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>최초 접속: {firstTime}</span>
                          <span>•</span>
                          <span>최종 접속: {lastTime}</span>
                          <span>•</span>
                          <span>총 세션 {record.session_count}회</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* 활동 뱃지들 */}
                      <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-bold">
                        {record.activities_summary?.library_sec > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-100">
                            📚 기출 {formatDurationKo(record.activities_summary.library_sec)}
                          </span>
                        )}
                        {record.activities_summary?.review_sec > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
                            📝 복습 {formatDurationKo(record.activities_summary.review_sec)}
                          </span>
                        )}
                        {record.activities_summary?.video_sec > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-100">
                            🎬 영상 {formatDurationKo(record.activities_summary.video_sec)}
                          </span>
                        )}
                      </div>

                      {/* 총 체류시간 + 학원수업 차감 뱃지 */}
                      <div className="text-right">
                        <div className="text-base font-black text-violet-700">
                          {formatDurationKo(record.pure_sec)}
                        </div>
                        {record.excluded_sec > 0 ? (
                          <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5 inline-block">
                            🚫 수업 {formatDurationKo(record.excluded_sec)} 차감
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-bold">순수 가정 학습</div>
                        )}
                      </div>

                      {/* 심층 분석 팝업 호출 버튼 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudentDeepDive(record.student_id);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs transition-all cursor-pointer shadow-sm shadow-violet-200"
                        title="동일 학년 비교 및 심층 모니터링 팝업 열기"
                      >
                        <TrendingUp size={13} />
                        <span>심층 분석</span>
                      </button>

                      <div className="text-slate-400">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* 세부 세션 타임라인 (펼쳤을 때) */}
                  {isExpanded && (
                    <div className="p-4 pt-1 border-t border-slate-100 bg-slate-50/50 space-y-3 animate-in fade-in duration-200">
                      <div className="text-xs font-black text-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <FileText size={14} className="text-violet-600" />
                          <span>세션별 상세 학습 내역 ({record.all_sessions.length}건)</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold">학원 수업 시간표와 겹친 세션은 차감 처리됨</span>
                      </div>

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {record.all_sessions.map((ses, idx) => {
                          const sTime = ses.started_at ? new Date(ses.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                          const eTime = ses.ended_at ? new Date(ses.ended_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                          const sDate = ses.started_at ? ses.started_at.slice(5, 10) : '';

                          return (
                            <div key={ses.id || idx} className="p-3 bg-white rounded-xl border border-slate-200/80 text-xs space-y-1.5">
                              <div className="flex items-center justify-between font-bold text-slate-500">
                                <span className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-700">세션 #{idx + 1}</span>
                                  {sDate && <span className="text-[10px] text-slate-400">({sDate})</span>}
                                  <span>{sTime} ~ {eTime}</span>
                                </span>
                                <span className="text-violet-700 font-black">{formatDurationKo(ses.duration_sec)}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {ses.activities?.map((act, aIdx) => (
                                  <div key={aIdx} className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600"></span>
                                    <span>{act.title}</span>
                                    {act.sub_detail && <span className="text-slate-400 text-[10px]">({act.sub_detail})</span>}
                                    <span className="text-violet-600 font-black">+{formatDurationKo(act.duration_sec)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. 학원 수업 제외 시간대 설정 모달 */}
      <HomeStudyExclusionModal
        isOpen={isExclusionModalOpen}
        onClose={() => setIsExclusionModalOpen(false)}
        allStudents={allStudents}
        onRulesUpdated={(newRules) => {
          setRulesConfig(newRules);
          fetchData();
        }}
      />

      {/* 8. 히트맵 셀 클릭 상세 팝업 모달 */}
      {activeSlotModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActiveSlotModal(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            {activeSlotModal.isExcluded ? (
              <div className="bg-gradient-to-r from-rose-50 via-orange-50 to-white border-b border-rose-100 p-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-rose-950 flex items-center gap-2">
                      <span>🚫 학원 수업 제외 시간</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 font-extrabold">
                        가정 학습 제외
                      </span>
                    </h3>
                    <p className="text-xs font-bold text-rose-700/80 mt-0.5">
                      {activeSlotModal.weekdayKo}요일 ({activeSlotModal.hourLabel})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSlotModal(null)}
                  className="p-1.5 rounded-xl hover:bg-rose-100/70 text-rose-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-white border-b border-violet-100 p-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 border border-violet-200">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <span>📅 {activeSlotModal.weekdayKo}요일 {activeSlotModal.hourLabel} 학습 현황</span>
                    </h3>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">
                      {selectedGrade === 'ALL' || selectedGrade === '전체' ? '전체 학년' : selectedGrade} 기준 · 접속 학생 <strong className="text-violet-700 font-black">{activeSlotModal.students.length}명</strong>
                      {activeSlotModal.totalSec > 0 && ` (누적 ${formatDurationKo(activeSlotModal.totalSec)})`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSlotModal(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {activeSlotModal.isExcluded ? (
                <div className="space-y-4">
                  <div className="p-4 bg-rose-50/70 border border-rose-100 rounded-2xl space-y-2">
                    <div className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <span>📌 적용된 수업 규칙:</span>
                      <strong className="text-rose-700">{activeSlotModal.exclusionRule?.title}</strong>
                    </div>
                    <div className="text-[11px] font-bold text-slate-600">
                      • 시간 범위: <strong>{activeSlotModal.exclusionRule?.start_time} ~ {activeSlotModal.exclusionRule?.end_time}</strong>
                    </div>
                    <div className="text-[11px] font-bold text-slate-600">
                      • 해당 요일: <strong>{activeSlotModal.exclusionRule?.days.map(d => WEEKDAY_KO_MAP[d] + '요일').join(', ')}</strong>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    💡 이 시간대는 학원 정규 수업 시간표로 등록되어 있어, 학생이 앱에 접속하더라도 <strong>순수 가정/자기주도 학습 통계(체류 시간, 최고 골든타임)</strong>에서 자동 제외됩니다. 실시간 모니터링 기능은 정상 작동합니다.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveSlotModal(null);
                      setIsExclusionModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-black text-xs shadow-md shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ShieldAlert size={15} />
                    <span>학원 수업 제외 시간표 수정하기</span>
                  </button>
                </div>
              ) : activeSlotModal.students.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Clock size={24} />
                  </div>
                  <div className="text-xs font-black text-slate-700">이 시간대에는 접속한 학생이 없습니다.</div>
                  <div className="text-[11px] font-bold text-slate-400">
                    학생이 학원 외 장소에서 앱을 이용하면 여기에 실시간으로 표시됩니다.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-black text-slate-600 flex items-center justify-between">
                    <span>접속 학생 목록 ({activeSlotModal.students.length}명)</span>
                    <span className="text-[11px] text-slate-400 font-normal">체류시간 순 정렬</span>
                  </div>

                  {activeSlotModal.students.map((st, idx) => (
                    <div 
                      key={idx}
                      className="bg-slate-50 hover:bg-violet-50/50 border border-slate-200/80 hover:border-violet-200 rounded-2xl p-3.5 transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-black text-slate-900">{st.student_name}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            {st.student_grade}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-violet-700 bg-violet-100/80 px-2.5 py-1 rounded-xl">
                            ⏱️ {formatDurationKo(st.duration_sec)}
                          </span>
                        </div>
                      </div>

                      {st.started_at && (
                        <div className="text-[10px] font-bold text-slate-400">
                          접속 시각: {new Date(new Date(st.started_at).getTime() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19)}
                        </div>
                      )}

                      {/* 활동 내역 태그 */}
                      {st.activities && st.activities.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-slate-200/60">
                          <div className="text-[10px] font-extrabold text-slate-500">열람 컨텐츠:</div>
                          <div className="flex flex-wrap gap-1">
                            {st.activities.slice(0, 3).map((act, aIdx) => (
                              <span 
                                key={aIdx} 
                                className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center gap-1 max-w-[220px] truncate"
                                title={act.title}
                              >
                                <span>{act.mode === 'library' ? '📚' : act.mode === 'video' ? '🎬' : '📝'}</span>
                                <span className="truncate">{act.title}</span>
                                <span className="text-violet-600 font-extrabold">({formatDurationKo(act.duration_sec)})</span>
                              </span>
                            ))}
                            {st.activities.length > 3 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-500">
                                +{st.activities.length - 3}개 더
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 바로가기 버튼 */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchStudent(st.student_name);
                            setActiveSlotModal(null);
                            const el = document.getElementById('home-study-student-list');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="flex items-center gap-1 text-[11px] font-black text-violet-600 hover:text-violet-800 bg-white hover:bg-violet-100/50 border border-violet-200 px-2.5 py-1 rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          <Search size={12} />
                          <span>{st.student_name} 학생 오늘 기록 보기</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSlotModal(null)}
                className="px-4 py-2 rounded-2xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. 학생 1인 맞춤 심층 모니터링 팝업 모달 (동일 학년 평균 비교선 ON/OFF 토글) */}
      {deepDiveData && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 print:p-0 print:bg-white"
          onClick={() => setSelectedStudentDeepDive(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 print:max-h-none print:shadow-none print:border-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-violet-950 via-purple-950 to-slate-900 text-white p-6 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-violet-500/30 border border-white/20">
                  {deepDiveData.studentName.slice(0, 1)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-black text-white">{deepDiveData.studentName} 학생 맞춤 심층 학습 분석실</h2>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/30 text-violet-200 font-extrabold border border-violet-400/30">
                      {deepDiveData.studentGrade}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-bold flex flex-wrap items-center gap-2">
                    <span>📅 분석 기간: {deepDiveData.startDate} ~ {deepDiveData.endDate}</span>
                    <span>•</span>
                    <span className="text-amber-300 bg-amber-400/20 px-2.5 py-0.5 rounded-full border border-amber-400/30 font-extrabold">
                      {deepDiveData.peakHourText}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentDeepDive(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer print:hidden"
              >
                <X size={18} />
              </button>
            </div>

            {/* Stat Summary Banner (3 Stat Cards) */}
            <div className="bg-slate-50 p-5 border-b border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400">⏱️ 기간 총 순수 가정 학습</div>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {formatDurationKo(deepDiveData.studentTotalPureSec)}
                  </div>
                </div>
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100">
                  일평균 {formatDurationKo(Math.round(deepDiveData.studentTotalPureSec / Math.max(deepDiveData.dailyPoints.length, 1)))}
                </span>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400">👥 {deepDiveData.studentGrade} 동일 학년 평균 대비</div>
                  <div className={`text-xl font-black mt-1 ${deepDiveData.isAboveAvg ? 'text-emerald-600' : 'text-slate-600'}`}>
                    {deepDiveData.isAboveAvg ? `+${formatDurationKo(deepDiveData.netDiffTotal)} 초과` : `-${formatDurationKo(Math.abs(deepDiveData.netDiffTotal))} 미달`}
                  </div>
                </div>
                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                  deepDiveData.isAboveAvg ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {deepDiveData.isAboveAvg ? '상위권 몰입 🏆' : '평균 대비 완만'}
                </span>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400">🚫 학원 수업 제외 시간</div>
                  <div className="text-xl font-black text-rose-600 mt-1">
                    {formatDurationKo(deepDiveData.studentTotalExcludedSec)}
                  </div>
                </div>
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  수업 칼차감 완료
                </span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Daily Bar Chart Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <TrendingUp size={16} className="text-violet-600" />
                    <span>일자별 가정 학습량 추이 vs 동일 학년 평균 비교</span>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2.5 bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200">
                    <span className="text-xs font-black text-slate-700">동일 학년 평균 비교</span>
                    <button
                      type="button"
                      onClick={() => setShowGradeAvgComparison(!showGradeAvgComparison)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                        showGradeAvgComparison ? 'bg-violet-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-xs ${
                        showGradeAvgComparison ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                    <span className="text-[11px] font-black text-violet-700">
                      {showGradeAvgComparison ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>

                {/* Bar Chart Canvas */}
                <div className="h-56 flex items-end justify-between pt-8 pb-6 px-3 border-b border-slate-100 gap-2 overflow-x-auto">
                  {deepDiveData.dailyPoints.map(pt => {
                    const studentPct = Math.max(Math.round((pt.studentSec / deepDiveData.maxChartSec) * 100), pt.studentSec > 0 ? 8 : 2);
                    const gradePct = Math.max(Math.round((pt.gradeAvgSec / deepDiveData.maxChartSec) * 100), pt.gradeAvgSec > 0 ? 8 : 2);

                    return (
                      <div key={pt.date} className="flex-1 min-w-[42px] flex flex-col items-center justify-end h-full relative group">
                        {/* Bars Container */}
                        <div className="flex items-end justify-center gap-1.5 w-full h-full">
                          {/* Student Bar */}
                          <div
                            className="w-5 sm:w-6 bg-gradient-to-t from-violet-600 to-fuchsia-500 rounded-t-lg transition-all duration-300 relative group-hover:brightness-110"
                            style={{ height: `${studentPct}%` }}
                            title={`${deepDiveData.studentName}: ${formatDurationKo(pt.studentSec)}`}
                          >
                            {/* Diff badge on top */}
                            {showGradeAvgComparison && pt.studentSec > 0 && (
                              <div className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black px-1 py-0.5 rounded whitespace-nowrap shadow-2xs ${
                                pt.diffSec >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {pt.diffSec >= 0 ? `+${Math.round(pt.diffSec / 60)}m` : `-${Math.round(Math.abs(pt.diffSec) / 60)}m`}
                              </div>
                            )}
                          </div>

                          {/* Grade Average Bar (Toggled ON/OFF) */}
                          {showGradeAvgComparison && (
                            <div
                              className="w-4 sm:w-5 bg-slate-200 border border-dashed border-slate-400 rounded-t-lg transition-all duration-300"
                              style={{ height: `${gradePct}%` }}
                              title={`${deepDiveData.studentGrade} 평균: ${formatDurationKo(pt.gradeAvgSec)}`}
                            />
                          )}
                        </div>

                        {/* Date Label */}
                        <div className="text-[10px] font-bold text-slate-500 mt-2 truncate w-full text-center">
                          {pt.label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 text-xs font-bold text-slate-500 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-gradient-to-tr from-violet-600 to-fuchsia-500"></span>
                    <span>{deepDiveData.studentName} 순수 학습량</span>
                  </div>
                  {showGradeAvgComparison && (
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded bg-slate-200 border border-dashed border-slate-400"></span>
                      <span>{deepDiveData.studentGrade} 동일 학년 평균</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lower Grid (Hourly Breakdown + Top 3 Materials) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Hourly Distribution (7 cols) */}
                <div className="md:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Clock size={15} className="text-violet-600" />
                      시간대별 활동 분포 (14시 ~ 01시)
                    </span>
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      빗금: 학원 수업 시간대
                    </span>
                  </div>

                  <div className="h-32 flex items-end justify-between pt-4 pb-5 px-1 border-b border-slate-100 gap-1.5">
                    {deepDiveData.hourlyDistribution.map(h => {
                      const hPct = Math.max(Math.round((h.sec / deepDiveData.maxHourSec) * 100), h.sec > 0 ? 12 : 3);
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            className={`w-full rounded-t-md transition-all ${
                              h.isClass
                                ? 'bg-rose-100 border border-dashed border-rose-300'
                                : h.sec > 3600
                                ? 'bg-violet-600 shadow-2xs'
                                : h.sec > 0
                                ? 'bg-violet-300'
                                : 'bg-slate-100'
                            }`}
                            style={{ height: `${h.isClass ? 80 : hPct}%` }}
                            title={`${h.hourLabel}: ${h.isClass ? '학원 수업 (제외)' : formatDurationKo(h.sec)}`}
                          />
                          <span className="text-[9px] font-bold text-slate-400 mt-1.5">{h.hourLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top 3 Materials (5 cols) */}
                <div className="md:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-2xs">
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Library size={15} className="text-amber-500" />
                    기간 최다 열람 라이브러리 교재 TOP 3
                  </div>

                  <div className="space-y-2 pt-1">
                    {deepDiveData.topMaterials.length === 0 ? (
                      <div className="py-8 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl">
                        열람된 라이브러리 기록이 없습니다.
                      </div>
                    ) : (
                      deepDiveData.topMaterials.map((mat, mIdx) => (
                        <div key={mIdx} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center shrink-0">
                              {mIdx + 1}
                            </span>
                            <span className="font-black text-slate-800 truncate" title={mat.title}>
                              {mat.title}
                            </span>
                          </div>
                          <span className="text-[11px] font-extrabold text-violet-700 shrink-0">
                            {formatDurationKo(mat.sec)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200/80 p-4 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold text-slate-400">
                학부모 상담 및 학생 1:1 코칭 리포트로 활용하세요.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-black text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  <Printer size={14} />
                  <span>인쇄하기</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentDeepDive(null)}
                  className="px-4 py-2 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs transition-colors cursor-pointer shadow-sm shadow-violet-200"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
