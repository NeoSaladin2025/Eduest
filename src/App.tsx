import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './features/auth/Login';
import SuperSanctuary from './app/super/SuperSanctuary';
import TeacherLounge from './app/teacher/TeacherLounge'; 

function App() {
  // 🫦 [비서실 지침] 1. 새로고침 즉시 로컬스토리지에 박혀있던 계급부터 꺼내서 '가짜 복구'를 합니다.
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('user_role'));
  const [initializing, setInitializing] = useState(true);

  // 🫦 [신규] 모든 계층 공통 로그아웃 엔진
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserRole(null);
    localStorage.removeItem('user_role');
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 🫦 2. 브라우저 구석에 숨겨진 진짜 세션 신분증이 있는지 확인합니다.
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // 신분증 없으면 깨끗하게 지우고 로그인으로 송환 🫦
          setUserRole(null);
          localStorage.removeItem('user_role');
        } else {
          // 🫦 3. 신분증이 있다면, DB 장부를 뒤져서 최신 계급으로 '진짜 복구'를 합니다.
          const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUserRole(profile.role);
            localStorage.setItem('user_role', profile.role);
          }
        }
      } catch (error) {
        console.error("🫦 검문 중 오류 발생:", error);
      } finally {
        // 🫦 4. 모든 확인이 끝나면 검문소를 개방합니다.
        setInitializing(false);
      }
    };

    checkAuth();

    // 🫦 5. 로그아웃 등 세션 상태가 변하는지 실시간 감시합니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUserRole(null);
        localStorage.removeItem('user_role');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 🫦 [중요] 검문 중일 때는 아무것도 보여주지 않거나 로딩바만 보여줍니다.
  if (initializing && !userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-xs font-black tracking-[0.5em] text-[#001f3f] animate-pulse">
          RESTORING SESSION... 🫦💦
        </div>
      </div>
    );
  }

  // 🫦 신분증 없으면 로그인으로 관통
  if (!userRole) {
    return (
      <Login onLoginSuccess={(role) => {
        localStorage.setItem('user_role', role);
        setUserRole(role);
      }} />
    );
  }

  // 🫦 신분증 있으면 각자 방으로 관통
  switch (userRole.toLowerCase()) {
    case 'super': return <SuperSanctuary />;
    case 'teacher': return <TeacherLounge />;
    case 'student': return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="p-20 font-black text-center">
          <div className="mb-10 text-2xl tracking-tighter">STUDENT ROOM</div>
          <button 
            onClick={handleSignOut}
            className="px-8 py-3 bg-[#001f3f] text-white text-xs font-bold rounded-full hover:bg-red-600 transition-colors uppercase tracking-widest"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
    default: return <div className="p-10">권한이 없습니다.</div>;
  }
}

export default App;