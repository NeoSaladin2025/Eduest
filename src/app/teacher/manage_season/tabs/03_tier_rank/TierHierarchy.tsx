import React, { useState } from 'react';
/**
 * @description 교육 단계별 세부 관리를 위한 하부 모듈 임포트
 * 각 모듈은 독립적인 폴더 구조를 통해 보안과 관리 효율성을 보장합니다.
 */
import LevelManager from './LevelManager/LevelManager'; 
import TierManager from './TierManager/TierManager';  

/**
 * @type TabType
 * @description 관리 모드를 명확히 구분하여 데이터 혼선을 방지합니다.
 */
type TabType = 'LEVEL' | 'TIER';

/**
 * @component TierHierarchy
 * @description 학원생의 학습 동기를 고취시키는 [레벨] 및 [티어] 시스템의 통합 컨트롤 타워입니다.
 * 학부모님께 신뢰를 주는 세련된 네이비&화이트 레이아웃을 채택하였습니다.
 */
const TierHierarchy: React.FC = () => {
  // 현재 활성화된 관리 탭을 제어하는 상태 (기본값: 레벨 관리)
  const [activeTab, setActiveTab] = useState<TabType>('LEVEL');

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      
      {/* [1] 좌측 네비게이션바 (Side Navigation) */}
      <aside className="w-80 bg-[#001f3f] flex flex-col shadow-xl z-20">
        {/* 학원 브랜드 로고 및 타이틀 */}
        <header className="p-10 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-xl border border-white/20">
              <span className="text-2xl">🎓</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">성취도 관리 센터</h1>
              <p className="text-[10px] text-blue-300 font-medium tracking-widest opacity-60">ADMINISTRATION SYSTEM</p>
            </div>
          </div>
        </header>

        {/* 메뉴 리스트: 학부모님이 보셔도 신뢰가 가는 명칭 사용 */}
        <nav className="flex-1 px-6 py-8 space-y-3">
          <button
            onClick={() => setActiveTab('LEVEL')}
            className={`w-full px-5 py-4 rounded-2xl flex items-center gap-4 transition-all duration-300 group ${
              activeTab === 'LEVEL' 
              ? 'bg-white text-[#001f3f] shadow-xl' 
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className={`text-lg transition-transform ${activeTab === 'LEVEL' ? 'scale-110' : 'group-hover:scale-110'}`}>
              📈
            </span>
            <div className="text-left">
              <span className="block font-bold text-sm">레벨 체계 설정</span>
              <span className="block text-[10px] opacity-60">실력 기반 단계별 학습 관리</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('TIER')}
            className={`w-full px-5 py-4 rounded-2xl flex items-center gap-4 transition-all duration-300 group ${
              activeTab === 'TIER' 
              ? 'bg-white text-[#001f3f] shadow-xl' 
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className={`text-lg transition-transform ${activeTab === 'TIER' ? 'scale-110' : 'group-hover:scale-110'}`}>
              🎖️
            </span>
            <div className="text-left">
              <span className="block font-bold text-sm">티어 계급 설정</span>
              <span className="block text-[10px] opacity-60">학습 동기 부여 계급 시스템</span>
            </div>
          </button>
        </nav>

        {/* 보안 및 인증 정보 */}
        <footer className="p-8 border-t border-white/10 bg-black/10">
          <div className="flex items-center justify-between text-[10px] font-bold text-blue-300/50 uppercase tracking-widest">
            <span>Security Status</span>
            <span className="text-green-400">● Encrypted</span>
          </div>
        </footer>
      </aside>

      {/* [2] 우측 대시보드 영역 (Main Dashboard) */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 상태 바 */}
        <header className="h-24 bg-white border-b border-slate-200 px-10 flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              {activeTab === 'LEVEL' ? '개별 학습 레벨 가이드라인' : '성취 기반 티어 체계'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>학습 관리</span>
              <span className="text-slate-300">/</span>
              <span className="text-[#001f3f] font-bold underline decoration-blue-200 decoration-2 underline-offset-4">
                {activeTab === 'LEVEL' ? 'Level Settings' : 'Tier Settings'}
              </span>
            </div>
          </div>
          
          <div className="flex gap-3">
             <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-500">
               데이터 자동 동기화 중
             </div>
          </div>
        </header>

        {/* 실제 작업 영역: 스크롤 가능 구역 */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-[#F8FAFC]">
          <div className="max-w-6xl mx-auto">
            {/* 선택된 모듈에 따른 화면 렌더링 */}
            {activeTab === 'LEVEL' ? (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <LevelManager />
              </div>
            ) : (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <TierManager />
              </div>
            )}

            {/* 하단 품질 보증 섹션 (학부모님 안심용) */}
            <footer className="mt-20 pt-10 border-t border-slate-200 text-center space-y-3 pb-10">
              <p className="text-slate-400 font-medium text-sm">
                BTL 수학교육은 정교한 데이터 분석을 통해 학생 개개인의 최적화된 학습 경로를 제시합니다.
              </p>
              <div className="flex justify-center gap-6 opacity-30 grayscale">
                 <span className="text-[10px] font-black tracking-widest uppercase">System Integrity</span>
                 <span className="text-[10px] font-black tracking-widest uppercase">Academic Ethics</span>
                 <span className="text-[10px] font-black tracking-widest uppercase">Success Driven</span>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TierHierarchy;