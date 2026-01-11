import React, { useState } from 'react';
import { useSeasonGenesis } from './useSeasonGenesis';

/**
 * @component SeasonGenesis
 * @description 학원의 교육 시즌 시작과 종료를 관리하는 제어 컴포넌트입니다.
 * 학부모와 학생의 데이터를 보호하기 위해 종료(XP 합산)와 시작(XP 초기화) 프로세스를 독립적으로 운영합니다.
 */
const SeasonGenesis: React.FC = () => {
  // 시즌 관리 로직 훅에서 상태와 처리 함수를 호출합니다.
  const { activeSeason, loading, handleEndSeason, handleStartSeason } = useSeasonGenesis();
  
  // 신규 시즌 명칭 설정을 위한 입력 상태를 관리합니다.
  const [newTitle, setNewTitle] = useState('');

  // 데이터베이스 처리 중일 때 표시되는 화면입니다.
  if (loading) {
    return (
      <div className="flex items-center justify-center p-24 text-sm font-bold text-slate-400">
        학원 시스템 데이터를 동기화 중입니다. 잠시만 기다려 주십시오.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-10 space-y-12">
      
      {/* 구역 1: 현재 학원 교육 시즌 상태 보고 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          현재 교육 시즌 운영 현황
        </h2>
        <div className="p-10 border-2 border-slate-100 rounded-[2.5rem] bg-slate-50 relative overflow-hidden">
          {activeSeason ? (
            <div className="relative z-10 space-y-2">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">운영 중인 교육 시즌</p>
              <h3 className="text-4xl font-black text-slate-700">{activeSeason.title}</h3>
              <p className="text-xs text-slate-400">시스템 등록 일시: {new Date(activeSeason.created_at).toLocaleString('ko-KR')}</p>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-xl font-bold text-slate-300 italic">현재 활성화된 교육 시즌이 없습니다. 신규 시즌을 개설해 주십시오.</p>
            </div>
          )}
        </div>
      </section>

      {/* 구역 2: 시즌 제어 관리자 도구 (종료와 시작의 엄격한 분리) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        
        {/* [프로세스 01] 시즌 종료 및 포인트 합산 */}
        <div className="flex flex-col p-10 bg-white border border-slate-100 rounded-[3rem] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex-grow space-y-6">
            <h3 className="text-2xl font-bold text-red-500">01. 시즌 종료 및 포인트 합산</h3>
            
            {/* 데이터 처리 상세 안내 */}
            <div className="p-6 bg-red-50 rounded-2xl space-y-4">
              <h4 className="text-xs font-black text-red-800">[ 처리 안내 ]</h4>
              <ul className="text-[11px] text-red-700 space-y-3 font-medium leading-relaxed">
                <li>• 진행 중인 교육 시즌을 마감하고 시스템 상태를 종료로 변경합니다.</li>
                <li>• 학생들의 이번 시즌 경험치를 학원 계정의 누적 총계로 합산합니다.</li>
                <li>• 합산 공식: <span className="font-bold underline text-red-900 italic">전체 경험치 = 전체 경험치 + 이번 시즌 경험치</span></li>
                <li>• 이 단계에서는 데이터가 초기화되지 않으며, 성과 기록이 안전하게 이전됩니다.</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => {
              if (window.confirm("주의: 현재 시즌을 마감하고 성과 데이터를 합산하시겠습니까? 종료 후에는 기록을 수정할 수 없습니다.")) {
                handleEndSeason();
              }
            }}
            disabled={!activeSeason}
            className={`mt-10 py-6 rounded-2xl font-black text-lg transition-all ${
              activeSeason 
              ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-lg shadow-red-100' 
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            시즌 종료 및 포인트 합산 실행
          </button>
        </div>

        {/* [프로세스 02] 신규 시즌 개시 및 포인트 초기화 */}
        <div className="flex flex-col p-10 bg-white border border-slate-100 rounded-[3rem] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex-grow space-y-6">
            <h3 className="text-2xl font-bold text-slate-800">02. 새 시즌 시작 및 포인트 초기화</h3>
            
            {/* 데이터 처리 상세 안내 */}
            <div className="p-6 bg-slate-50 rounded-2xl space-y-4">
              <h4 className="text-xs font-black text-slate-600">[ 처리 안내 ]</h4>
              <ul className="text-[11px] text-slate-500 space-y-3 font-medium leading-relaxed">
                <li>• 새로운 학업 기수를 개설하여 학원 교육 시스템을 재가동합니다.</li>
                <li>• 모든 학생의 이번 시즌 경험치를 0으로 초기화하여 새롭게 시작합니다.</li>
                <li>• 초기화 공식: <span className="font-bold underline text-slate-900 italic">이번 시즌 경험치 = 0 (초기화)</span></li>
                <li>• 주의: 반드시 시즌 종료 후 실행하십시오. 초기화된 성과 데이터는 복구할 수 없습니다.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">신규 시즌 명칭</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={!!activeSeason}
                placeholder="예: 2026년 봄 정규 교육 과정"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-slate-800 focus:bg-white font-bold transition-all disabled:opacity-30"
              />
            </div>
          </div>

          <button
            onClick={() => {
              if (window.confirm(`모든 성과를 초기화하고 '${newTitle}' 시즌을 개설하시겠습니까?`)) {
                handleStartSeason(newTitle);
                setNewTitle('');
              }
            }}
            disabled={!!activeSeason}
            className={`mt-10 py-6 rounded-2xl font-black text-lg transition-all ${
              !activeSeason 
              ? 'bg-slate-800 text-white hover:bg-black active:scale-95 shadow-lg shadow-slate-200' 
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            새 시즌 생성 및 포인트 초기화 실행
          </button>
        </div>

      </div>

      {/* 하단 시스템 보안 및 관리 정책 안내 */}
      <footer className="pt-12 border-t border-slate-100 text-center">
        <p className="text-[10px] font-bold text-slate-300 tracking-[0.3em] uppercase">
          BTL 수학교육 시즌 관리 정책 : 상위 권한자 전용 제어 모듈
        </p>
      </footer>
    </div>
  );
};

export default SeasonGenesis;