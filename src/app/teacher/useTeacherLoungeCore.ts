import { useState, useCallback } from 'react';
import { supabase } from '@/supabaseClient';

/**
 * @type DomainType
 * @description 선생님 라운지에서 제어 가능한 주요 서비스 도메인 목록
 */
export type DomainType = 'STUDENT_MGMT' | 'COURSE_MGMT' | 'TEXTBOOK_MGMT' | 'SEASON_MGMT';

/**
 * @function useTeacherLoungeCore
 * @description 라운지 전역의 도메인 전환, 본인 계정 보안 관리 및 세션 종료를 담당하는 통합 관제 엔진
 */
export const useTeacherLoungeCore = () => {
  // 현재 활성화된 도메인 상태 (초기값: 학생 관리)
  const [currentDomain, setCurrentDomain] = useState<DomainType>('STUDENT_MGMT');

  /**
   * @method navigateToDomain
   * @description 상단 GNB 메뉴 클릭 시 해당 도메인 모듈로 즉시 전환
   */
  const navigateToDomain = useCallback((domain: DomainType) => {
    setCurrentDomain(domain);
    console.log(`[관제소] 도메인이 ${domain}(으)로 전환되었습니다.`);
  }, []);

  /**
   * @method updateMyPassword
   * @description 현재 로그인된 관리자 본인의 비밀번호를 Auth 세션과 DB 장부에 동시 각인
   * @param newPassword 새롭게 설정할 주인님 전용 비밀번호
   */
  const updateMyPassword = useCallback(async (newPassword: string) => {
    try {
      // 1. Supabase Auth 엔진을 통해 로그인 세션의 비밀번호를 즉시 변경
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) throw authError;

      // 2. 현재 로그인된 사용자의 정보를 획득하여 public.users 테이블 정보 동기화
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { error: dbError } = await supabase
          .from('users')
          .update({ password: newPassword })
          .eq('id', user.id);

        if (dbError) throw dbError;
      }

      console.log("[보안] 주인님의 비밀번호가 시스템 전체에 성공적으로 재각인되었습니다.");
      return { success: true };
    } catch (error: any) {
      console.error("[보안 장애] 본인 비밀번호 변경 실패:", error.message);
      return { success: false, message: error.message };
    }
  }, []);

  /**
   * @method handleSignOut
   * @description 모든 세션 권한을 파기하고 관리자를 시스템 밖으로 안전하게 추방
   */
  const handleSignOut = useCallback(async () => {
    try {
      // 서버 세션 종료
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // 로컬 보안 데이터 소멸 처리
      localStorage.clear();
      
      // 로그인 관문으로 강제 이송
      window.location.href = '/login'; 
      console.log("[시스템] 세션 종료 완료. 안전하게 퇴장하셨습니다.");
    } catch (error: any) {
      console.error("[장애] 로그아웃 중 오류 발생:", error.message);
      alert("세션 종료 중 오류가 발생했습니다. 브라우저를 수동으로 닫아주십시오.");
    }
  }, []);

  return {
    currentDomain,
    navigateToDomain,
    updateMyPassword, // 🫦 본인 계정 조교(비번 변경) 기능 추가
    handleSignOut      // 세션 파기 기능
  };
};