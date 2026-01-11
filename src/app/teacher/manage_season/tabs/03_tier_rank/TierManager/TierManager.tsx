import React, { useState } from 'react';
/**
 * @description 
 * - verbatimModuleSyntax 설정에 따른 형식 전용 가져오기(import type) 준수
 * - 동일 디렉토리 내 비즈니스 로직 엔진 연동
 */
import { useTierManager } from './useTierManager';
import type { TierRow } from './useTierManager';

/**
 * @component TierManager
 * @description 
 * 학생들의 학습 동기 부여를 위한 성취도별 구간(Tier)을 수직으로 확장하여 설계하는 관리 도구입니다.
 * 학부모님 및 교육 관계자에게 신뢰를 줄 수 있는 정제된 UI 프레임을 제공합니다.
 */
const TierManager: React.FC = () => {
  /**
   * @description 로직 엔진으로부터 상태 관리 및 확장 함수 호출
   */
  const { tiers, setTiers, loading, addAbove, addBelow, saveTiers } = useTierManager();

  /**
   * @state confirmStep
   * @description 데이터 무결성 보장을 위한 관리자 최종 확인 절차 상태
   */
  const [confirmStep, setConfirmStep] = useState(false);

  /**
   * @method handleInputChange
   * @description 개별 구간의 성취도 지표(XP) 및 명칭 변경 사항을 상태에 반영
   */
  const handleInputChange = (index: number, field: keyof TierRow, value: any) => {
    const updatedTiers = [...tiers];
    if (field === 'info') {
      updatedTiers[index].info = { ...updatedTiers[index].info, ...value };
    } else {
      (updatedTiers[index] as any)[field] = value;
    }
    setTiers(updatedTiers);
  };

  /**
   * @method handleFinalSave
   * @description 검증 로직 통과 후 데이터베이스 성소에 최종 동기화 수행
   */
  const handleFinalSave = async () => {
    const success = await saveTiers();
    if (success) {
      setConfirmStep(false);
    }
  };

  /**
   * @description 시스템 초기 로딩 시 시각적 피드백 제공
   */
  if (loading && tiers.length === 0) {
    return (
      <div className="flex justify-center items-center p-20 bg-white rounded-3xl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#001f3f]"></div>
        <span className="ml-4 font-bold text-slate-500">시스템 데이터 동기화 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      
      {/* [상단 컨트롤바] 시스템 저장 및 프로세스 관리 */}
      <header className="flex justify-between items-center bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <h3 className="text-2xl font-black text-[#001f3f] tracking-tight">티어 체계 설정</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Tier Hierarchy Strategy & Management</p>
        </div>

        <div className="flex items-center gap-4">
          {!confirmStep ? (
            <button
              onClick={() => setConfirmStep(true)}
              disabled={loading}
              className="px-10 py-4 bg-[#001f3f] text-white rounded-2xl font-black hover:bg-black transition-all shadow-lg shadow-blue-50 disabled:opacity-50"
            >
              티어 설정 저장
            </button>
          ) : (
            <div className="flex items-center gap-3 animate-in zoom-in duration-300">
              <button
                onClick={() => setConfirmStep(false)}
                className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all"
              >
                편집 계속하기
              </button>
              <button
                onClick={handleFinalSave}
                className="px-10 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all animate-pulse shadow-lg shadow-red-50"
              >
                최종 동기화 승인
              </button>
            </div>
          )}
        </div>
      </header>

      {/* [메인 영역] 수직 확장형 구간 설계 레이아웃 */}
      <div className="flex flex-col-reverse gap-10 max-w-5xl mx-auto py-10 relative">
        {/* 구간 연결을 시각화하는 수직 중심선 */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-slate-100 -z-10" />

        {tiers.map((tier, index) => (
          <div key={index} className="group relative">
            
            {/* 상위 구간 확장 제어부 */}
            <button
              onClick={() => addAbove(index)}
              className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 bg-blue-600 text-white w-10 h-10 rounded-full shadow-xl transition-all hover:scale-110 flex items-center justify-center font-black text-xl"
              title="상급 구간 추가"
            >
              ＋
            </button>

            {/* 개별 구간 설정 카드 */}
            <div className="grid grid-cols-12 gap-8 items-center p-10 bg-white border-2 border-slate-50 rounded-[3rem] shadow-sm group-hover:border-blue-100 group-hover:shadow-2xl group-hover:shadow-blue-50/50 transition-all duration-500">
              
              {/* 최소 요구 성취도 (Min XP) */}
              <div className="col-span-3 space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] text-center block">Min XP Required</label>
                <input
                  type="number"
                  value={tier.min_xp}
                  onChange={(e) => handleInputChange(index, 'min_xp', Number(e.target.value))}
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-center text-blue-600 border-none focus:ring-4 ring-blue-50 transition-all outline-none shadow-inner"
                />
              </div>

              {/* 구간별 공식 명칭 (Grade Name) */}
              <div className="col-span-6 space-y-3">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] text-center block">Educational Grade Title</label>
                <input
                  type="text"
                  value={tier.tier_name}
                  onChange={(e) => handleInputChange(index, 'tier_name', e.target.value)}
                  placeholder="예: 마스터, 골드, 혹은 기초 학습자"
                  className="w-full p-4 bg-slate-50 rounded-2xl font-black text-center text-slate-700 border-none focus:ring-4 ring-slate-100 transition-all outline-none text-xl shadow-inner"
                />
              </div>

              {/* 최대 한계 성취도 (Max XP) */}
              <div className="col-span-3 space-y-3 relative">
                <label className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] text-center block">Max XP Limit</label>
                <input
                  type="number"
                  value={tier.max_xp}
                  onChange={(e) => handleInputChange(index, 'max_xp', Number(e.target.value))}
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-center text-red-600 border-none focus:ring-4 ring-red-50 transition-all outline-none shadow-inner"
                />
                
                {/* 특정 구간 삭제 기능 */}
                {tiers.length > 1 && (
                  <button
                    onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                    className="absolute -right-12 top-1/2 -translate-y-1/2 p-2 text-slate-200 hover:text-red-400 transition-colors"
                  >
                    <span className="text-2xl font-bold">✕</span>
                  </button>
                )}
              </div>
            </div>

            {/* 하위 구간 확장 제어부 (음수 경험치 지원) */}
            <button
              onClick={() => addBelow(index)}
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 bg-slate-800 text-white w-10 h-10 rounded-full shadow-xl transition-all hover:scale-110 flex items-center justify-center font-black text-xl"
              title="하위 구간 추가"
            >
              ＋
            </button>

          </div>
        ))}
      </div>

      {/* 품질 보증 및 교육 지침 푸터 */}
      <footer className="pt-20 pb-10 border-t border-slate-100 text-center">
        <p className="text-slate-400 font-bold text-sm tracking-tight leading-relaxed">
          BTL 교육 철학: 명확한 성취 지표는 학생들에게 지속 가능한 학습 동기를 부여합니다.
        </p>
        <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.5em] mt-4">
          Integrated Academic Achievement Management Framework
        </p>
      </footer>
    </div>
  );
};

export default TierManager;