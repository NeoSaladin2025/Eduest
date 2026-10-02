'use client';

import React from 'react';
import { 
  Trophy, 
  Medal, 
  Clock, 
  X, 
  Flame, 
  Zap, 
  Sparkles, 
  Award,
  Calendar,
  CheckCircle2,
  Play
} from 'lucide-react';
import { ReviewItem, ReviewLapRecord } from './types';

interface ReviewArcadeLeaderboardProps {
  item: ReviewItem;
  onClose?: () => void;
  onStartTest?: () => void;
  inline?: boolean;
}

export default function ReviewArcadeLeaderboard({
  item,
  onClose,
  onStartTest,
  inline = false,
}: ReviewArcadeLeaderboardProps) {
  // 타임랩 기록 중 정답인 것만 추출하여 가장 빠른 순서대로 정렬
  // 만약 기존 데이터에 timeRecords가 없더라도 lastSpentSec가 있으면 기본 1회차 기록으로 자동 구성!
  const allRecords: ReviewLapRecord[] = React.useMemo(() => {
    let recs = [...(item.timeRecords || [])];
    if (recs.length === 0 && item.lastSpentSec !== undefined) {
      recs.push({
        id: `legacy_${item.id}`,
        spentSec: item.lastSpentSec,
        isCorrect: item.lastIsCorrect ?? false,
        recordedAt: item.lastTestedAt || new Date().toISOString(),
        userAnswer: item.lastUserAnswer,
      });
    }
    // 정답 기록을 최우선으로, 그 다음 시간 빠른 순으로 정렬
    const correctOnly = recs.filter(r => r.isCorrect).sort((a, b) => a.spentSec - b.spentSec);
    // 만약 정답 기록이 없으면 일반 기록이라도 시간순 정렬
    if (correctOnly.length === 0) {
      return recs.sort((a, b) => a.spentSec - b.spentSec);
    }
    return correctOnly;
  }, [item]);

  const top3 = allRecords.slice(0, 3);

  // 날짜/시간 포맷터: '2026-10-02T23:15:00.000Z' -> '10/02 23:15'
  const formatDateTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${mm}/${dd} ${hh}:${min}`;
    } catch {
      return iso;
    }
  };

  const rankThemes = [
    {
      badge: '🥇 1ST',
      label: 'BEST RECORD',
      border: 'border-amber-400/50 bg-amber-500/10 shadow-amber-500/20',
      text: 'text-amber-300',
      glow: 'shadow-[0_0_15px_rgba(251,191,36,0.25)]',
      icon: <Trophy size={18} className="text-amber-400 animate-bounce" />,
    },
    {
      badge: '🥈 2ND',
      label: 'RUNNER UP',
      border: 'border-slate-300/40 bg-slate-300/10 shadow-slate-300/20',
      text: 'text-slate-200',
      glow: 'shadow-[0_0_15px_rgba(226,232,240,0.15)]',
      icon: <Medal size={18} className="text-slate-300" />,
    },
    {
      badge: '🥉 3RD',
      label: 'TOP RANKER',
      border: 'border-amber-700/40 bg-amber-700/10 shadow-amber-700/20',
      text: 'text-amber-500',
      glow: 'shadow-[0_0_15px_rgba(180,83,9,0.15)]',
      icon: <Award size={18} className="text-amber-600" />,
    },
  ];

  const content = (
    <div className="bg-[#0b0f19] border border-amber-500/30 rounded-[32px] p-6 text-white space-y-5 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
      
      {/* 아케이드 네온 배경 데코레이션 */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* 헤더 */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-violet-600 p-[1px] shadow-lg shadow-amber-500/30">
            <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
              <Trophy size={20} className="text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1">
                <Flame size={12} className="text-rose-500" /> ARCADE TIME ATTACK
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-violet-500/30 text-violet-300 border border-violet-500/40">
                TOP 3
              </span>
            </div>
            <h3 className="text-base font-black text-white truncate max-w-[240px] md:max-w-xs mt-0.5">
              {item.name.replace(/\.html?$/i, '')}
            </h3>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 오락실 스타일 TOP 3 전광판 리스트 */}
      <div className="space-y-2.5 relative z-10">
        {[0, 1, 2].map((rankIdx) => {
          const record = top3[rankIdx];
          const theme = rankThemes[rankIdx];

          if (record) {
            return (
              <div
                key={rankIdx}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${theme.border} ${theme.glow}`}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{theme.icon}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black font-mono tracking-wider ${theme.text}`}>
                        {theme.badge}
                      </span>
                      {record.isCorrect ? (
                        <span className="text-[10px] font-black text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 size={11} /> 정답
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-400">오답</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                      <Calendar size={11} className="text-slate-500" />
                      <span>{formatDateTime(record.recordedAt)}</span>
                      {record.diffFromPrev !== undefined && record.diffFromPrev !== 0 && (
                        <span className={`font-bold ml-1 ${record.diffFromPrev < 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          ({record.diffFromPrev < 0 ? `⚡ ${Math.abs(record.diffFromPrev)}초 단축!` : `+${record.diffFromPrev}초`})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 기록 시간 큰 글씨 표시 */}
                <div className="text-right">
                  <div className={`text-2xl font-black font-mono tracking-tighter ${theme.text}`}>
                    {record.spentSec}
                    <span className="text-xs font-normal text-slate-400 ml-0.5">초</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono font-bold block">
                    TIME LAP
                  </span>
                </div>
              </div>
            );
          }

          // 비어있는 슬롯 표시
          return (
            <div
              key={rankIdx}
              className="p-3.5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-between opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-600 font-black font-mono text-xs">{theme.badge}</span>
                <span className="text-xs font-bold text-slate-500 font-mono">EMPTY RECORD SLOT</span>
              </div>
              <span className="text-xs font-mono text-slate-600">--초</span>
            </div>
          );
        })}
      </div>

      {/* 하단 도전 버튼 */}
      {onStartTest && (
        <div className="pt-2 relative z-10">
          <button
            onClick={() => {
              if (onClose) onClose();
              onStartTest();
            }}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:brightness-110 text-white font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30"
          >
            <Zap size={14} className="text-amber-300" />
            <span>기록 경신 도전! 타임어택 풀기</span>
          </button>
        </div>
      )}

    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="max-w-md w-full">
        {content}
      </div>
    </div>
  );
}
