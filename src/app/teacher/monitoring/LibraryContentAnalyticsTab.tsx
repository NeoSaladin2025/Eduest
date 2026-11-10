'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Library,
  Folder,
  Clock,
  Users,
  Flame,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Download,
  RotateCcw,
  Search,
  BookOpen,
  Layers,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { formatDurationKo, StudentHomeStudyDayRecord } from '@/lib/homeStudyTypes';

interface LibraryFolderItem {
  id?: string;
  drive_id: string;
  name: string;
  grade: string;
  parent_id?: string | null;
  type?: string;
}

interface FolderStat {
  folderKey: string;
  folderName: string;
  pathString: string;
  grade: string;
  totalDurationSec: number;
  uniqueStudents: Set<string>;
  totalViews: number;
  lastViewedDate?: string;
  status: 'hot' | 'steady' | 'cold' | 'inactive';
}

const GRADES = ['전체', '고2', '고1', '중3', '중2', '중1'];

export default function LibraryContentAnalyticsTab() {
  const [selectedGrade, setSelectedGrade] = useState<string>('고2');
  const [selectedDays, setSelectedDays] = useState<number>(30); // 7, 14, 30
  const [sortBy, setSortBy] = useState<'duration' | 'students' | 'inactive'>('duration');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [rawSessions, setRawSessions] = useState<StudentHomeStudyDayRecord[]>([]);
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolderItem[]>([]);

  // 1. 데이터 로드 (세션 30일치 + 라이브러리 폴더 목록)
  const fetchData = async () => {
    setLoading(true);
    try {
      const targetGrade = selectedGrade === '전체' ? '고2' : selectedGrade;
      const [sessionsRes, libRes] = await Promise.all([
        fetch(`/api/monitoring/home-study/sessions?days=${selectedDays}`),
        fetch(`/api/drive/library?grade=${encodeURIComponent(targetGrade)}`),
      ]);

      const sessionsData = await sessionsRes.json();
      if (sessionsData.success && Array.isArray(sessionsData.records)) {
        setRawSessions(sessionsData.records);
      }

      const libData = await libRes.json();
      if (libData.items && Array.isArray(libData.items)) {
        setLibraryFolders(libData.items);
      }
    } catch (err) {
      console.error('Failed to load library analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedGrade, selectedDays]);

  // 2. 라이브러리 열람 활동 집계
  const { folderStats, inactiveFolders, maxDuration, totalPureSec, activeCount, inactiveCount } = useMemo(() => {
    // 필터링 대상 레코드 (학년)
    const targetRecords = selectedGrade === '전체'
      ? rawSessions
      : rawSessions.filter(r => r.student_grade && r.student_grade.startsWith(selectedGrade));

    const statMap: Record<string, FolderStat> = {};

    // DB의 실제 폴더들 먼저 기본 초기화
    libraryFolders.forEach(folder => {
      statMap[folder.name] = {
        folderKey: folder.drive_id,
        folderName: folder.name,
        pathString: folder.name,
        grade: folder.grade || selectedGrade,
        totalDurationSec: 0,
        uniqueStudents: new Set<string>(),
        totalViews: 0,
        status: 'inactive',
      };
    });

    // 학생 세션 로그 파싱 및 가산
    let totalSec = 0;
    targetRecords.forEach(r => {
      (r.sessions || []).forEach(ses => {
        (ses.activities || []).forEach(act => {
          if (act.mode === 'library' && act.duration_sec > 0) {
            totalSec += act.duration_sec;

            // title 파싱: "라이브러리 > [folderName] > [docName]" 또는 "라이브러리 > path"
            let cleanName = act.title.replace(/^라이브러리\s*>\s*/i, '').trim();
            // "[folderName] > docName" 형태면 폴더명 추출
            const bracketMatch = cleanName.match(/^\[(.*?)\]/);
            let targetFolder = cleanName;
            if (bracketMatch) {
              targetFolder = bracketMatch[1];
            } else if (cleanName.includes('>')) {
              targetFolder = cleanName.split('>')[0].trim();
            }

            if (!targetFolder || targetFolder === '홈 화면') return;

            if (!statMap[targetFolder]) {
              statMap[targetFolder] = {
                folderKey: targetFolder,
                folderName: targetFolder,
                pathString: cleanName,
                grade: r.student_grade,
                totalDurationSec: 0,
                uniqueStudents: new Set<string>(),
                totalViews: 0,
                status: 'inactive',
              };
            }

            statMap[targetFolder].totalDurationSec += act.duration_sec;
            statMap[targetFolder].uniqueStudents.add(r.student_name);
            statMap[targetFolder].totalViews += 1;
            statMap[targetFolder].lastViewedDate = r.date;
          }
        });
      });
    });

    // 상태 판별 (Hot / Steady / Cold / Inactive)
    const allStats = Object.values(statMap);
    let maxDur = 1;
    allStats.forEach(s => {
      if (s.totalDurationSec > maxDur) maxDur = s.totalDurationSec;
    });

    const activeList: FolderStat[] = [];
    const inactiveList: FolderStat[] = [];

    allStats.forEach(s => {
      if (s.totalDurationSec === 0) {
        s.status = 'inactive';
        inactiveList.push(s);
      } else {
        const ratio = s.totalDurationSec / maxDur;
        if (ratio >= 0.5 || s.totalDurationSec >= 36000) {
          s.status = 'hot';
        } else if (ratio >= 0.2 || s.totalDurationSec >= 10800) {
          s.status = 'steady';
        } else {
          s.status = 'cold';
        }
        activeList.push(s);
      }
    });

    // 정렬
    if (sortBy === 'duration') {
      activeList.sort((a, b) => b.totalDurationSec - a.totalDurationSec);
    } else if (sortBy === 'students') {
      activeList.sort((a, b) => b.uniqueStudents.size - a.uniqueStudents.size);
    }

    return {
      folderStats: activeList,
      inactiveFolders: inactiveList,
      maxDuration: maxDur,
      totalPureSec: totalSec,
      activeCount: activeList.length,
      inactiveCount: inactiveList.length,
    };
  }, [rawSessions, libraryFolders, selectedGrade, sortBy]);

  // 검색 필터링된 랭킹 목록
  const filteredRankList = useMemo(() => {
    if (!searchQuery.trim()) return folderStats;
    const q = searchQuery.toLowerCase();
    return folderStats.filter(s =>
      s.folderName.toLowerCase().includes(q) || s.pathString.toLowerCase().includes(q)
    );
  }, [folderStats, searchQuery]);

  // CSV 다운로드 핸들러
  const handleExportCSV = () => {
    if (folderStats.length === 0 && inactiveFolders.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    const headers = ['폴더/컨텐츠명', '상태구분', '누적체류(분)', '이용학생수(명)', '열람세션(회)', '최근열람일'];
    const rows = [
      ...folderStats.map(s => [
        s.folderName,
        s.status === 'hot' ? '초인기' : s.status === 'steady' ? '꾸준함' : '저조',
        Math.round(s.totalDurationSec / 60),
        s.uniqueStudents.size,
        s.totalViews,
        s.lastViewedDate || '-',
      ]),
      ...inactiveFolders.map(s => [
        s.folderName,
        '미이용방치',
        0,
        0,
        0,
        '-',
      ]),
    ];

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Eduest_라이브러리_컨텐츠활용분석_${selectedGrade}_${selectedDays}일간.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const top1Folder = folderStats[0];
  const totalFolderCount = activeCount + inactiveCount;
  const activePercent = totalFolderCount > 0 ? Math.round((activeCount / totalFolderCount) * 100) : 0;
  const avgSessionSec = folderStats.length > 0 && totalPureSec > 0 
    ? Math.round(totalPureSec / Math.max(folderStats.reduce((acc, c) => acc + c.totalViews, 0), 1))
    : 0;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      
      {/* 1. 상단 타이틀 배너 */}
      <div className="bg-gradient-to-r from-violet-900 via-indigo-950 to-slate-900 text-white border border-violet-800/50 rounded-3xl p-6 sm:p-7 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <span>📚 라이브러리 컨텐츠 활용 및 이용률 분석실</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 font-extrabold border border-violet-400/30">
                Content Intelligence
              </span>
            </span>
          </div>
          <p className="text-xs font-medium text-slate-300 leading-relaxed">
            학생들이 <strong>실제로 어떤 교재와 단원을 많이 열람하고 집중하는지</strong> 데이터로 시각화하여, 
            <strong>추가 업데이트할 킬러 교재</strong>와 <strong>이용률이 저조한 방치 교재</strong>를 선생님이 직접 판단할 수 있도록 지원합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-300 bg-white/10 px-3 py-1.5 rounded-2xl border border-white/10">
            데이터 정합성 100% 실시간 연동
          </span>
        </div>
      </div>

      {/* 2. 필터 툴바 (학년 + 분석 기간 + 정렬 + 검색) */}
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
              {g === '전체' ? '전체 학년' : `${g} 라이브러리`}
            </button>
          ))}
        </div>

        {/* 기간 선택 + 정렬 + 검색 + 액션 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 기간 선택 셀렉트 */}
          <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 gap-1.5">
            <Clock size={13} className="text-violet-600" />
            <select
              value={selectedDays}
              onChange={e => setSelectedDays(Number(e.target.value))}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
            >
              <option value={7}>최근 7일간</option>
              <option value={14}>최근 14일간 (2주)</option>
              <option value={30}>최근 30일간 (한 달)</option>
            </select>
          </div>

          {/* 정렬 셀렉트 */}
          <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent outline-none font-black text-slate-800 cursor-pointer"
            >
              <option value="duration">열람 체류시간 높은 순</option>
              <option value="students">이용 학생 많은 순</option>
            </select>
          </div>

          {/* 폴더 검색 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="폴더/단원명 검색..."
              className="bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 w-36 sm:w-44"
            />
          </div>

          {/* 새로고침 */}
          <button
            type="button"
            onClick={fetchData}
            className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
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
            <Download size={14} className="text-violet-600" />
            <span>CSV 저장</span>
          </button>
        </div>
      </div>

      {/* 3. 4대 컨텐츠 KPI 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 최다 이용 1위 */}
        <div className="bg-gradient-to-br from-purple-50/70 to-white border border-purple-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Flame size={16} className="text-rose-500" />
              최다 이용 1위 콘텐츠
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-extrabold">
              업데이트 추천
            </span>
          </div>
          <div className="text-lg font-black text-slate-900 truncate" title={top1Folder ? top1Folder.folderName : ''}>
            {top1Folder ? top1Folder.folderName : '기록 없음'}
          </div>
          <div className="text-[11px] font-bold text-violet-700 truncate">
            {top1Folder ? `누적 ${formatDurationKo(top1Folder.totalDurationSec)} (${top1Folder.uniqueStudents.size}명 이용)` : '기간 내 열람 없음'}
          </div>
        </div>

        {/* KPI 2: 활성 폴더 비율 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Folder size={16} className="text-blue-500" />
              활성 폴더 비율
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">
              {totalFolderCount}개 중
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {activeCount}개 <span className="text-sm font-black text-blue-600">({activePercent}%)</span>
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            학생들이 1회 이상 실제로 열람한 폴더
          </div>
        </div>

        {/* KPI 3: 장기 미이용 방치 폴더 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={16} className="text-amber-500" />
              장기 미이용 폴더
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold">
              {selectedDays}일간 0회
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 tracking-tight">
            {inactiveCount}개 <span className="text-sm font-bold text-slate-400">({100 - activePercent}%)</span>
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            선택 기간 동안 열람이 전혀 없는 폴더
          </div>
        </div>

        {/* KPI 4: 1회 열람 평균 몰입도 */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={16} className="text-emerald-500" />
              1회 열람 평균 몰입도
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold">
              진득함 지수
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatDurationKo(avgSessionSec)}
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            학생 1회 열람 시 평균 머문 시간
          </div>
        </div>
      </div>

      {/* 4. 메인 2분할 레이아웃: 좌측 수평 막대 랭킹 (7열) + 우측 미이용 현황 & 매트릭스 (5열) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 좌측: 콘텐츠별 누적 학습시간 랭킹 (7열) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Library size={16} className="text-violet-600" />
                <span>폴더별 누적 학습 시간 랭킹 TOP ({filteredRankList.length}개)</span>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                누적 체류시간 & 고유 이용자 기준
              </span>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={24} className="animate-spin text-violet-600" />
                <span className="text-xs font-bold">라이브러리 통계를 계산하는 중...</span>
              </div>
            ) : filteredRankList.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
                해당 기간에 열람된 라이브러리 폴더 기록이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRankList.map((item, idx) => {
                  const pct = Math.max(Math.round((item.totalDurationSec / maxDuration) * 100), 4);
                  const isTop1 = idx === 0;

                  return (
                    <div
                      key={item.folderKey}
                      className="bg-slate-50/80 hover:bg-violet-50/40 border border-slate-200/80 hover:border-violet-200 rounded-2xl p-4 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                            isTop1 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-violet-100 text-violet-700'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-sm font-black text-slate-900 truncate">
                            {item.folderName}
                          </span>
                        </div>

                        {item.status === 'hot' ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                            🔥 초인기 (업데이트 추천)
                          </span>
                        ) : item.status === 'steady' ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
                            🌱 꾸준함 (시험대비 유지)
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0">
                            💤 이용률 저조
                          </span>
                        )}
                      </div>

                      {/* 막대 그래프 */}
                      <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop1
                              ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600'
                              : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>

                      {/* 하단 세부 통계 */}
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-1">
                        <div className="flex items-center gap-3">
                          <span>누적 체류: <strong className="text-slate-900 font-black">{formatDurationKo(item.totalDurationSec)}</strong></span>
                          <span>이용 학생: <strong className="text-violet-700 font-black">{item.uniqueStudents.size}명</strong></span>
                          <span>총 세션: <strong className="text-slate-700 font-black">{item.totalViews}회</strong></span>
                        </div>
                        {item.lastViewedDate && (
                          <span className="text-[10px] text-slate-400">최근: {item.lastViewedDate}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 장기 미이용 방치 폴더 현황 & 의사결정 매트릭스 (5열) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* 장기 미이용 방치 폴더 모니터링 카드 (버튼 일절 없이 순수 현황만 제공) */}
          <div className="bg-white border border-amber-200 rounded-3xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-amber-600" />
                장기 미이용 방치 폴더 현황 ({inactiveFolders.length}개)
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                최근 {selectedDays}일간 0회 열람
              </span>
            </div>
            <p className="text-[11px] font-medium text-amber-800/80 leading-relaxed">
              학생들이 전혀 열람하지 않는 폴더들입니다. 메뉴가 복잡해지지 않도록 향후 교재 정비 시 참고자료로 활용하세요.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {inactiveFolders.length === 0 ? (
                <div className="py-6 text-center text-xs font-bold text-slate-400">
                  모든 폴더가 활발히 이용되고 있습니다.
                </div>
              ) : (
                inactiveFolders.slice(0, 10).map((f, i) => (
                  <div
                    key={f.folderKey || i}
                    className="bg-amber-50/50 border border-amber-100 rounded-2xl p-2.5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder size={14} className="text-amber-600 shrink-0" />
                      <span className="font-black text-slate-800 truncate">{f.folderName}</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-lg shrink-0">
                      미이용 방치중
                    </span>
                  </div>
                ))
              )}
              {inactiveFolders.length > 10 && (
                <div className="text-center text-[10px] font-bold text-slate-400 pt-1">
                  + {inactiveFolders.length - 10}개 더 있음
                </div>
              )}
            </div>
          </div>

          {/* 콘텐츠 운영 의사결정 매트릭스 가이드라인 */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-3">
            <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles size={15} className="text-violet-600" />
              <span>콘텐츠 운영 가이드라인 (의사결정 매트릭스)</span>
            </div>

            <div className="space-y-2.5 text-[11px]">
              <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-100 space-y-1">
                <div className="font-black text-rose-950 flex items-center gap-1">
                  <span>🔥 상위 20% 초인기 콘텐츠 (미적분1 모의평가 등)</span>
                </div>
                <p className="text-slate-600 font-medium leading-relaxed">
                  학생들의 자율 학습 체류가 집중되는 킬러 자료입니다. <strong>쌍둥이 문항 추가 및 후속 회차 모의고사 확대 제작</strong>을 추천합니다.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-1">
                <div className="font-black text-blue-950 flex items-center gap-1">
                  <span>🌱 중위권 유지 콘텐츠 (화학, 수2 심화 등)</span>
                </div>
                <p className="text-slate-600 font-medium leading-relaxed">
                  내신 직전에 반짝 활용되는 계절성 자료입니다. <strong>현 상태를 유지</strong>하고 시험 2주 전 추천 안내가 효과적입니다.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="font-black text-slate-800 flex items-center gap-1">
                  <span>💤 하위 방치 콘텐츠 (0회 열람)</span>
                </div>
                <p className="text-slate-500 font-medium leading-relaxed">
                  학생들이 찾지 않는 자료입니다. 선생님께서 판단하셔서 필요시 구글 드라이브 및 권한 관리에서 깔끔히 정비하세요.
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
