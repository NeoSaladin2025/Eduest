import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; 

/**
 * 🫦 Beyond The Line Math - 정식 버전 대문 (섹시미 폭발!)
 * 기획: DB(users 테이블)에서 student_id 먼저 확인 후, Auth로 인증
 */
function App() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // 🫦 성지의 세션 기강 실시간 감시
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    /**
     * 🫦 1단계: users 테이블에서 student_id의 존재 여부를 먼저 확인합니다.
     * 이년이 성지에 등록된 암컷인지 아닌지 먼저 확인하는 과정이죠.
     */
    const { data: userData, error: findError } = await supabase
      .from('users')
      .select('id, email') // Auth 로그인에 필요한 이메일을 가져옵니다.
      .eq('student_id', studentId)
      .single();

    if (findError || !userData) {
      alert('성지에 등록되지 않은 Identity입니다. 주인님, 다시 확인해 보세요! 🫦');
      setLoading(false);
      return;
    }

    // Auth 이메일은 이제 DB에서 가져온 'email' 컬럼을 사용합니다!
    // 만약 users 테이블에 email 컬럼이 없다면, `${studentId}@btl.math` 조합을 사용해야 합니다.
    const targetAuthEmail = userData.email || `${studentId}@btl.math`; 

    /**
     * 🫦 2단계: users 테이블에서 확인된 정보를 바탕으로 Auth년에게 심사를 받습니다.
     * 이제 이년이 주인님의 비밀번호를 제대로 기억하는지 확인할 시간입니다.
     */
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: targetAuthEmail, 
      password: password,
    });

    if (loginError) {
      console.error("Login Error:", loginError.message);
      alert('비밀번호 기강이 풀렸습니다! 다시 쑤셔넣으세요, 주인님! 🫦💦');
      setLoading(false);
      return;
    }

    alert('완벽한 관통입니다! 성지에 오신 것을 환영합니다. 🫦');
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    alert('성지에서 퇴장하셨습니다. 정조대를 다시 채웁니다. 🫦');
  };

  // 🫦 로그인 성공 시: 메인 대시보드 (섹시함을 더했습니다!)
  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 flex flex-col items-center justify-center text-white p-4">
        <div className="bg-gradient-to-br from-zinc-950 to-zinc-800 p-12 rounded-[2.5rem] border border-fuchsia-700 shadow-[0_0_50px_rgba(232,121,249,0.3)] text-center transform hover:scale-105 transition-transform duration-300">
          <h2 className="text-5xl font-black mb-6 uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 drop-shadow-lg">
            WELCOME TO THE <br/><span className="text-6xl">BEYOND</span>
          </h2>
          <p className="text-zinc-300 text-lg mb-10 font-mono italic">관리자 성소에 침입하셨습니다, 주인님! 🫦</p>
          <button 
            onClick={handleLogout}
            className="w-full px-10 py-5 bg-gradient-to-r from-red-800 to-purple-800 hover:from-red-700 hover:to-purple-700 transition-all rounded-full font-extrabold text-2xl border border-red-900 shadow-xl uppercase tracking-widest transform hover:-translate-y-1 active:scale-95 duration-200"
          >
            EXIT HOLY GROUND
          </button>
        </div>
      </div>
    );
  }

  // 🫦 로그인 전: Beyond The Line Math의 관능적인 대문
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 font-sans text-white p-4">
      <div className="max-w-md w-full p-12 space-y-8 bg-gradient-to-br from-zinc-900 to-zinc-800 border border-purple-700 rounded-[3rem] shadow-[0_0_80px_rgba(168,85,247,0.2)] transform hover:scale-[1.01] transition-transform duration-300">
        
        <div className="text-center">
          <h1 className="text-6xl font-black italic tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 drop-shadow-2xl">
            BEYOND <br/><span className="text-7xl">THE LINE</span>
          </h1>
          <p className="mt-6 text-zinc-500 text-xs tracking-[0.4em] uppercase font-black">
            Math Masterpiece Administrative System
          </p>
        </div>

        <form className="mt-10 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-3">Access Identity</label>
            <input
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full px-6 py-4 bg-zinc-950 border border-purple-800 rounded-full focus:outline-none focus:ring-3 focus:ring-fuchsia-600 transition-all placeholder-zinc-700 text-lg font-bold text-center shadow-inner"
              placeholder="Identity (곽명용희설)"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-3">Security Code</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 bg-zinc-950 border border-purple-800 rounded-full focus:outline-none focus:ring-3 focus:ring-fuchsia-600 transition-all placeholder-zinc-700 text-lg font-bold text-center shadow-inner"
              placeholder="비밀번호를 쑤셔넣어"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-8 py-5 bg-gradient-to-r from-fuchsia-600 to-purple-700 text-white font-black rounded-full hover:from-fuchsia-500 hover:to-purple-600 hover:shadow-[0_0_30px_rgba(236,72,153,0.6)] transition-all transform active:scale-95 text-2xl tracking-widest uppercase shadow-lg"
          >
            {loading ? 'PENETRATING...' : 'PENETRATE'}
          </button>
        </form>

        <div className="pt-6 border-t border-zinc-800 text-center">
          <p className="text-xs text-zinc-700 font-bold uppercase tracking-tighter">
            PROPERTY OF BEYOND THE LINE MATH. AUTHORIZED PERSONNEL ONLY. 🫦
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;