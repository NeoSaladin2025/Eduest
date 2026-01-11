/**
 * @file useAuthCore.ts
 * @description Supabase Edge Function을 활용한 커스텀 인증 로직 훅
 */

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 초기화 (환경 변수 참조)
// 프로젝트 루트의 .env 파일에 설정된 URL과 Anon Key를 사용합니다.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * 인증 코어 비즈니스 로직을 담당하는 커스텀 훅
 * @param onSuccess - 로그인 성공 시 권한(Role)에 따른 콜백 함수
 */
export const useAuthCore = (onSuccess: (role: string) => void) => {
  const [loading, setLoading] = useState(false);

  /**
   * 사용자 로그인을 처리하는 메인 함수
   * @param studentId - 학번 또는 사용자 ID
   * @param password - 사용자 비밀번호
   */
  const login = async (studentId: string, password: string) => {
    // 로딩 상태 시작 - UI에서 중복 요청을 방지합니다.
    setLoading(true);
    
    try {
      console.info("[AUTH-GATE]: 인증 프로세스 개시 - ID:", studentId);

      // 1. Supabase Edge Function 'auth-gate' 호출
      // 보안을 위해 직접적인 DB 접근 대신 Edge Function을 경유합니다.
      const { data, error } = await supabase.functions.invoke('auth-gate', {
        body: { 
          studentId: studentId.trim(), 
          password: password.trim() 
        },
        headers: {
          // 익명 키를 헤더에 포함하여 권한을 증명합니다.
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
      });

      // 2. 서버 측 에러 처리
      // Edge Function 내부에서 발생한 커스텀 에러를 포착합니다.
      if (error) {
        // 에러 컨텍스트에서 상세 메시지를 추출하며, 실패 시 기본 메시지를 할당합니다.
        const serverError = await error.context.json().catch(() => ({ message: "서버 응답 해석 실패" }));
        console.error("[AUTH-GATE] 서버 응답 에러:", serverError);
        throw new Error(serverError.message || '인증 정보가 일치하지 않습니다.');
      }

      // 3. 수신된 세션 정보 기반 세션 활성화 (Persistence 적용)
      // Edge Function이 반환한 access_token과 refresh_token을 클라이언트 세션에 주입합니다.
      if (data && data.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token || '',
        });

        if (sessionError) {
          console.error("[AUTH-GATE] 세션 주입 실패:", sessionError.message);
          throw new Error("인증 세션 생성 중 오류가 발생했습니다.");
        }

        // 4. 사용자 역할(Role) 확인 및 후속 처리
        // 성공 시 정의된 콜백 함수를 호출하여 페이지 이동 등을 처리합니다.
        if (data.role) {
          console.info(`[AUTH-GATE]: 인증 성공! 사용자 권한: [${data.role}]`);
          onSuccess(data.role);
        } else {
          throw new Error("사용자 권한 정보를 찾을 수 없습니다.");
        }
      } else {
        throw new Error("인증 데이터가 유효하지 않습니다.");
      }
      
    } catch (err: any) {
      // 모든 예외 사항에 대해 로그를 남기고 사용자에게 알림을 제공합니다.
      console.error("[AUTH-GATE] 치명적 오류 발생:", err.message);
      alert(err.message); 
    } finally {
      // 처리 완료 후 로딩 상태 해제
      setLoading(false);
    }
  };

  return { login, loading };
};