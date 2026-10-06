'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface StudentActivity {
  student_id: string;
  student_name: string;
  student_grade: string;
  mode: 'library' | 'review' | 'homework' | 'idle' | 'test';
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
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'AWAY' | 'TESTING' | 'OFFLINE'>('ALL');
  const [searchName, setSearchName] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // 실시간 활동 맵 (student_id -> StudentActivity)
  const [liveMap, setLiveMap] = useState<Record<string, StudentActivity>>({});
  const prevAwayMapRef = useRef<Record<string, boolean>>({});

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
            location_title: `시험: ${p.exam_title || p.bundle_title || '테스트'}`,
            is_away: isAway,
            exam_title: p.exam_title,
            bundle_title: p.bundle_title,
            round: p.round,
            question_idx: p.question_idx,
            total_questions: p.total_questions,
            test_status: p.test_status,
            test_remaining_sec: p.test_remaining_sec,
            updated_at: p.updated_at || new Date().toISOString(),
          },
        };
      });
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        // 접속 시 학생들에게 현재 위치 핑 요청
        channel.send({
          type: 'broadcast',
          event: 'ping_students',
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

  // 통계 계산
  const stats = React.useMemo(() => {
    let onlineCount = 0;
    let awayCount = 0;
    let testingCount = 0;
    let offlineCount = 0;

    allStudents.forEach((st) => {
      const act = liveMap[st.id];
      if (!act) {
        offlineCount++;
        return;
      }

      // 최근 15분 이상 아무 신호가 없으면 오프라인 간주
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
      total: allStudents.length,
      online: onlineCount,
      away: awayCount,
      testing: testingCount,
      offline: offlineCount,
    };
  }, [allStudents, liveMap, currentTime]);

  // 필터링된 학생 목록
  const filteredStudents = React.useMemo(() => {
    return allStudents.filter((st) => {
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
  }, [allStudents, liveMap, gradeFilter, statusFilter, searchName, currentTime]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-[1700px] mx-auto min-h-screen">
      
      {/* 1. 상단 타이틀 & 전역 컨트롤 바 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Eye className="text-indigo-600" size={24} />
              일상 모니터링 센터
            </h1>
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 font-black rounded-lg border border-indigo-100">
              상시 학습 & 딴짓 방지
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
            학생들의 현재 학습 메뉴(라이브러리·복습·숙제), 구체적 문제 위치, 체류 시간을 실시간 감시하며 외부 사이트 이탈을 즉각 포착합니다.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* 소리 알림 토글 */}
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              soundEnabled
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? '이탈 경보음 켜짐' : '경보음 묵음'}</span>
          </button>

          {/* OS 알림 권한 */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                Notification.requestPermission();
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
          >
            <Bell size={16} />
            <span>OS 알림</span>
          </button>

          {/* 실시간 핑 새로고침 */}
          <button
            onClick={handleRequestPing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-xs"
            title="접속 중인 모든 학생에게 즉각 현재 상태 보고 요청"
          >
            <RefreshCw size={15} />
            <span>상태 동기화</span>
          </button>
        </div>
      </div>

      {/* 2. 상태 요약 카드 5종 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 md:gap-4">
        {/* 전체 학생 */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-[1.02]'
              : 'bg-white text-slate-800 border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-70">전체 학생</span>
            <Users size={16} className="opacity-70" />
          </div>
          <div className="text-2xl md:text-3xl font-black">{stats.total}명</div>
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
          <div className="text-2xl md:text-3xl font-black text-emerald-600 ${statusFilter === 'ONLINE' ? '!text-white' : ''}">
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
            <span className="text-xs font-bold text-rose-600 ${statusFilter === 'AWAY' ? '!text-white' : ''}">
              🚨 자리 이탈 (딴짓)
            </span>
            <AlertTriangle size={16} className="text-rose-500 ${statusFilter === 'AWAY' ? '!text-white' : ''}" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-rose-600 ${statusFilter === 'AWAY' ? '!text-white' : ''}">
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
          <div className="text-2xl md:text-3xl font-black text-violet-600 ${statusFilter === 'TESTING' ? '!text-white' : ''}">
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
      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center text-slate-400 font-bold">
          해당 조건의 학생이 없습니다.
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
                className={`rounded-3xl border transition-all duration-300 p-5 flex flex-col justify-between relative overflow-hidden bg-white shadow-xs ${
                  isAway
                    ? 'border-rose-400 ring-2 ring-rose-300/60 bg-rose-50/20 shadow-rose-100 shadow-md'
                    : isTesting
                    ? 'border-violet-300 ring-1 ring-violet-200 bg-violet-50/15'
                    : isOnline
                    ? 'border-emerald-200 hover:border-emerald-300 hover:shadow-md'
                    : 'border-slate-200/70 bg-slate-50/50 opacity-60'
                }`}
              >
                {/* 상단: 학생 기본 정보 & 상태 뱃지 */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900">{st.name}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                        {st.grade}
                      </span>
                    </div>

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
                          {act?.test_remaining_sec !== undefined && (
                            <span className="font-mono text-violet-900 font-black">
                              남은 시간: {Math.floor(act.test_remaining_sec / 60)}분 {act.test_remaining_sec % 60}초
                            </span>
                          )}
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
                          ) : (
                            <Laptop size={14} className="text-slate-500" />
                          )}
                          <span className="font-black text-slate-700">
                            {act?.mode === 'library'
                              ? '라이브러리'
                              : act?.mode === 'review'
                              ? '복습(Review)'
                              : act?.mode === 'homework'
                              ? '숙제'
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
    </div>
  );
}
