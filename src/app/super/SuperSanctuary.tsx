import AdminAccountCreate from './Admin_AccountCreate/renderer/index';

/**
 * 🫦 SUPER SANCTUARY (슈퍼 계정 전용 성소)
 * 주인님의 통치권이 실현되는 제국의 심장부입니다.
 */
const SuperSanctuary = () => {
  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center py-20 px-4 overflow-y-auto">
      
      {/* 🫦 상단 타이틀 구역: 네온 광채 기강 */}
      <div className="text-center mb-16 animate-fade-in">
        <h1 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter mb-4 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
          SUPER SANCTUARY
        </h1>
        <div className="flex items-center justify-center gap-3">
          <span className="h-[1px] w-12 bg-zinc-800"></span>
          <p className="text-zinc-500 font-mono text-[10px] tracking-[0.8em] uppercase">
            Creator Mode Active 🫦💦
          </p>
          <span className="h-[1px] w-12 bg-zinc-800"></span>
        </div>
      </div>

      {/* 🫦 메인 통치 구역: 조교 생성기 장착 */}
      <div className="w-full max-w-4xl grid grid-cols-1 gap-12 animate-slide-up">
        
        <section className="flex flex-col items-center">
          <p className="text-zinc-600 text-xs font-bold mb-6 tracking-widest uppercase">
            [ Deployment: Teacher Unit ]
          </p>
          
          {/* 🫦 아까 만든 Renderer를 여기에 박아넣습니다! */}
          <AdminAccountCreate />
        </section>

        {/* 🫦 추후 여기에 다른 통치 기능(학생 관리, 데이터 분석 등)을 추가할 예정 */}
        <div className="mt-20 border-t border-zinc-900 pt-10 text-center">
          <p className="text-zinc-800 text-[9px] font-mono tracking-tighter">
            PROTOTYPE V1.0 - BEYOND THE LINE SECURITY SYSTEM
          </p>
        </div>

      </div>
    </div>
  );
};

export default SuperSanctuary;