'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Users, 
  Search, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Volume2, 
  VolumeX, 
  Bell, 
  RefreshCw, 
  Library, 
  BookOpen, 
  FileCheck, 
  ExternalLink,
  Laptop,
  Radio,
  Eye,
  Check,
  X,
  UserPlus,
  SlidersHorizontal,
  PlaySquare,
  FileText,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Calendar,
  Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { StudentAwayLog } from '@/app/api/monitoring/away-logs/route';

export interface StudentActivity {
  student_id: string;
  student_name: string;
  student_grade: string;
  mode: 'library' | 'review' | 'homework' | 'idle' | 'test' | 'video';
  location_title: string;
  sub_detail?: string;
  is_away: boolean;
  away_started_at?: number;
  entered_at: number;
  updated_at: string;
  // 시험 진행 중일 경우
  exam_title?: string;
  bundle_title?: string;
  round?: number;
  question_idx?: number;
  total_questions?: number;
  test_status?: string;
  test_remaining_sec?: number;
  duration_min?: number;
  test_duration_min?: number;
}

interface Student {
  id: string;
  name: string;
  grade: string;
  is_unlocked?: boolean;
}

interface DailyActivityMonitoringTabProps {
  allStudents: Student[];
  onSwitchToExamProctor?: (studentId?: string) => void;
}

const GRADES = ['ALL', '중1', '중2', '중3', '고1', '고2', '고3'];

