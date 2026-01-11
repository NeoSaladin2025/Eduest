/**
 * @file logic.ts
 * @description 조교 계정 생성을 위한 비즈니스 로직 및 Supabase Edge Function 연동
 */

import { supabase } from "../../../../supabaseClient"; 
import type { TeacherAccountInput, CreateTeacherResponse } from './types';

/**
 * 조교 계정 생성 및 유효성 검증 함수
 * @param {TeacherAccountInput} input - 사용자로부터 입력받은 계정 정보
 * @returns {Promise<CreateTeacherResponse>} 처리 결과 및 메시지 객체 반환
 */
export const validateAndCreateTeacher = async (
  input: TeacherAccountInput
): Promise<CreateTeacherResponse> => {
  
  // 1. 필수 입력값 검증 (ID 확인)
  // 사용자 아이디가 비어있는지 확인하여 기본 보안 사항을 준수합니다.
  if (!input.student_id.trim()) {
    return { 
      success: false, 
      message: "계정 생성을 위해 아이디를 입력해 주십시오." 
    };
  }

  try {
    // 2. Supabase Edge Function 'create-user' 호출
    // 외부 Auth 관리 기능을 통해 보안이 강화된 사용자 생성을 수행합니다.
    console.info("[ADMIN] 조교 계정 생성 시도:", input.student_id);

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        studentId: input.student_id.trim(),
        name: input.name.trim(),
        password: input.password.trim(),
        // 식별 가능한 이메일 형식으로 변환 (특수문자 및 한글 처리 포함)
        email: input.email || `${encodeURIComponent(input.student_id.trim())}@beyond.line`,
        role: 'teacher' 
      }
    });

    // 3. API 응답 에러 핸들링
    // Edge Function에서 반환된 에러 객체를 분석하여 구체적인 원인을 파악합니다.
    if (error) {
      const errorDetail = await error.context.json().catch(() => ({ message: "알 수 없는 서버 오류가 발생했습니다." }));
      console.error("[ADMIN] 계정 생성 실패 상세:", errorDetail);
      
      return { 
        success: false, 
        message: `계정 생성 실패: ${errorDetail.message || '서버 응답 오류'}` 
      };
    }

    // 4. 빌드 에러 해결을 위한 'data' 변수 활용 처리
    // 선언된 'data'가 사용되지 않아 발생하는 TS6133 에러를 방지하기 위해 로깅합니다.
    if (data) {
      console.info("[ADMIN] 계정 생성 성공 응답 데이터 수신 완료");
    }

    // 5. 성공 결과 반환
    return {
      success: true,
      message: `${input.name} 조교 계정이 성공적으로 생성되었습니다.`
    };

  } catch (err: any) {
    // 예기치 못한 네트워크 오류 또는 런타임 예외 처리
    console.error("[SYSTEM] 시스템 치명적 오류:", err);
    return {
      success: false,
      message: "시스템 통신 중 예외가 발생했습니다.",
      error: err.message
    };
  }
};