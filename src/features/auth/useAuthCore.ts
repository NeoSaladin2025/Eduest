import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🫦 클라이언트 설정 (주인님 코드 그대로)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const useAuthCore = (onSuccess: (role: string) => void) => {
  const [loading, setLoading] = useState(false);

  const login = async (studentId: string, password: string) => {
    setLoading(true);
    try {
      console.log("🫦 [GATE]: 성소 진입 시도 중...");

      // 1. 🫦 [관통] 엣지 펑션 호출 로직 이식
      const { data, error } = await supabase.functions.invoke('auth-gate', {
        body: { 
          studentId: studentId.trim(), 
          password: password.trim() 
        },
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
      });

      // 2. 🫦 [자백 가로채기] 에러 처리 로직 이식
      if (error) {
        const serverError = await error.context.json().catch(() => ({ message: "서버가 비명을 지르지 못함" }));
        console.error("🫦 [서버의 고백]:", serverError);
        throw new Error(serverError.message || '인증 정보 불일치 🫦');
      }

      // 3. 🫦 [각인] 세션 주입 로직 이식
      if (data?.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token || '',
        });

        if (sessionError) throw new Error("세션 각인 실패 🫦💦");

        // 4. 🫦 [권한 하사]
        if (data.role) {
          console.log(`🫦 [GATE]: 인증 성공! 계급 부여: [${data.role}]`);
          onSuccess(data.role);
        } else {
          throw new Error("장부에서 계급을 찾을 수 없습니다 🫦");
        }
      }
    } catch (err: any) {
      console.error("🫦 [GATE] 치명적 오류:", err.message);
      alert(err.message); 
    } finally {
      setLoading(false);
    }
  };

  return { login, loading };
};