export default function DailyActivityMonitoringTab({
  allStudents,
  onSwitchToExamProctor,
}: DailyActivityMonitoringTabProps) {
  // 🌟 [세션 영구 보존] 모니터링 대상 학생 ID 목록
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('eduest_daily_selected_ids');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  // 최초 로드 시 저장된 학생 목록이 없으면 전체 학생을 기본 선택할지 여부 플래그
  const initializedSelectionRef = useRef(false);
  useEffect(() => {
    if (!initializedSelectionRef.current && allStudents.length > 0) {
      initializedSelectionRef.current = true;
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('eduest_daily_selected_ids');
        if (!saved && selectedStudentIds.length === 0) {
          // 최초 진입 시에는 기본적으로 모든 학생을 모니터링에 등록
          const allIds = allStudents.map(s => s.id);
          setSelectedStudentIds(allIds);
          localStorage.setItem('eduest_daily_selected_ids', JSON.stringify(allIds));
        }
      }
    }
  }, [allStudents, selectedStudentIds.length]);

  // 상태 변경 시 localStorage 동기화
  useEffect(() => {
    if (typeof window !== 'undefined' && initializedSelectionRef.current) {
      localStorage.setItem('eduest_daily_selected_ids', JSON.stringify(selectedStudentIds));
    }
  }, [selectedStudentIds]);

  // 학생 추가/수정 모달 열림 여부
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
  // 모달 내부 임시 선택 상태
  const [modalSelectedIds, setModalSelectedIds] = useState<string[]>([]);
  const [modalGradeFilter, setModalGradeFilter] = useState('ALL');
  const [modalSearchName, setModalSearchName] = useState('');

  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'AWAY' | 'TESTING' | 'OFFLINE'>('ALL');
  const [searchName, setSearchName] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // 실시간 활동 맵 (student_id -> StudentActivity)
  const [liveMap, setLiveMap] = useState<Record<string, StudentActivity>>({});
  const prevAwayMapRef = useRef<Record<string, boolean>>({});

  // 🚨 [신규] 자리 이탈(딴짓) 히스토리 로그 상태 및 모달
  const [awayLogs, setAwayLogs] = useState<StudentAwayLog[]>([]);
  const [selectedStudentForLogs, setSelectedStudentForLogs] = useState<Student | null>(null);
  const [logsDateTab, setLogsDateTab] = useState<'today' | 'all'>('today');

  const fetchAwayLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring/away-logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setAwayLogs(data.logs);
      }
    } catch (e) {
      console.error('Failed to load away logs:', e);
    }
  }, []);

  useEffect(() => {
    fetchAwayLogs();
  }, [fetchAwayLogs]);

  const handleDeleteAwayLog = async (logId: string) => {
    if (!confirm('이 딴짓 기록을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch('/api/monitoring/away-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', logId }),
      });
      const data = await res.json();
      if (data.success) {
        setAwayLogs((prev) => prev.filter((l) => l.id !== logId));
      }
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleToggleArchiveAwayLog = async (logId: string) => {
    try {
      const res = await fetch('/api/monitoring/away-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_archive', logId }),
      });
      const data = await res.json();
      if (data.success) {
        setAwayLogs((prev) =>
          prev.map((l) => (l.id === logId ? { ...l, is_archived: !l.is_archived } : l))
        );
      }
    } catch (e) {
      alert('보관 처리 중 오류가 발생했습니다.');
    }
  };

  const handleClearTodayAwayLogs = async (studentId: string, studentName: string) => {
    if (!confirm(`'${studentName}' 학생의 오늘 딴짓 기록(보관 건 제외)을 모두 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch('/api/monitoring/away-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_today', studentId }),
      });
      const data = await res.json();
      if (data.success) {
        const today = new Date().toISOString().slice(0, 10);
        setAwayLogs((prev) =>
          prev.filter((l) => !(l.student_id === studentId && l.started_at.startsWith(today) && !l.is_archived))
        );
        alert('오늘의 딴짓 기록이 정리되었습니다.');
      }
    } catch (e) {
      alert('정리 중 오류가 발생했습니다.');
    }
  };

  const handleCopyConsultationMessage = (student: Student, logs: StudentAwayLog[]) => {
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalCount = logs.length;
    const totalSec = logs.reduce((acc, l) => acc + l.duration_sec, 0);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const durationStr = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
    const focusScore = Math.max(30, Math.min(100, Math.round(100 - (totalSec / 3600) * 100)));

    const logDetails = logs
      .slice(0, 5)
      .map((l, idx) => {
        const start = new Date(l.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const end = new Date(l.ended_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const m = Math.floor(l.duration_sec / 60);
        const s = l.duration_sec % 60;
        const dur = m > 0 ? `${m}분 ${s}초` : `${s}초`;
        return `  ${idx + 1}) [${start} ~ ${end} (${dur})] ${l.location_title || l.context}`;
      })
      .join('\n');

    const msg = `[에듀이스트 학습 태도 리포트 - ${student.name} 학생]
• 기준 일시: ${today}
• 자리 이탈(딴짓) 횟수: 총 ${totalCount}회
• 총 이탈(딴짓) 누적 시간: ${durationStr}
• 오늘 학습 집중도 지수: ${focusScore}점 / 100점
• 주요 이탈 구간:
${logDetails}${logs.length > 5 ? `\n  ...외 ${logs.length - 5}건 추가 이탈 기록` : ''}

※ 학생이 시험/학습 화면을 벗어나 타 브라우저 탭(웹서핑/SNS/유튜브 등)을 이용한 실제 누적 시간입니다.
가정에서도 올바른 학습 습관 형성을 위해 관심과 지도 부탁드립니다.`;

    navigator.clipboard.writeText(msg).then(() => {
      alert(`📋 '${student.name}' 학생의 학부모 상담용 리포트가 클립보드에 복사되었습니다!\n카카오톡 등에 바로 붙여넣기(Ctrl+V)하여 사용하실 수 있습니다.`);
    }).catch(() => {
      alert('클립보드 복사에 실패했습니다.');
    });
  };

  // 1초마다 시계 갱신 (로컬 체류 타이머용 - 서버 통신 0회)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 🔊 경보음 재생 (Web Audio API)
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // 빰! 빰! 빰! 긴급 3연타 자리 이탈 경보음
      [0, 0.22, 0.44].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1050, ctx.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + delay + 0.16);
        gain.gain.setValueAtTime(0.65, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }, [soundEnabled]);

  // OS 윈도우 알림 발송
  const triggerOsNotification = useCallback((title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/favicon.ico' });
      } catch {}
    }
  }, []);

  // 🌟 [최초 로드 및 수동 동기화] DB에서 이미 시험 중(TESTING / AWAY)인 학생 상태 및 proctor-state 즉시 수집
  const fetchActiveTestingStudents = useCallback(async () => {
    try {
      const [studentsRes, proctorRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, grade, test_status, test_remaining_sec, updated_at, last_away_at')
          .in('test_status', ['TESTING', 'AWAY']),
        fetch('/api/test2/proctor-state')
          .then((r) => r.json())
          .catch(() => ({ states: {} })),
      ]);

      const data = studentsRes.data;
      const activeStates = proctorRes?.states || {};

      if (data && data.length > 0) {
        setLiveMap((prev) => {
          const next = { ...prev };
          data.forEach((s: any) => {
            const isAway = s.test_status === 'AWAY';
            const pState = activeStates[s.id] || {};
            const examTitle = pState.exam_title || '';
            const bundleTitle = pState.bundle_title || '';
            const round = pState.round || 1;
            const qIdx = pState.question_idx !== undefined ? pState.question_idx : 0;
            const totalQ = pState.total_questions !== undefined ? pState.total_questions : 0;

            next[s.id] = {
              ...(next[s.id] || {}),
              student_id: s.id,
              student_name: s.name,
              student_grade: s.grade,
              mode: 'test',
              location_title: `시험: ${bundleTitle ? `[${bundleTitle}] ` : ''}${examTitle || '테스트 진행 중'}`,
              is_away: isAway,
              exam_title: examTitle,
              bundle_title: bundleTitle,
              round: round,
              question_idx: qIdx,
              total_questions: totalQ,
              test_status: s.test_status,
              test_remaining_sec: pState.test_remaining_sec !== undefined ? pState.test_remaining_sec : s.test_remaining_sec,
              duration_min: pState.duration_min !== undefined ? pState.duration_min : pState.test_duration_min,
              test_duration_min: pState.test_duration_min,
              entered_at: Date.now(),
              updated_at: s.updated_at || new Date().toISOString(),
            };
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to pre-fetch testing students:', err);
    }
  }, []);

  useEffect(() => {
    fetchActiveTestingStudents();
  }, [fetchActiveTestingStudents]);

  // 📡 Supabase Realtime 'proctoring_room' 채널 구독
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const channel = supabase.channel('proctoring_room');
    channelRef.current = channel;

    // 1. 일상 활동 브로드캐스트 수신
    channel.on('broadcast', { event: 'activity_sync' }, (payload: any) => {
      const p: StudentActivity = payload.payload;
      if (!p || !p.student_id) return;

      const wasAway = prevAwayMapRef.current[p.student_id] || false;

      // 새로 자리를 이탈한 경우 경보음 및 OS 알림
      if (p.is_away && !wasAway) {
        playAlertSound();
        triggerOsNotification(
          `🚨 [자리 이탈] ${p.student_name} 학생`,
          '에듀이스트 화면을 벗어나 다른 사이트/앱으로 이동했습니다.'
        );
      }
      prevAwayMapRef.current[p.student_id] = p.is_away;

      setLiveMap((prev) => ({
        ...prev,
        [p.student_id]: {
          ...(prev[p.student_id] || {}),
          ...p,
        },
      }));
    });

    // 2. 시험 활동 브로드캐스트 수신 (시험 중인 학생 자동 동기화)
    channel.on('broadcast', { event: 'proctor_sync' }, (payload: any) => {
      const p = payload.payload;
      if (!p || !p.student_id) return;

      const isAway = p.test_status === 'AWAY';
      const wasAway = prevAwayMapRef.current[p.student_id] || false;

      if (isAway && !wasAway) {
        playAlertSound();
      }
      prevAwayMapRef.current[p.student_id] = isAway;

      setLiveMap((prev) => {
        const existing = prev[p.student_id] || {
          student_id: p.student_id,
          student_name: p.student_name,
          student_grade: p.student_grade,
          mode: 'test',
          location_title: '시험 진행 중',
          entered_at: Date.now(),
          is_away: isAway,
          updated_at: p.updated_at,
        };

        return {
          ...prev,
          [p.student_id]: {
            ...existing,
            student_name: p.student_name || existing.student_name,
            student_grade: p.student_grade || existing.student_grade,
            mode: 'test',
            location_title: `시험: ${p.bundle_title ? `[${p.bundle_title}] ` : ''}${p.exam_title || '테스트 진행 중'}`,
            is_away: isAway,
            exam_title: p.exam_title,
            bundle_title: p.bundle_title,
            round: p.round,
            question_idx: p.question_idx,
            total_questions: p.total_questions,
            test_status: p.test_status,
            test_remaining_sec: p.test_remaining_sec,
            duration_min: p.duration_min !== undefined ? p.duration_min : p.test_duration_min,
            test_duration_min: p.test_duration_min,
            updated_at: p.updated_at || new Date().toISOString(),
          },
        };
      });
    });

    // 3. Supabase DB 변경 실시간 감지 (시험 상태 동기화)
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, (payload: any) => {
      const student = payload.new;
      if (!student || !student.id) return;

      if (student.test_status === 'TESTING' || student.test_status === 'AWAY') {
        const isAway = student.test_status === 'AWAY';
        setLiveMap((prev) => {
          const existing = prev[student.id];
          return {
            ...prev,
            [student.id]: {
              ...(existing || {}),
              student_id: student.id,
              student_name: student.name || existing?.student_name,
              student_grade: student.grade || existing?.student_grade,
              mode: 'test',
              location_title: existing?.exam_title
                ? `시험: ${existing?.bundle_title ? `[${existing.bundle_title}] ` : ''}${existing.exam_title}`
                : existing?.location_title || '시험 진행 중',
              is_away: isAway,
              test_status: student.test_status,
              test_remaining_sec: student.test_remaining_sec ?? existing?.test_remaining_sec,
              entered_at: existing?.entered_at || Date.now(),
              updated_at: student.updated_at || new Date().toISOString(),
            },
          };
        });
      } else if (student.test_status === 'IDLE' || student.test_status === 'FINISHED') {
        setLiveMap((prev) => {
          if (!prev[student.id]) return prev;
          return {
            ...prev,
            [student.id]: {
              ...prev[student.id],
              test_status: student.test_status,
            },
          };
        });
      }
    });

    // 4. 자리 이탈(딴짓) 로그 발생 실시간 감지
    channel.on('broadcast', { event: 'away_log_created' }, (payload: any) => {
      const newLog = payload?.payload;
      if (newLog && newLog.id) {
        setAwayLogs((prev) => {
          if (prev.some((l) => l.id === newLog.id)) return prev;
          return [newLog, ...prev];
        });
      }
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        // 접속 시 학생들에게 현재 위치 및 시험 상태 핑 요청
        channel.send({
          type: 'broadcast',
          event: 'ping_students',
          payload: { timestamp: Date.now() },
        });
        channel.send({
          type: 'broadcast',
          event: 'ping_proctor',
          payload: { timestamp: Date.now() },
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playAlertSound, triggerOsNotification]);

  // 전체 학생 상태 새로고침 핑 전송
  const handleRequestPing = () => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'ping_students',
        payload: { timestamp: Date.now() },
      });
      channelRef.current.send({
        type: 'broadcast',
        event: 'ping_proctor',
        payload: { timestamp: Date.now() },
      });
    }
    fetchActiveTestingStudents();
  };

  // 모달 열기 핸들러
  const handleOpenSelectModal = () => {
    setModalSelectedIds([...selectedStudentIds]);
    setIsSelectModalOpen(true);
  };

  // 모달 적용 핸들러
  const handleApplySelection = () => {
    setSelectedStudentIds([...modalSelectedIds]);
    setIsSelectModalOpen(false);
  };

  // 개별 학생 모니터링 제외 (빼기)
  const handleRemoveStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
  };

  // 전체 인원 모니터링 추가
  const handleSelectAllStudents = () => {
    setSelectedStudentIds(allStudents.map((s) => s.id));
  };

  // 전체 인원 모니터링 해제 (초기화)
  const handleResetSelection = () => {
    if (confirm('현재 일상 모니터링 중인 모든 학생을 목록에서 제외하시겠습니까?')) {
      setSelectedStudentIds([]);
    }
  };

  // 초를 MM:SS 또는 HH:MM:SS 로 포맷
  const formatDuration = (msDuration: number) => {
    if (msDuration < 0) return '00:00';
    const totalSec = Math.floor(msDuration / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}시간 ${remM}분`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 현재 모니터링 대상으로 지정된 학생 목록
  const targetStudents = useMemo(() => {
    return allStudents.filter((st) => selectedStudentIds.includes(st.id));
  }, [allStudents, selectedStudentIds]);

  // 통계 계산 (모니터링 대상 학생 기준)
  const stats = useMemo(() => {
    let onlineCount = 0;
    let awayCount = 0;
    let testingCount = 0;
    let offlineCount = 0;

    targetStudents.forEach((st) => {
      const act = liveMap[st.id];
      if (!act) {
        offlineCount++;
        return;
      }

      const lastUpdatedMs = act.updated_at ? new Date(act.updated_at).getTime() : 0;
      const isStale = currentTime - lastUpdatedMs > 15 * 60 * 1000;

      if (isStale) {
        offlineCount++;
      } else if (act.is_away) {
        awayCount++;
      } else if (act.mode === 'test' || act.test_status === 'TESTING') {
        testingCount++;
      } else {
        onlineCount++;
      }
    });

    return {
      total: targetStudents.length,
      allDbTotal: allStudents.length,
      online: onlineCount,
      away: awayCount,
      testing: testingCount,
      offline: offlineCount,
    };
  }, [targetStudents, allStudents.length, liveMap, currentTime]);

  // 메인 카드 목록 (필터링 적용)
  const filteredStudents = useMemo(() => {
    return targetStudents.filter((st) => {
      if (gradeFilter !== 'ALL' && st.grade !== gradeFilter) return false;
      if (searchName && !st.name.toLowerCase().includes(searchName.toLowerCase())) return false;

      const act = liveMap[st.id];
      const lastUpdatedMs = act?.updated_at ? new Date(act.updated_at).getTime() : 0;
      const isStale = !act || currentTime - lastUpdatedMs > 15 * 60 * 1000;

      if (statusFilter === 'AWAY') return act?.is_away && !isStale;
      if (statusFilter === 'TESTING') return (act?.mode === 'test' || act?.test_status === 'TESTING') && !isStale && !act?.is_away;
      if (statusFilter === 'ONLINE') return act && !act.is_away && act.mode !== 'test' && !isStale;
      if (statusFilter === 'OFFLINE') return isStale;

      return true;
    });
  }, [targetStudents, liveMap, gradeFilter, statusFilter, searchName, currentTime]);

  // 모달 내부 필터링 학생 목록
  const modalFilteredStudents = useMemo(() => {
    return allStudents.filter((st) => {
      if (modalGradeFilter !== 'ALL' && st.grade !== modalGradeFilter) return false;
      if (modalSearchName && !st.name.toLowerCase().includes(modalSearchName.toLowerCase())) return false;
      return true;
    });
  }, [allStudents, modalGradeFilter, modalSearchName]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-[1700px] mx-auto min-h-screen">
      
      {/* 1. 상단 타이틀 & 전역 컨트롤 바 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Eye className="text-indigo-600" size={24} />
              일상 모니터링 센터
            </h1>
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 font-black rounded-lg border border-indigo-100">
              선택 인원 집중 감시
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
            원하는 학생만 골라 라이브러리·복습·숙제 위치와 체류 시간을 감시하고, 외부 사이트(유튜브 등) 이탈을 즉각 포착합니다.
          </p>
        </div>

        {/* 인원 관리 및 알림 제어 버튼들 */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* 👥 학생 추가/수정 버튼 */}
          <button
            onClick={handleOpenSelectModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            title="모니터링 대상 학생 넣기/빼기 편집"
          >
            <Users size={16} />
            <span>학생 추가/수정 ({selectedStudentIds.length}명)</span>
          </button>

          {/* 전체 초기화 */}
          {selectedStudentIds.length > 0 && (
            <button
              onClick={handleResetSelection}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all"
              title="모니터링 인원 전체 해제"
            >
              <RotateCcw size={14} />
              <span>전체 해제</span>
            </button>
          )}

          {/* 소리 알림 토글 */}
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              soundEnabled
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? '경보음 켜짐' : '경보음 끔'}</span>
          </button>

          {/* OS 알림 권한 */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                Notification.requestPermission();
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
          >
            <Bell size={16} />
            <span>OS 알림</span>
          </button>

          {/* 실시간 핑 새로고침 */}
          <button
            onClick={handleRequestPing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all border border-slate-200"
            title="접속 중인 모든 학생에게 즉각 현재 상태 보고 요청"
          >
            <RefreshCw size={15} />
            <span>상태 동기화</span>
          </button>
        </div>
      </div>

      {/* 2. 상태 요약 카드 5종 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 md:gap-4">
        {/* 모니터링 인원 */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-[1.02]'
              : 'bg-white text-slate-800 border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-70">모니터링 대상</span>
            <Users size={16} className="opacity-70" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl md:text-3xl font-black">{stats.total}명</span>
            <span className="text-xs opacity-60">/ 전체 {stats.allDbTotal}명</span>
          </div>
        </div>

        {/* 🟢 실시간 학습 중 */}
        <div
          onClick={() => setStatusFilter('ONLINE')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ONLINE'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]'
              : 'bg-emerald-50/50 text-emerald-900 border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-80">🟢 정상 학습 중</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-emerald-600">
            {stats.online}명
          </div>
        </div>

        {/* 🚨 자리 이탈 (딴짓 경보) */}
        <div
          onClick={() => setStatusFilter('AWAY')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'AWAY'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md scale-[1.02]'
              : stats.away > 0
              ? 'bg-rose-50 text-rose-900 border-rose-300 animate-pulse shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-600">
              🚨 자리 이탈 (딴짓)
            </span>
            <AlertTriangle size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-rose-600">
            {stats.away}명
          </div>
        </div>

        {/* 📝 시험 응시 중 */}
        <div
          onClick={() => setStatusFilter('TESTING')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'TESTING'
              ? 'bg-violet-600 text-white border-violet-600 shadow-md scale-[1.02]'
              : 'bg-violet-50/50 text-violet-900 border-violet-200 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-80">📝 시험 응시 중</span>
            <FileCheck size={16} className="text-violet-600" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-violet-600">
            {stats.testing}명
          </div>
        </div>

        {/* ⚪ 미접속 */}
        <div
          onClick={() => setStatusFilter('OFFLINE')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer col-span-2 sm:col-span-1 ${
            statusFilter === 'OFFLINE'
              ? 'bg-slate-700 text-white border-slate-700 shadow-md scale-[1.02]'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-70">⚪ 미접속 (오프라인)</span>
            <Laptop size={16} className="opacity-40" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-slate-400">
            {stats.offline}명
          </div>
        </div>
      </div>

      {/* 3. 검색 및 필터 툴바 */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* 학년 필터 */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-hide">
          {GRADES.map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                gradeFilter === g
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* 이름 검색창 */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="학생 이름 검색..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* 4. 학생 실시간 카드 그리드 */}
      {selectedStudentIds.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600">
            <UserPlus size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-800">모니터링할 학생이 선택되지 않았습니다</h3>
            <p className="text-xs text-slate-500">
              상단의 [학생 추가/수정] 버튼을 눌러 오늘 집중 모니터링할 학생을 담아주세요.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleOpenSelectModal}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              👥 학생 선택하기
            </button>
            <button
              onClick={handleSelectAllStudents}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-all"
            >
              전체 학생 한 번에 추가
            </button>
          </div>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center text-slate-400 font-bold">
          해당 조건(학년/검색어)에 맞는 모니터링 학생이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-20">
          {filteredStudents.map((st) => {
            const act = liveMap[st.id];
            const lastUpdatedMs = act?.updated_at ? new Date(act.updated_at).getTime() : 0;
            const isStale = !act || currentTime - lastUpdatedMs > 15 * 60 * 1000;
            const isAway = act?.is_away && !isStale;
            const isTesting = (act?.mode === 'test' || act?.test_status === 'TESTING') && !isStale;
            const isOnline = act && !isAway && !isTesting && !isStale;

            // 머문 시간 (로컬 타이머 연산: ms)
            const stayDurationMs = act?.entered_at ? Math.max(0, currentTime - act.entered_at) : 0;
            // 이탈 지속 시간
            const awayDurationMs = act?.away_started_at ? Math.max(0, currentTime - act.away_started_at) : 0;

            return (
              <div
                key={st.id}
                className={`rounded-3xl border transition-all duration-300 p-5 flex flex-col justify-between relative overflow-hidden bg-white shadow-xs group ${
                  isAway
                    ? 'border-rose-400 ring-2 ring-rose-300/60 bg-rose-50/20 shadow-rose-100 shadow-md'
                    : isTesting
                    ? 'border-violet-300 ring-1 ring-violet-200 bg-violet-50/15'
                    : isOnline
                    ? 'border-emerald-200 hover:border-emerald-300 hover:shadow-md'
                    : 'border-slate-200/70 bg-slate-50/50 opacity-60'
                }`}
              >
                {/* 상단: 학생 기본 정보 & 상태 뱃지 & ❌ 개별 제외 버튼 */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900">{st.name}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                        {st.grade}
                      </span>
                      {/* 📋 딴짓 이탈 기록 모달 열기 버튼 */}
                      <button
                        onClick={() => {
                          setSelectedStudentForLogs(st);
                          setLogsDateTab('today');
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                        title="자리 이탈/딴짓 상세 기록 및 상담 리포트"
                      >
                        <FileText size={15} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* 상태 뱃지 */}
                      {isAway ? (
                        <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-600 text-white animate-pulse shadow-xs">
                          <AlertTriangle size={12} />
                          자리 이탈 (딴짓)
                        </span>
                      ) : isTesting ? (
                        <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-violet-600 text-white shadow-xs">
                          <FileCheck size={12} />
                          시험 응시 중
                        </span>
                      ) : isOnline ? (
                        <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          학습 중
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                          오프라인
                        </span>
                      )}

                      {/* ❌ 개별 모니터링 제외 버튼 (호버 시 표시) */}
                      <button
                        onClick={() => handleRemoveStudent(st.id)}
                        className="w-6 h-6 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all opacity-40 group-hover:opacity-100"
                        title="모니터링에서 제외 (빼기)"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 중앙 콘텐츠: 현재 위치 & 활동 상태 */}
                  <div className="min-h-[70px] flex flex-col justify-center py-2">
                    {isAway ? (
                      <div className="bg-rose-100/70 border border-rose-200 rounded-2xl p-3 space-y-1">
                        <p className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="shrink-0 text-rose-600" />
                          에듀이스트 화면을 벗어남!
                        </p>
                        <p className="text-[11px] text-rose-600 font-bold truncate">
                          이탈 전 위치: {act?.location_title || '에듀이스트 홈'}
                        </p>
                        <p className="text-[10px] text-rose-700/80 font-mono font-bold">
                          ⏱️ 이탈 시간: {formatDuration(awayDurationMs)} 경과
                        </p>
                      </div>
                    ) : isTesting ? (
                      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-violet-900 truncate">
                            {act?.exam_title || act?.bundle_title || '시험지 진행 중'}
                          </span>
                          {act?.round && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-200/70 text-violet-800 rounded">
                              {act.round}차
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-violet-700 font-bold flex items-center justify-between">
                          <span>
                            진행: 문항 {act?.question_idx || 1} / {act?.total_questions || '?'}
                          </span>
                          {(() => {
                            const isUnlimited =
                              (act?.duration_min !== undefined && act.duration_min <= 0) ||
                              (act?.test_duration_min !== undefined && act.test_duration_min <= 0);
                            if (isUnlimited) {
                              return (
                                <span className="font-bold text-violet-600 bg-violet-100/80 px-2 py-0.5 rounded text-[10px]">
                                  자율 응시 (무제한)
                                </span>
                              );
                            }
                            if (act?.test_remaining_sec !== undefined) {
                              return (
                                <span className="font-mono text-violet-900 font-black">
                                  남은 시간: {Math.floor(act.test_remaining_sec / 60)}분 {act.test_remaining_sec % 60}초
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    ) : isOnline ? (
                      <div className="space-y-1.5">
                        {/* 메뉴 구분 아이콘 */}
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                          {act?.mode === 'library' ? (
                            <Library size={14} className="text-indigo-600" />
                          ) : act?.mode === 'review' ? (
                            <BookOpen size={14} className="text-amber-600" />
                          ) : act?.mode === 'video' ? (
                            <PlaySquare size={14} className="text-rose-600" />
                          ) : act?.mode === 'homework' ? (
                            <BookOpen size={14} className="text-amber-600" />
                          ) : act?.mode === 'test' ? (
                            <FileCheck size={14} className="text-violet-600" />
                          ) : (
                            <Laptop size={14} className="text-slate-500" />
                          )}
                          <span className="font-black text-slate-700">
                            {act?.mode === 'library'
                              ? '라이브러리'
                              : act?.mode === 'review'
                              ? '복습(Review)'
                              : act?.mode === 'video'
                              ? '영상강의 시청'
                              : act?.mode === 'homework'
                              ? '숙제'
                              : act?.mode === 'test'
                              ? '시험(Test)'
                              : '대시보드'}
                          </span>
                          {act?.sub_detail && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
                              {act.sub_detail}
                            </span>
                          )}
                        </div>

                        {/* 구체적인 문제/단원 위치 */}
                        <p className="text-xs md:text-[13px] font-black text-slate-900 line-clamp-2 leading-snug">
                          {act?.location_title || '메뉴 탐색 중...'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-2 text-xs font-bold text-slate-400">
                        최근 접속 및 활동 기록 없음
                      </div>
                    )}
                  </div>

                  {/* 🚨 오늘 딴짓 통계 뱃지 (기록이 있을 때 노출) */}
                  {(() => {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const studentTodayLogs = awayLogs.filter(
                      (l) => l.student_id === st.id && l.started_at.startsWith(todayStr)
                    );
                    if (studentTodayLogs.length === 0) return null;
                    const studentTodayCount = studentTodayLogs.length;
                    const studentTodaySec = studentTodayLogs.reduce((acc, l) => acc + l.duration_sec, 0);
                    const studentTodayMin = Math.floor(studentTodaySec / 60);
                    const studentTodayRemSec = studentTodaySec % 60;
                    return (
                      <button
                        onClick={() => {
                          setSelectedStudentForLogs(st);
                          setLogsDateTab('today');
                        }}
                        className="w-full mt-2 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-amber-800 flex items-center justify-between text-xs font-bold transition-all shadow-2xs group"
                        title="클릭하여 상세 이탈 내역 및 학부모 상담 리포트 확인"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                          <span>
                            오늘 딴짓 <strong className="font-black text-amber-900">{studentTodayCount}회</strong> (
                            {studentTodayMin > 0 ? `${studentTodayMin}분 ` : ''}
                            {studentTodayRemSec}초)
                          </span>
                        </span>
                        <span className="text-[11px] text-amber-600 font-black group-hover:translate-x-0.5 transition-transform">
                          내역 보기 &gt;
                        </span>
                      </button>
                    );
                  })()}
                </div>

                {/* 하단 푸터: 체류 시간 타이머 or 시험 감독 이동 버튼 */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                  {isTesting ? (
                    <button
                      onClick={() => onSwitchToExamProctor?.(st.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all shadow-xs"
                    >
                      <span>📝 시험 감독으로 이동</span>
                      <ExternalLink size={13} />
                    </button>
                  ) : isOnline ? (
                    <div className="w-full flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold flex items-center gap-1">
                        <Clock size={12} />
                        체류 시간
                      </span>
                      <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        {formatDuration(stayDurationMs)}째 학습 중
                      </span>
                    </div>
                  ) : isAway ? (
                    <div className="w-full flex items-center justify-between text-xs text-rose-600 font-bold">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        이탈 경과
                      </span>
                      <span className="font-mono font-black bg-rose-100 px-2 py-0.5 rounded-md">
                        {formatDuration(awayDurationMs)}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full text-right text-[11px] text-slate-400 font-medium">
                      접속 대기
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. 👥 학생 넣기/빼기 (선택/수정) 모달 팝업
      ───────────────────────────────────────────────────────────── */}
      {isSelectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* 모달 헤더 */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Users className="text-indigo-600" size={20} />
                  모니터링 학생 추가 및 수정 (넣기/빼기)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  체크한 학생들만 일상 모니터링 카드에 표시됩니다. (설정은 자동으로 저장됩니다)
                </p>
              </div>
              <button
                onClick={() => setIsSelectModalOpen(false)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* 필터 및 검색 바 */}
            <div className="p-4 bg-slate-50 border-b border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={modalGradeFilter}
                  onChange={(e) => setModalGradeFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>{g === 'ALL' ? '전체 학년' : g}</option>
                  ))}
                </select>

                <div className="relative flex-1 sm:w-56">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={modalSearchName}
                    onChange={(e) => setModalSearchName(e.target.value)}
                    placeholder="이름 검색..."
                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    const currentIds = modalFilteredStudents.map((s) => s.id);
                    setModalSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
                >
                  목록 전체 선택
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentIdsSet = new Set(modalFilteredStudents.map((s) => s.id));
                    setModalSelectedIds((prev) => prev.filter((id) => !currentIdsSet.has(id)));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-all"
                >
                  목록 선택 해제
                </button>
              </div>
            </div>

            {/* 학생 선택 카드 그리드 */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {modalFilteredStudents.map((student) => {
                const isSelected = modalSelectedIds.includes(student.id);
                const act = liveMap[student.id];
                const lastUpdatedMs = act?.updated_at ? new Date(act.updated_at).getTime() : 0;
                const isStale = !act || currentTime - lastUpdatedMs > 15 * 60 * 1000;
                const isAway = act?.is_away && !isStale;
                const isTesting = (act?.mode === 'test' || act?.test_status === 'TESTING') && !isStale;
                const isOnline = act && !isAway && !isTesting && !isStale;

                return (
                  <div
                    key={student.id}
                    onClick={() => {
                      setModalSelectedIds((prev) =>
                        isSelected ? prev.filter((id) => id !== student.id) : [...prev, student.id]
                      );
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 select-none ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 border-indigo-600 scale-[1.02]'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {student.grade}
                      </span>

                      {/* 실시간 상태 표시 점 */}
                      {isAway ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" title="자리 이탈 중" />
                      ) : isTesting ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-400" title="시험 중" />
                      ) : isOnline ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="접속/학습 중" />
                      ) : null}
                    </div>

                    <div className="font-black text-sm truncate flex items-center justify-between">
                      <span>{student.name}</span>
                      {isSelected && <Check size={16} className="text-white shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 모달 푸터 */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="text-xs text-slate-600 font-bold">
                선택된 인원: <strong className="text-indigo-600 text-sm font-black">{modalSelectedIds.length}명</strong> / 전체 {allStudents.length}명
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSelectModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApplySelection}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                >
                  ✓ 모니터링 적용하기 ({modalSelectedIds.length}명)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. 🚨 학생 자리 이탈(딴짓) 히스토리 로그 & 상담 리포트 모달
      ───────────────────────────────────────────────────────────── */}
      {selectedStudentForLogs && (() => {
        const student = selectedStudentForLogs;
        const studentAllLogs = awayLogs
          .filter((l) => l.student_id === student.id)
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        const todayStr = new Date().toISOString().slice(0, 10);
        const studentTodayLogs = studentAllLogs.filter((l) => l.started_at.startsWith(todayStr));
        const displayedLogs = logsDateTab === 'today' ? studentTodayLogs : studentAllLogs;

        const totalCount = displayedLogs.length;
        const totalSec = displayedLogs.reduce((acc, l) => acc + l.duration_sec, 0);
        const totalMin = Math.floor(totalSec / 60);
        const remSec = totalSec % 60;
        const focusScore = Math.max(30, Math.min(100, Math.round(100 - (totalSec / 3600) * 100)));

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              
              {/* 모달 헤더 */}
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>{student.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-200/80 text-slate-700 font-bold">
                        {student.grade}
                      </span>
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        자리 이탈(딴짓) 기록부
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      학생이 시험/학습 화면을 벗어나 타 사이트/앱으로 딴짓한 시간과 내역입니다.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudentForLogs(null)}
                  className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 통계 요약 카드 & 탭 필터 */}
              <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 space-y-4">
                {/* 탭 버튼 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setLogsDateTab('today')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        logsDateTab === 'today'
                          ? 'bg-white text-slate-900 shadow-xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 오늘 기록 ({studentTodayLogs.length})
                    </button>
                    <button
                      onClick={() => setLogsDateTab('all')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        logsDateTab === 'all'
                          ? 'bg-white text-slate-900 shadow-xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🗂️ 전체/보관 기록 ({studentAllLogs.length})
                    </button>
                  </div>

                  {/* 오늘 기록 일괄 정리 버튼 (오늘 탭이고 기록 있을 때) */}
                  {logsDateTab === 'today' && studentTodayLogs.length > 0 && (
                    <button
                      onClick={() => handleClearTodayAwayLogs(student.id, student.name)}
                      className="text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-all"
                      title="보관된 기록을 제외한 오늘의 딴짓 기록을 일괄 정리합니다"
                    >
                      <Trash2 size={13} />
                      <span>오늘 기록 정리</span>
                    </button>
                  )}
                </div>

                {/* 통계 3단 지표 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-center">
                    <div className="text-[11px] font-bold text-slate-500 mb-0.5">이탈 횟수</div>
                    <div className="text-lg font-black text-slate-900 font-mono">
                      {totalCount}<span className="text-xs font-normal text-slate-500 ml-0.5">회</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-center">
                    <div className="text-[11px] font-bold text-amber-700 mb-0.5">총 딴짓 누적 시간</div>
                    <div className="text-lg font-black text-amber-900 font-mono">
                      {totalMin > 0 ? `${totalMin}분 ` : ''}{remSec}<span className="text-xs font-normal text-amber-700 ml-0.5">초</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 text-center">
                    <div className="text-[11px] font-bold text-emerald-700 mb-0.5">학습 집중도 지수</div>
                    <div className="text-lg font-black text-emerald-700 font-mono">
                      {focusScore}<span className="text-xs font-normal text-emerald-600 ml-0.5">점</span>
                    </div>
                  </div>
                </div>

                {/* 학부모 상담용 카톡 리포트 복사 버튼 */}
                <button
                  onClick={() => handleCopyConsultationMessage(student, displayedLogs)}
                  disabled={displayedLogs.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Copy size={15} />
                  <span>📋 학부모 상담용 카톡 리포트 문구 복사</span>
                </button>
              </div>

              {/* 타임라인 목록 */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
                {displayedLogs.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center text-slate-400">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2">
                      <Sparkles size={24} />
                    </div>
                    <p className="text-sm font-black text-slate-700">기록된 딴짓 내역이 없습니다</p>
                    <p className="text-xs text-slate-400 mt-1">학생이 딴짓하지 않고 아주 성실하게 집중하고 있습니다! 🎉</p>
                  </div>
                ) : (
                  displayedLogs.map((log) => {
                    const startStr = new Date(log.started_at).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });
                    const endStr = new Date(log.ended_at).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });
                    const dateStr = new Date(log.started_at).toLocaleDateString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                    });
                    const m = Math.floor(log.duration_sec / 60);
                    const s = log.duration_sec % 60;
                    const durText = m > 0 ? `${m}분 ${s}초` : `${s}초`;

                    return (
                      <div
                        key={log.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          log.is_archived
                            ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {logsDateTab === 'all' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {dateStr}
                              </span>
                            )}
                            <span className="font-mono text-xs font-bold text-slate-700">
                              {startStr} ~ {endStr}
                            </span>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                              log.duration_sec >= 60
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              ⏱️ {durText} 이탈
                            </span>
                            {log.is_archived && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-600 text-white flex items-center gap-1">
                                <Lock size={10} />
                                상담용 보관
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate">
                            <span className="text-slate-400 font-normal">위치: </span>
                            {log.location_title || log.context || '화면 이탈'}
                          </p>
                        </div>

                        {/* 보관 / 삭제 버튼 */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleToggleArchiveAwayLog(log.id)}
                            className={`p-2 rounded-xl transition-all ${
                              log.is_archived
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={log.is_archived ? '보관 해제' : '상담용 영구 보관 (일괄 정리 시 삭제 안 됨)'}
                          >
                            {log.is_archived ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                          <button
                            onClick={() => handleDeleteAwayLog(log.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                            title="이 기록 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 모달 푸터 */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                  ※ 3초 이상 에듀이스트 화면을 벗어나 타 브라우저/앱을 사용했을 때 자동 집계됩니다.
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedStudentForLogs(null)}
                  className="px-5 py-2 rounded-xl bg-slate-800 text-white text-xs font-black hover:bg-slate-900 transition-all ml-auto"
                >
                  닫기
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
