'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FileCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Student {
  id: string;
  name: string;
  grade: string;
  test_status?: 'IDLE' | 'TESTING' | 'AWAY' | 'PAUSED' | 'FINISHED';
  test_remaining_sec?: number;
  updated_at?: string;
  last_away_at?: string;
  current_exam_title?: string;
  current_bundle_title?: string;
  current_round?: number;
  current_question_idx?: number;
  total_questions?: number;
}

interface RealtimeProctorTabProps {
  allStudents: Student[];
}

export default function RealtimeProctorTab({ allStudents }: RealtimeProctorTabProps) {
  // 모니터링 활성화 여부
  const [isMonitoring, setIsMonitoring] = useState(false);

  // 모니터링 대상 학생 ID 목록
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [searchName, setSearchName] = useState('');

  // 실시간 학생 상태 맵 (ID -> Student + Realtime Info)
  const [liveStudentsMap, setLiveStudentsMap] = useState<Record<string, Student>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [recentAwayStudentName, setRecentAwayStudentName] = useState<string | null>(null);

  const prevStatusesRef = useRef<Record<string, string>>({});
  const isInitializedRef = useRef(false);

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

  // 초기 학생 데이터 로드
  useEffect(() => {
    const fetchStudentsData = async () => {
      const { data } = await supabase.from('students').select('*');
      if (data) {
        const map: Record<string, Student> = {};
        data.forEach((s: any) => {
          map[s.id] = {
            id: s.id,
            name: s.name,
            grade: s.grade,
            test_status: s.test_status || 'IDLE',
            test_remaining_sec: s.test_remaining_sec || 0,
            updated_at: s.updated_at,
            last_away_at: s.last_away_at,
          };
          prevStatusesRef.current[s.id] = s.test_status || 'IDLE';
        });
        setLiveStudentsMap(map);
        isInitializedRef.current = true;
      }
    };

    fetchStudentsData();

    // 1초마다 현재 시각 갱신 (남은 시간 실시간 렌더링용)
    const clock = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  // 📡 Supabase Realtime 채널 구독 (Broadcast + Postgres Changes)
  useEffect(() => {
    const channel = supabase
      .channel('proctoring_room')
      // 1) 학생의 실시간 브로드캐스트 패킷 (회차/문항/상태 0.1초 반응)
      .on('broadcast', { event: 'proctor_sync' }, (payload: any) => {
        const p = payload.payload;
        if (!p || !p.student_id) return;

        setLiveStudentsMap(prev => {
          const existing = prev[p.student_id] || { id: p.student_id, name: p.student_name, grade: p.student_grade };
          const prevStatus = prevStatusesRef.current[p.student_id];

          // 이탈 감지 시 경보
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
              current_exam_title: p.exam_title,
              current_bundle_title: p.bundle_title,
              current_round: p.round,
              current_question_idx: p.question_idx,
              total_questions: p.total_questions,
              updated_at: p.updated_at,
            },
          };
        });
      })
      // 2) Postgres DB 테이블 변경 감지 (백업 및 DB 직접 업데이트 대응)
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
              last_away_at: student.last_away_at,
              updated_at: student.updated_at,
            },
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playAlertSound, triggerOsNotification]);

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
      // 1) DB 상태 TESTING으로 갱신
      await supabase
        .from('students')
        .update({
          test_status: 'TESTING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId);

      // 2) Realtime 채널로 즉시 잠금 해제 브로드캐스트 발송
      const channel = supabase.channel('proctoring_room');
      await channel.send({
        type: 'broadcast',
        event: 'unlock_student',
        payload: { studentId },
      });

      // 로컬 상태 즉시 반영
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

  // 실시간 남은 시간 계산
  const getCalculatedRemainingTime = (s: Student) => {
    if (s.test_remaining_sec === undefined || s.test_remaining_sec === null) return 0;
    if (s.test_status === 'IDLE' || s.test_status === 'FINISHED') return 0;
    // AWAY나 PAUSED일 때는 멈춘 시간 그대로
    if (s.test_status !== 'TESTING') {
      return s.test_remaining_sec;
    }
    // TESTING 중일 때는 마지막 동기화 이후 경과한 시간만큼 차감
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

  // 모니터링 대상 학생 객체 배열
  const monitoringStudents: Student[] = selectedStudentIds
    .map(id => liveStudentsMap[id] || allStudents.find(s => s.id === id))
    .filter(Boolean) as Student[];

  // 상태 통계 카운터
  const counts = {
    total: monitoringStudents.length,
    testing: monitoringStudents.filter(s => s.test_status === 'TESTING').length,
    away: monitoringStudents.filter(s => s.test_status === 'AWAY').length,
    idle: monitoringStudents.filter(s => !s.test_status || s.test_status === 'IDLE').length,
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
        <div className="flex items-center gap-2 shrink-0">
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
            <button
              onClick={() => setIsMonitoring(false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-900 text-white transition-colors"
            >
              <Users size={15} />
              <span>학생 다시 선택</span>
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. 모드 1: 모니터링할 학생 선택 패널 (isMonitoring === false)
      ───────────────────────────────────────────────────────────── */}
      {!isMonitoring ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-800">
              Step 1. 모니터링할 학생을 선택하세요
            </h3>
            <p className="text-xs text-slate-400">
              선택한 학생들의 시험 응시 화면 진도와 이탈 여부를 실시간 집중 감독합니다.
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
              const isTesting = live.test_status === 'TESTING';
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
              const remainingSec = getCalculatedRemainingTime(live);

              return (
                <div
                  key={student.id}
                  className={`rounded-3xl p-6 transition-all border flex flex-col justify-between relative overflow-hidden ${
                    isAway
                      ? 'bg-rose-50/70 border-2 border-rose-500 shadow-xl shadow-rose-100 ring-2 ring-rose-300'
                      : isTesting
                      ? 'bg-white border-violet-200 shadow-md hover:shadow-lg'
                      : isFinished
                      ? 'bg-blue-50/30 border-blue-200 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="space-y-4">
                    {/* 상단: 이름, 학년, 상태 뱃지 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-800">
                          {student.name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {student.grade}
                        </span>
                      </div>

                      {/* 상태 배지 */}
                      {isAway ? (
                        <span className="flex items-center gap-1 text-xs font-black text-rose-600 bg-rose-100 px-3 py-1 rounded-full border border-rose-200 animate-pulse">
                          <ShieldAlert size={14} />
                          화면 이탈 (잠김)
                        </span>
                      ) : isTesting ? (
                        <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          응시 중
                        </span>
                      ) : isFinished ? (
                        <span className="flex items-center gap-1 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                          <CheckCircle2 size={14} />
                          시험 완료
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                          시험 전 (대기)
                        </span>
                      )}
                    </div>

                    {/* 중간 1: 시험지 및 묶음 회차 정보 */}
                    <div className="space-y-1 bg-white/80 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 truncate">
                        <FileCheck size={14} className="text-violet-600 shrink-0" />
                        <span className="truncate">
                          {live.current_bundle_title 
                            ? `[${live.current_bundle_title}]` 
                            : live.current_exam_title || '배정 시험지 대기 중'}
                        </span>
                      </div>

                      {/* 🌟 회차 및 문항 번호 진도 표시 (요구사항 핵심!) */}
                      {isTesting || isAway ? (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1.5">
                            {live.current_round ? (
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
                      하단 액션: 이탈 시 [🔓 잠금 해제 승인] 버튼
                  ───────────────────────────────────────────────────────── */}
                  <div className="pt-4 mt-4 border-t border-slate-100">
                    {isAway ? (
                      <button
                        onClick={() => handleUnlockStudent(student.id)}
                        className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2 animate-bounce"
                      >
                        <Unlock size={15} />
                        <span>화면 잠금 해제 (시험 계속 승인)</span>
                      </button>
                    ) : isTesting ? (
                      <div className="text-center text-[11px] text-emerald-600 font-bold py-1">
                        ✓ 정상 응시 진행 중 (자동 감독 중)
                      </div>
                    ) : isFinished ? (
                      <div className="text-center text-[11px] text-blue-600 font-bold py-1">
                        ✓ 시험 완료됨
                      </div>
                    ) : (
                      <div className="text-center text-[11px] text-slate-400 font-medium py-1">
                        입장 대기 중
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
