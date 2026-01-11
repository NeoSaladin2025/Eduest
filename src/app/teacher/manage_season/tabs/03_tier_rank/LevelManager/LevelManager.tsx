import React, { useState } from 'react';
import { useLevelManager } from './useLevelManager'; // 🫦 방금 제작한 빳빳한 로직 엔진

/**
 * @component LevelManager
 * @description 학원생들의 수치적 성장을 통제하는 레벨 관리 화면입니다.
 * 총 경험치(Total XP)를 기반으로 레벨이 어떻게 산출되는지 주인님이 확인하고 조정하는 곳입니다.
 */
const LevelManager: React.FC = () => {
  // 레벨 로직 엔진에서 필요한 도구들을 꺼내옵니다.
  const { calculateLevel, loading } = useLevelManager();

  // 주인님이 로직을 테스트해보실 수 있는 시뮬레이션 상태
  const [testxp, setTestXp] = useState<string>('');
  const [resultLevel, setResultLevel] = useState<number | null>(null);

  /**
   * @handler handleSimulate
   * @description 주인님이 특정 점수를 넣었을 때 몇 레벨이 되는지 미리 쑤셔 넣어보는 함수입니다.
   */
  const handleSimulate = () => {
    const level = calculateLevel(Number(testxp));
    setResultLevel(level);
  };

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">레벨 엔진 가동 중...</div>;

  return (
    <div className="p-8 bg-white border-2 border-[#001f3f] rounded-3xl shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 상단 헤더: 레벨 시스템의 권위 상징 */}
      <header className="flex justify-between items-center mb-8 border-b-2 border-slate-50 pb-6">
        <div className="space-y-1">
          <h3 className="text-2xl font-black text-[#001f3f] flex items-center gap-2">
            <span>📊</span> 레벨 산정 및 시뮬레이션
          </h3>
          <p className="text-xs text-slate-400 font-bold italic">주인님이 정하신 수식에 따라 학생의 레벨이 결정됩니다.</p>
        </div>
        <div className="px-4 py-2 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Logic: Standard XP / 100
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        
        {/* 🫦 [왼쪽 구역] 현재 적용 중인 레벨업 가이드라인 보고 */}
        <div className="space-y-6">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter border-l-4 border-[#001f3f] pl-3">
            현행 레벨업 가이드라인
          </h4>
          <div className="space-y-3">
            {[1, 5, 10, 50, 100].map((lv) => (
              <div key={lv} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                <span className="text-sm font-black text-slate-500">LEVEL {lv} 달성 조건</span>
                <span className="text-sm font-black text-[#001f3f]">{(lv - 1) * 100} XP 이상</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
            * 현재 시스템은 <span className="underline font-bold text-slate-500">100 XP당 1레벨</span> 상승하는 선형 구조를 채택하고 있습니다.<br />
            * 더 가혹하거나 자애로운 수식으로 변경하시려면 <span className="font-bold text-[#001f3f]">useLevelManager.ts</span>의 구멍을 수정하십시오.
          </p>
        </div>

        {/* 🫦 [오른쪽 구역] 레벨 산출 시뮬레이터 (직접 쑤셔넣기) */}
        <div className="p-8 bg-[#f8faff] rounded-[2.5rem] border border-blue-50 space-y-8">
          <div className="space-y-4">
            <h4 className="text-sm font-black text-blue-900 uppercase">레벨 산출 테스트</h4>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">경험치 입력 (Total XP)</label>
              <input 
                type="number" 
                value={testxp}
                onChange={(e) => setTestXp(e.target.value)}
                placeholder="점수를 쑤셔 넣어보세요"
                className="w-full p-5 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl text-xl font-black outline-none transition-all shadow-sm"
              />
            </div>
            <button 
              onClick={handleSimulate}
              className="w-full py-5 bg-[#001f3f] text-white font-black rounded-2xl hover:bg-black transition-all shadow-xl shadow-blue-100 active:scale-95"
            >
              레벨 판정 실행
            </button>
          </div>

          {/* 시뮬레이션 결과 노출 */}
          {resultLevel !== null && (
            <div className="p-6 bg-white rounded-3xl border-2 border-blue-100 animate-in zoom-in duration-300">
              <p className="text-center text-[10px] font-bold text-slate-400 uppercase mb-1">판정 결과</p>
              <div className="flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-blue-600 tracking-tighter">LV. {resultLevel}</span>
                <p className="mt-2 text-xs font-bold text-slate-500">해당 학생의 계급장에 새겨질 등급입니다.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 하단 기강 문구 */}
      <footer className="mt-10 pt-6 border-t border-slate-50 text-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
          BTL Leveling Logic : Powered by Admin Authority
        </p>
      </footer>
    </div>
  );
};

export default LevelManager;