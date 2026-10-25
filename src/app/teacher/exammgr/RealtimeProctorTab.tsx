'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Play, 
  Pause, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Volume2, 
  VolumeX, 
  Bell, 
  Unlock, 
  RefreshCw, 
  ArrowLeft, 
  Loader2, 
  BookOpen, 
  Layers,
  ChevronRight,
  FileCheck,
  X,
  Trash2,
  Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Student {
  id: string;
  name: string;
  grade: string;
  test_status?: 'IDLE' | 'TESTING' | 'AWAY' | 'PAUSED' | 'FINISHED';
  test_remaining_sec?: number;
  test_duration_min?: number;
  updated_at?: string;
  last_away_at?: string;
  current_exam_title?: string;
  current_bundle_title?: string;
  current_round?: number;
  current_question_idx?: number;
  total_questions?: number;
  enable_lockdown?: boolean; // 🌟 이탈방지 여부 (이탈방지 ON 시험만 시험감독 모니터링 대상)
}

interface RealtimeProctorTabProps {
  allStudents: Student[];
  initialStudentId?: string;
}

export default function RealtimeProctorTab({ allStudents, initialStudentId }: RealtimeProctorTabProps) {
  // 🌟 [세션 영구 보존] 모니터링 활성화 여부
  const [isMonitoring, setIsMonitoring] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eduest_proctor_is_active') === 'true';
    }
    return false;
  });

  // 🌟 [세션 영구 보존] 모니터링 대상 학생 ID 목록
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('eduest_proctor_selected_ids');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // 🌟 [일상 모니터링에서 넘어온 대상 학생 자동 등록 & 모니터링 활성화]
  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentIds(prev => prev.includes(initialStudentId) ? prev : [...prev, initialStudentId]);
      setIsMonitoring(true);
    }
  }, [initialStudentId]);

  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [searchName, setSearchName] = useState('');

  // 실시간 학생 상태 맵 (ID -> Student + Realtime Info)
  const [liveStudentsMap, setLiveStudentsMap] = useState<Record<string, Student>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [recentAwayStudentName, setRecentAwayStudentName] = useState<string | null>(null);

  const prevStatusesRef = useRef<Record<string, string>>({});
  const isInitializedRef = useRef(false);

  // 🌟 상태 변경 시 localStorage 동기화
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eduest_proctor_is_active', String(isMonitoring));
      localStorage.setItem('eduest_proctor_selected_ids', JSON.stringify(selectedStudentIds));
    }
  }, [isMonitoring, selectedStudentIds]);

  // 🔊 경보음 재생 (Web Audio API)
  const playAlertSound = useCallback((type: 'AWAY' | 'FINISHED') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'AWAY') {
        // 빰! 빰! 빰! - 긴급 3연타 경보
        [0, 0.25, 0.5].forEach(delay => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1100, ctx.currentTime + delay);
          osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + delay + 0.18);
          gain.gain.setValueAtTime(0.7, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.2);
        });
      } else if (type === 'FINISHED') {
        // 딩동 - 완료 멜로디
        [523, 659, 784, 1047].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
          gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.18);
          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.18);
        });
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }, [soundEnabled]);

  // 윈도우 OS 알림 발송
  const triggerOsNotification = useCallback((title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/favicon.ico' });
      } catch {}
    }
  }, []);

  // 🌟 [핵심 함수] 전체 학생 상태 로드 & 실시간 시험 상세 상태(/api/test2/proctor-state) 스캔
  const fetchStudentsData = useCallback(async () => {
    try {
      // 1) DB students 기본 상태 로드 (유효한 컬럼만 조회하여 DB 42703 에러 원천 방지)
      const { data: dbStudents } = await supabase
        .from('students')
        .select('id, name, grade, test_status, test_remaining_sec, test_duration_min, updated_at, last_away_at');

      // 2) 실시간 시험 상세 정보(/api/test2/proctor-state) 로드
      let activeStates: Record<string, any> = {};
      try {
        const res = await fetch('/api/test2/proctor-state');
        const json = await res.json();
        if (json.success && json.states) {
          activeStates = json.states;
        }
      } catch (e) {
        console.warn('Failed to fetch proctor states:', e);
      }

      if (dbStudents) {
        const map: Record<string, Student> = {};
        dbStudents.forEach((s: any) => {
          const pState = activeStates[s.id];
          map[s.id] = {
            id: s.id,
            name: s.name,
            grade: s.grade,
            test_status: pState?.test_status || s.test_status || 'IDLE',
            test_remaining_sec: pState?.test_remaining_sec !== undefined ? pState.test_remaining_sec : (s.test_remaining_sec || 0),
            test_duration_min: s.test_duration_min,
            current_exam_title: pState?.exam_title,
            current_bundle_title: pState?.bundle_title,
            current_round: pState?.round,
            current_question_idx: pState?.question_idx,
            total_questions: pState?.total_questions,
            enable_lockdown: pState?.enable_lockdown,
            updated_at: pState?.updated_at || s.updated_at,
            last_away_at: s.last_away_at,
          };
          prevStatusesRef.current[s.id] = map[s.id].test_status || 'IDLE';
        });
        setLiveStudentsMap(map);
        isInitializedRef.current = true;
      }
    } catch (err) {
      console.error('fetchStudentsData error:', err);
    }
  }, []);

  // 초기 학생 데이터 로드
  useEffect(() => {
    fetchStudentsData();

    // 1초마다 현재 시각 갱신
    const clock = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [fetchStudentsData]);

  // 📡 Supabase Realtime 채널 구독
  const channelRef = useRef<any>(null);
  useEffect(() => {
    const channel = supabase.channel('proctoring_room');
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'proctor_sync' }, (payload: any) => {
        const p = payload.payload;
        if (!p || !p.student_id) return;

        setLiveStudentsMap(prev => {
          const existing = prev[p.student_id] || { id: p.student_id, name: p.student_name, grade: p.student_grade };
          const prevStatus = prevStatusesRef.current[p.student_id];

          if (p.test_status === 'AWAY' && prevStatus !== 'AWAY') {
            playAlertSound('AWAY');
            setRecentAwayStudentName(p.student_name || existing.name);
            triggerOsNotification(`🚨 [자리 이탈] ${p.student_name || existing.name} 학생`, '시험 화면을 이탈하여 화면이 잠겼습니다.');
          }

          prevStatusesRef.current[p.student_id] = p.test_status;

          return {
            ...prev,
            [p.student_id]: {
              ...existing,
              test_status: p.test_status,
              test_remaining_sec: p.test_remaining_sec,
              current_exam_title: p.exam_title || existing.current_exam_title,
              current_bundle_title: p.bundle_title || existing.current_bundle_title,
              current_round: p.round || existing.current_round,
              current_question_idx: p.question_idx,
              total_questions: p.total_questions,
              enable_lockdown: p.enable_lockdown !== undefined ? p.enable_lockdown : existing.enable_lockdown,
              updated_at: p.updated_at,
            },
          };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, (payload: any) => {
        const student = payload.new;
        if (!student || !student.id) return;

        setLiveStudentsMap(prev => {
          const existing = prev[student.id] || { id: student.id, name: student.name, grade: student.grade };
          const prevStatus = prevStatusesRef.current[student.id];

          if (student.test_status === 'AWAY' && prevStatus !== 'AWAY') {
            playAlertSound('AWAY');
            setRecentAwayStudentName(student.name);
            triggerOsNotification(`🚨 [자리 이탈] ${student.name} 학생`, '시험 화면을 이탈하여 화면이 잠겼습니다.');
          } else if (student.test_status === 'FINISHED' && prevStatus !== 'FINISHED') {
            playAlertSound('FINISHED');
          }

          prevStatusesRef.current[student.id] = student.test_status;

          return {
            ...prev,
            [student.id]: {
              ...existing,
              test_status: student.test_status,
              test_remaining_sec: student.test_remaining_sec,
              test_duration_min: student.test_duration_min ?? existing.test_duration_min,
              last_away_at: student.last_away_at,
              updated_at: student.updated_at,
            },
          };
        });
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
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

  // 🌟 [사용자 요청] 시험 감독 화면 실시간 동기화 & 시험 응시 인원 전체 스캔
  const [isScanning, setIsScanning] = useState(false);
  const handleScanAndSyncProctor = async () => {
    setIsScanning(true);
    try {
      await fetchStudentsData();
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
    } catch (e) {
      console.error('Scan error:', e);
    } finally {
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  // 알림 권한 요청
  const handleRequestNotifPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification('Eduest 시험 모니터링', { body: '윈도우 알림 연결이 활성화되었습니다.' });
        }
      });
    }
  };

  // 🔓 선생님의 핵심 액션: [화면 잠금 해제 & 시험 계속 승인]
  const handleUnlockStudent = async (studentId: string) => {
    try {
      await supabase
        .from('students')
        .update({
          test_status: 'TESTING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId);

      const channel = supabase.channel('proctoring_room');
      await channel.send({
        type: 'broadcast',
        event: 'unlock_student',
        payload: { studentId },
      });

      setLiveStudentsMap(prev => {
        if (!prev[studentId]) return prev;
        return {
          ...prev,
          [studentId]: {
            ...prev[studentId],
            test_status: 'TESTING',
            updated_at: new Date().toISOString(),
          },
        };
      });

      prevStatusesRef.current[studentId] = 'TESTING';
      setRecentAwayStudentName(null);
    } catch (e) {
      console.error('Failed to unlock student:', e);
      alert('잠금 해제 처리 중 오류가 발생했습니다.');
    }
  };

  // 전체 잠금 해제
  const handleUnlockAll = async () => {
    const awayStudents = monitoringStudents.filter(s => s.test_status === 'AWAY');
    if (awayStudents.length === 0) {
      alert('잠금 상태인 학생이 없습니다.');
      return;
    }
    if (!confirm(`이탈 감지된 학생 ${awayStudents.length}명의 화면 잠금을 모두 해제하고 시험을 재개하시겠습니까?`)) {
      return;
    }

    for (const s of awayStudents) {
      await handleUnlockStudent(s.id);
    }
  };

  // 🌟 [사용자 요청] 모니터링 해제 (전체 초기화)
  const handleResetMonitoring = () => {
    if (confirm('현재 모니터링을 종료하고 학생 선택 목록을 초기화하시겠습니까?')) {
      setIsMonitoring(false);
      setSelectedStudentIds([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('eduest_proctor_is_active');
        localStorage.removeItem('eduest_proctor_selected_ids');
      }
    }
  };

  // 🌟 [사용자 요청] 개별 학생 모니터링 제외 (클릭미스 대응)
  const handleRemoveStudentFromMonitoring = (studentId: string, studentName: string) => {
    if (confirm(`'${studentName}' 학생을 모니터링 목록에서 제외하시겠습니까?`)) {
      setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
    }
  };

  // 🌟 [사용자 요청] 학생 상태 비상 리셋 (꼬인 학생 '시험 전(IDLE)' 상태로 초기화)
  const handleResetStudentStatus = async (studentId: string, studentName: string) => {
    if (!confirm(`'${studentName}' 학생의 시험 상태를 '시험 전 (대기)' 상태로 초기화하시겠습니까?`)) {
      return;
    }

    try {
      await supabase
        .from('students')
        .update({
          test_status: 'IDLE',
          test_remaining_sec: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId);

      setLiveStudentsMap(prev => {
        if (!prev[studentId]) return prev;
        return {
          ...prev,
          [studentId]: {
            ...prev[studentId],
            test_status: 'IDLE',
            test_remaining_sec: 0,
            current_exam_title: undefined,
            current_bundle_title: undefined,
            current_round: undefined,
            current_question_idx: undefined,
          },
        };
      });

      prevStatusesRef.current[studentId] = 'IDLE';
      alert(`'${studentName}' 학생의 상태가 '시험 전 (대기)'으로 초기화되었습니다.`);
    } catch (e) {
      console.error('Failed to reset student status:', e);
      alert('상태 초기화 중 오류가 발생했습니다.');
    }
  };

  // 실시간 남은 시간 계산
  const getCalculatedRemainingTime = (s: Student) => {
    if (s.test_remaining_sec === undefined || s.test_remaining_sec === null) return 0;
    if (s.test_status === 'IDLE' || s.test_status === 'FINISHED') return 0;
    if (s.test_status !== 'TESTING') {
      return s.test_remaining_sec;
    }
    if (!s.updated_at) return s.test_remaining_sec;
    const syncTime = new Date(s.updated_at).getTime();
    const elapsed = Math.floor((currentTime - syncTime) / 1000);
    return Math.max(0, s.test_remaining_sec - elapsed);
  };

  const formatSec = (sec: number) => {
    if (sec <= 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 🌟 [사용자 요청] '이탈방지(enable_lockdown)'가 걸린 시험지를 응시 중인 학생(TESTING 또는 AWAY)만 시험 감독 모니터링에 자동 포함!
  // (이탈방지가 없는 자율 시험지는 일상 모니터링에만 남고, 시험 감독 화면에는 자동 등록되지 않습니다)
  const activeLockdownTestingIds = useMemo(() => {
    return Object.keys(liveStudentsMap).filter(id => {
      const st = liveStudentsMap[id];
      if (!st) return false;
      const isTesting = st.test_status === 'TESTING' || st.test_status === 'AWAY';
      // 이탈방지(enable_lockdown)가 켜진 시험지인 경우에만 자동 감독 대상!
      return isTesting && Boolean(st.enable_lockdown);
    });
  }, [liveStudentsMap]);

  // 최종 모니터링 대상 ID 목록: 선생님이 수동 선택한 학생 + 이탈방지 시험 응시/이탈 중인 학생
  const effectiveMonitoringIds = useMemo(() => {
    const set = new Set(selectedStudentIds);
    activeLockdownTestingIds.forEach(id => set.add(id));
    return Array.from(set);
  }, [selectedStudentIds, activeLockdownTestingIds]);

  // 모니터링 대상 학생 객체 배열
  const monitoringStudents: Student[] = effectiveMonitoringIds
    .map(id => liveStudentsMap[id] || allStudents.find(s => s.id === id))
    .filter(Boolean) as Student[];

  const counts = {
    total: monitoringStudents.length,
    testing: monitoringStudents.filter(s => s.test_status === 'TESTING').length,
    away: monitoringStudents.filter(s => s.test_status === 'AWAY').length,
    idle: monitoringStudents.filter(s => !s.test_status || s.test_status === 'IDLE' || s.test_status === 'PAUSED').length,
    finished: monitoringStudents.filter(s => s.test_status === 'FINISHED').length,
  };

  // 학생 선택 패널용 필터링
  const filteredAllStudents = allStudents.filter(s => {
    const matchGrade = gradeFilter === 'ALL' || s.grade === gradeFilter;
    const matchName = s.name.toLowerCase().includes(searchName.toLowerCase());
    return matchGrade && matchName;
  });

  return (
    <div className="space-y-6">

      {/* ─────────────────────────────────────────────────────────────
          1. 상단 안내 헤더 & 컨트롤 바
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shadow-md shadow-rose-200 animate-pulse">
              <ShieldAlert size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              실시간 시험 감독 & 부정행위 방지 모니터링 센터
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            시험 중인 학생의 회차·문항 번호·남은 시간을 실시간 감시하고, 화면 이탈 시 즉시 잠금 및 경보를 제공합니다.
          </p>
        </div>

        {/* 툴바 컨트롤 */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* 🌟 [사용자 요청] 시험 감독 화면 실시간 상태 동기화 & 전체 인원 스캔 버튼 */}
          <button
            onClick={handleScanAndSyncProctor}
            disabled={isScanning}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer ${
              isScanning
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white hover:bg-violet-50 text-violet-700 border border-violet-200'
            }`}
            title="현재 시험 응시 중인 학생 전체 스캔 및 진행 상황 동기화"
          >
            <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? '시험 현황 스캔 중...' : '상태 동기화'}</span>
          </button>

          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              soundEnabled
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title="경보 사운드 켜기/끄기"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? '경보음 켜짐' : '음소거'}</span>
          </button>

          <button
            onClick={handleRequestNotifPermission}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="윈도우 바탕화면 알림 허용"
          >
            <Bell size={15} />
            <span>OS 알림 설정</span>
          </button>

          {isMonitoring && (
            <>
              <button
                onClick={() => setIsMonitoring(false)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="학생 추가/제외 편집"
              >
                <Users size={15} />
                <span>학생 추가/수정</span>
              </button>

              {/* 🌟 [사용자 요청] 모니터링 해제 (초기화) 버튼 */}
              <button
                onClick={handleResetMonitoring}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors shadow-xs"
                title="모니터링 전체 해제 및 초기화"
              >
                <RotateCcw size={15} />
                <span>모니터링 해제 (초기화)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. 모드 1: 모니터링할 학생 선택 패널 (isMonitoring === false)
      ───────────────────────────────────────────────────────────── */}
      {!isMonitoring ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6 shadow-sm">
          {/* 🌟 현재 시험 응시 중인 학생이 있을 경우 즉각 모니터링 알림 배너 */}
          {activeLockdownTestingIds.length > 0 && (
            <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 p-4 rounded-2xl text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-violet-500/20">
              <div className="flex items-center gap-3">
                <Sparkles size={20} className="text-amber-300 animate-bounce" />
                <div>
                  <p className="text-sm font-black">
                    현재 {activeLockdownTestingIds.length}명의 학생이 이탈방지 시험에 응시 중입니다!
                  </p>
                  <p className="text-[11px] text-violet-200">
                    실시간 시험 모니터링 화면으로 바로 진입하여 학생들의 진행 상태를 확인하세요.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMonitoring(true)}
                className="px-5 py-2.5 bg-white text-violet-700 hover:bg-violet-50 rounded-xl text-xs font-black transition-all shadow-sm shrink-0 cursor-pointer"
              >
                실시간 모니터링 바로가기 →
              </button>
            </div>
          )}

          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-800">
              Step 1. 모니터링할 학생을 선택하세요
            </h3>
            <p className="text-xs text-slate-400">
              선택한 학생들의 시험 응시 화면 진도와 이탈 여부를 실시간 집중 감독합니다. (다른 화면으로 이동해도 선택 내역이 유지됩니다)
            </p>
          </div>

          {/* 필터 및 검색 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
              >
                {['ALL', '중1', '중2', '중3', '고1', '고2', '고3'].map(g => (
                  <option key={g} value={g}>{g === 'ALL' ? '전체 학년' : g}</option>
                ))}
              </select>

              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-3 text-slate-400" size={15} />
                <input
                  type="text"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  placeholder="학생 이름 검색..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  const currentIds = filteredAllStudents.map(s => s.id);
                  setSelectedStudentIds(prev => Array.from(new Set([...prev, ...currentIds])));
                }}
                className="text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg bg-violet-50"
              >
                목록 전체 선택
              </button>
              <button
                type="button"
                onClick={() => setSelectedStudentIds([])}
                className="text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg bg-slate-100"
              >
                선택 초기화
              </button>
            </div>
          </div>

          {/* 학생 체크 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto p-2 border border-slate-100 rounded-2xl bg-slate-50/50">
            {filteredAllStudents.map(student => {
              const isSelected = selectedStudentIds.includes(student.id);
              const live = liveStudentsMap[student.id] || student;
              const hasActiveExam = Boolean(live.current_exam_title || live.current_bundle_title);
              const isTesting = live.test_status === 'TESTING' && hasActiveExam;
              const isAway = live.test_status === 'AWAY';

              return (
                <div
                  key={student.id}
                  onClick={() => {
                    setSelectedStudentIds(prev =>
                      isSelected ? prev.filter(id => id !== student.id) : [...prev, student.id]
                    );
                  }}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 select-none ${
                    isSelected
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-200 border-violet-600 scale-[1.02]'
                      : 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {student.grade}
                    </span>

                    {/* 실시간 힌트 점 */}
                    {isAway ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" title="화면 이탈 상태" />
                    ) : isTesting ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="시험 응시 중" />
                    ) : null}
                  </div>

                  <div className="font-black text-sm truncate">
                    {student.name}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 선택 하단 바 & 시작 버튼 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 font-medium">
              선택된 학생: <strong className="text-violet-700 font-black text-sm">{selectedStudentIds.length}명</strong>
            </div>

            <button
              onClick={() => {
                if (selectedStudentIds.length === 0) {
                  alert('모니터링할 학생을 최소 1명 이상 선택해주세요.');
                  return;
                }
                setIsMonitoring(true);
              }}
              disabled={selectedStudentIds.length === 0}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-black text-sm transition-all shadow-xl shadow-violet-200 flex items-center justify-center gap-2"
            >
              <Play size={18} fill="currentColor" />
              <span>실시간 모니터링 시작 ({selectedStudentIds.length}명)</span>
            </button>
          </div>
        </div>
      ) : (

        /* ─────────────────────────────────────────────────────────────
            3. 모드 2: 실시간 모니터링 대시보드 화면 (isMonitoring === true)
        ───────────────────────────────────────────────────────────── */
        <div className="space-y-6">
          
          {/* 상태 요약 배지 바 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">모니터링 인원</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{counts.total}명</p>
              </div>
              <Users className="text-slate-300" size={24} />
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">🟢 시험 진행 중</p>
                <p className="text-2xl font-black text-emerald-700 mt-0.5">{counts.testing}명</p>
              </div>
              <Clock className="text-emerald-400" size={24} />
            </div>

            <div className={`p-4 rounded-2xl border shadow-xs flex items-center justify-between transition-all ${
              counts.away > 0 
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400 animate-pulse' 
                : 'bg-white border-slate-200'
            }`}>
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest ${
                  counts.away > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}>
                  🚨 화면 이탈 (잠김)
                </p>
                <p className={`text-2xl font-black mt-0.5 ${
                  counts.away > 0 ? 'text-rose-600' : 'text-slate-800'
                }`}>
                  {counts.away}명
                </p>
              </div>
              <ShieldAlert className={counts.away > 0 ? 'text-rose-500' : 'text-slate-300'} size={24} />
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">⚪ 시험 전 (대기)</p>
                <p className="text-2xl font-black text-slate-600 mt-0.5">{counts.idle}명</p>
              </div>
              <RotateCcw className="text-slate-300" size={24} />
            </div>

            <div className="bg-white p-4 rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest">🔵 시험 완료</p>
                <p className="text-2xl font-black text-blue-700 mt-0.5">{counts.finished}명</p>
              </div>
              <CheckCircle2 className="text-blue-400" size={24} />
            </div>
          </div>

          {/* 이탈 감지 긴급 알림 배너 */}
          {counts.away > 0 && (
            <div className="p-4 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-200 flex flex-col sm:flex-row items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-3">
                <ShieldAlert size={26} />
                <div>
                  <h4 className="text-sm font-black">
                    🚨 화면 이탈 학생 감지! ({counts.away}명 시험 화면 잠김)
                  </h4>
                  <p className="text-xs text-rose-100">
                    부정행위 방지를 위해 학생 화면이 잠겼으며 시간이 일시정지되었습니다. 확인 후 잠금 해제를 승인해주세요.
                  </p>
                </div>
              </div>
              <button
                onClick={handleUnlockAll}
                className="px-4 py-2 rounded-xl bg-white text-rose-600 hover:bg-rose-50 font-black text-xs transition-colors shrink-0 shadow-xs"
              >
                전체 일괄 잠금 해제 승인
              </button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────
              실시간 학생 카드 그리드
          ───────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {monitoringStudents.map(student => {
              const live = liveStudentsMap[student.id] || student;
              const status = live.test_status || 'IDLE';
              const isAway = status === 'AWAY';
              const isTesting = status === 'TESTING';
              const isFinished = status === 'FINISHED';
              const isTreasure = Boolean(live.current_exam_title?.includes('보물') || live.current_exam_title?.includes('보물회수') || (live as any).is_treasure_hunt);
              const remainingSec = getCalculatedRemainingTime(live);

              return (
                <div
                  key={student.id}
                  className={`rounded-3xl p-6 transition-all border flex flex-col justify-between relative overflow-hidden ${
                    isAway
                      ? 'bg-rose-50/70 border-2 border-rose-500 shadow-xl shadow-rose-100 ring-2 ring-rose-300'
                      : isTreasure && isTesting
                      ? 'bg-gradient-to-br from-amber-50/60 via-white to-yellow-50/40 border-2 border-amber-400 shadow-lg shadow-amber-500/10 ring-2 ring-amber-300/40'
                      : isTesting
                      ? 'bg-white border-violet-200 shadow-md hover:shadow-lg'
                      : isFinished
                      ? 'bg-blue-50/30 border-blue-200 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="space-y-4">
                    {/* 상단: 이름, 학년, 상태 뱃지, 개별 제외 버튼 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-800">
                          {student.name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {student.grade}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* 상태 배지 */}
                        {isAway ? (
                          <span className="flex items-center gap-1 text-xs font-black text-rose-600 bg-rose-100 px-3 py-1 rounded-full border border-rose-200 animate-pulse">
                            <ShieldAlert size={14} />
                            {isTreasure ? '보물회수 이탈 (잠김)' : '화면 이탈 (잠김)'}
                          </span>
                        ) : isTesting ? (
                          isTreasure ? (
                            <span className="flex items-center gap-1.5 text-xs font-black text-amber-950 bg-gradient-to-r from-amber-200 to-yellow-200 px-3 py-1 rounded-full border border-amber-300 shadow-xs animate-pulse">
                              <Sparkles size={13} className="text-amber-700 fill-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
                              💎 보물회수 중
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              응시 중
                            </span>
                          )
                        ) : isFinished ? (
                          <span className="flex items-center gap-1 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                            <CheckCircle2 size={14} />
                            {isTreasure ? '보물회수 완료' : '시험 완료'}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                            시험 전 (대기)
                          </span>
                        )}

                        {/* 🌟 [사용자 요청] 개별 학생 모니터링 제외 버튼 (클릭미스 시 제거) */}
                        <button
                          type="button"
                          onClick={() => handleRemoveStudentFromMonitoring(student.id, student.name)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors ml-1"
                          title="이 학생 모니터링에서 제외"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    {/* 중간 1: 시험지 및 묶음 회차 정보 */}
                    <div className="space-y-1 bg-white/80 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 truncate">
                        <FileCheck size={14} className="text-violet-600 shrink-0" />
                        <span className="truncate">
                          {live.current_bundle_title 
                            ? `[${live.current_bundle_title}] ${live.current_exam_title || ''}` 
                            : live.current_exam_title || (isTesting ? '시험 진행 중' : '배정 시험지 대기 중')}
                        </span>
                      </div>

                      {/* 진도 표시: 실제 시험 중이거나 이탈 상태일 때만 */}
                      {isTesting || isAway ? (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1.5">
                            {isTreasure ? (
                              <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 rounded-md font-black text-[11px] shadow-2xs">
                                💎 {live.current_round ? `${live.current_round}회차` : '보물회수'}
                              </span>
                            ) : live.current_round ? (
                              <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-md font-black text-[11px]">
                                제 {live.current_round}회
                              </span>
                            ) : null}
                            <span className="font-black text-slate-800 text-sm">
                              {live.current_question_idx ? `${live.current_question_idx}번 풀이 중` : '문제 풀이 중'}
                            </span>
                          </div>

                          {live.total_questions ? (
                            <span className="text-[11px] text-slate-400 font-bold">
                              ({live.current_question_idx || 1} / {live.total_questions})
                            </span>
                          ) : null}
                        </div>
                      ) : isFinished ? (
                        <p className="text-xs text-blue-600 font-bold pt-1">
                          답안 제출이 완료되었습니다.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 pt-1">
                          아직 시험을 시작하지 않았습니다.
                        </p>
                      )}
                    </div>

                    {/* 중간 2: 실시간 남은 시간 표시 */}
                    {(isTesting || isAway) && (
                      <div className={`p-3 rounded-2xl flex items-center justify-between border ${
                        isAway 
                          ? 'bg-rose-100/50 border-rose-200 text-rose-700' 
                          : remainingSec < 300 
                          ? 'bg-amber-50 border-amber-200 text-amber-700' 
                          : 'bg-slate-50 border-slate-100 text-slate-700'
                      }`}>
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <Clock size={15} />
                          <span>{isAway ? '일시정지된 시간' : '남은 제한시간'}</span>
                        </div>
                        <span className="font-mono font-black text-base tracking-wider">
                          {formatSec(remainingSec)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ─────────────────────────────────────────────────────────
                      하단 액션: [잠금 해제] 또는 [상태 리셋] 버튼
                  ───────────────────────────────────────────────────────── */}
                  <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
                    {isAway ? (
                      <button
                        onClick={() => handleUnlockStudent(student.id)}
                        className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2 animate-bounce"
                      >
                        <Unlock size={15} />
                        <span>화면 잠금 해제 (시험 계속 승인)</span>
                      </button>
                    ) : isTesting ? (
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-emerald-600 font-bold py-1">
                          ✓ 정상 응시 진행 중 (자동 감독 중)
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetStudentStatus(student.id, student.name)}
                          className="text-[11px] text-slate-400 hover:text-rose-600 underline"
                          title="상태를 대기로 리셋"
                        >
                          대기로 리셋
                        </button>
                      </div>
                    ) : isFinished ? (
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-blue-600 font-bold py-1">
                          ✓ 시험 완료됨
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetStudentStatus(student.id, student.name)}
                          className="text-[11px] text-slate-400 hover:text-rose-600 underline"
                          title="상태를 대기로 리셋"
                        >
                          대기로 리셋
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 py-1">
                        <span>입장 대기 중</span>
                        <button
                          type="button"
                          onClick={() => handleResetStudentStatus(student.id, student.name)}
                          className="hover:text-violet-600 underline"
                          title="상태 초기화 확인"
                        >
                          상태 동기화
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
