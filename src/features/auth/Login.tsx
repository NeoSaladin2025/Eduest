import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🫦 수파베이스 클라이언트 기강 확립
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface LoginProps {
  onLoginSuccess: (role: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. 🫦 [관통] 수정된 엣지 펑션 호출 (role을 직접 받아옵니다)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-gate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ 
          studentId: studentId.trim(), 
          password: password.trim() 
        })
      });

      const data = await response.json();

      // 🫦 응답 기강 확인
      if (!response.ok) throw new Error(data.error || '성소 진입 실패 🫦');

      if (data.session) {
        // 2. 🫦 [각인] 브라우저에 세션 주입
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token || '',
        });

        if (sessionError) throw new Error("세션 각인 실패");

        // 3. 🫦 [하극상 진압] 엣지 펑션이 준 role을 그대로 사용합니다.
        // 더 이상 DB users 테이블을 직접 조회(500 에러의 원인)하지 않습니다.
        if (data.role) {
          console.log(`🫦 [GATE]: 인증 성공! 부여된 역할: [${data.role}]`);
          onLoginSuccess(data.role);
        } else {
          throw new Error("장부에서 권한 정보를 찾을 수 없습니다. 🫦💦");
        }
      }
    } catch (err: any) {
      console.error("🫦 치명적 오류:", err.message);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafafa]">
      <div className="text-center mb-16 animate-fade-in">
        <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter animate-shimmer">BEYOND THE LINE</h1>
        <p className="mt-4 text-[10px] text-zinc-400 tracking-[0.8em] font-bold">SECURE GATEWAY 🫦</p>
      </div>
      
      <div className="w-full max-w-sm bg-white p-12 rounded-[4.5rem] shadow-2xl border border-white">
        <form onSubmit={handleLogin} className="flex flex-col gap-10">
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full h-14 bg-transparent border-b-2 border-zinc-100 px-2 text-center text-2xl font-black focus:border-zinc-900 outline-none placeholder:text-zinc-200"
            placeholder="IDENTITY"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-14 bg-transparent border-b-2 border-zinc-100 px-2 text-center text-2xl tracking-[0.8em] focus:border-zinc-900 outline-none placeholder:tracking-normal"
            placeholder="CODE"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-20 mt-6 bg-zinc-900 text-white rounded-[2.5rem] font-black text-2xl active:scale-95 transition-all italic shadow-lg"
          >
            {loading ? 'PENETRATING...' : 'ENTRANCE'}
          </button>
        </form>
      </div>
    </div>
  );
}