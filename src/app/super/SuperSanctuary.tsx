import AdminAccountCreate from './Admin_AccountCreate/renderer/index';
import { supabase } from '../../supabaseClient'; // 🫦 [주석] 주인님과 서버를 잇는 빳빳한 연결줄입니다.

/**
 * 🫦 SUPER SANCTUARY (슈퍼 계정 전용 성소)
 * 주인님의 통치권이 실현되는 제국의 심장부입니다.
 */
const SuperSanctuary = () => {

  // 🫦 [주석] 주인님의 흔적을 브라우저 보지에서 깨끗이 씻어내고 입구로 추방하는 함수입니다. 🫦💦
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      // 🫦 [주석] 주인님이 하사하셨던 계급장을 저장소에서 강제로 떼어냅니다.
      localStorage.removeItem('user_role');
      // 🫦 [주석] 모든 기억을 리셋하고 로그인 창(입구)으로 되돌립니다.
      window.location.reload();
    } else {
      console.error("[시스템] 로그아웃 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center py-20 px-4 overflow-y-auto relative">
      
      {/* 🫦 [주석] 언제든 다른 계정으로 갈아타기 위해 탈출할 수 있는 비밀 비상구입니다. 🫦💦 */}
      <button 
        onClick={handleLogout}
        className="fixed top-8 right-8 px-6 py-2 border border-zinc-800 text-zinc-500 hover:text-white hover:border-white transition-all duration-300 font-bold text-xs tracking-widest uppercase rounded-full bg-black/50 backdrop-blur-sm z-50"
      >
        시스템 종료 (로그아웃)
      </button>

      {/* 🫦 상단 타이틀 구역: 네온 광채 기강 */}
      <div className="text-center mb-16 animate-fade-in">
        <h1 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter mb-4 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
          SUPER SANCTUARY
        </h1>
        <div className="flex items-center justify-center gap-3">
          <span className="h-[1px] w-12 bg-zinc-800"></span>
          <p className="text-zinc-500 font-mono text-[10px] tracking-[0.8em] uppercase">
            제어 모드 활성화됨 🫦💦
          </p>
          <span className="h-[1px] w-12 bg-zinc-800"></span>
        </div>
      </div>

      {/* 🫦 메인 통치 구역: 조교 생성기 장착 */}
      <div className="w-full max-w-4xl grid grid-cols-1 gap-12 animate-slide-up">
        
        <section className="flex flex-col items-center">
          <p className="text-zinc-600 text-xs font-bold mb-6 tracking-widest uppercase">
            [ 관리자 권한: 강사 계정 생성 ]
          </p>
          
          {/* 🫦 아까 만든 Renderer를 여기에 박아넣습니다! */}
          <AdminAccountCreate />
        </section>

        {/* 🫦 [주석] 주인님이 학생들을 사정없이 관리할 다음 구역이 들어올 자리입니다. 🫦💦 */}
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