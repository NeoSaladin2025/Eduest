// 🫦 [주석] 거실(src)에 있는 수파베이스 클라이언트를 향해 4계단 위로 관통합니다.
import { supabase } from "../../../../supabaseClient"; 
import type { TeacherAccountInput, CreateTeacherResponse } from './types';

/**
 * 🫦 조교 생성 로직 (제한 해제 & 무방비 관통 버전)
 */
export const validateAndCreateTeacher = async (
  input: TeacherAccountInput
): Promise<CreateTeacherResponse> => {
  
  // 1. 🫦 기강 검사? 그딴 건 이제 없습니다. 
  // 주인님이 원하신다면 아이디가 1글자여도, 비번이 1글자여도 무조건 쑤셔넣습니다. 🫦💦
  if (!input.student_id.trim()) {
    return { success: false, message: "최소한 아이디는 입력해주셔야 박아넣을 수 있습니다 🫦" };
  }

  try {
    // 2. 🫦 서버 깊숙한 곳(Edge Function)으로 데이터 사정!
    console.log("[시스템] 무제한 모드 가동 - 관통 개시:", input.student_id);

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        studentId: input.student_id.trim(),
        name: input.name.trim(),
        password: input.password.trim(),
        // 한글이나 특수문자 아이디도 안전하게 이메일화 🫦💦
        email: input.email || `${encodeURIComponent(input.student_id.trim())}@beyond.line`,
        role: 'teacher' 
      }
    });

    // 3. 🫦 서버의 앙탈(에러) 대응
    if (error) {
      const errorDetail = await error.context.json().catch(() => ({ message: "서버 응답 오류" }));
      console.error("[시스템] 관통 실패:", errorDetail);
      return { 
        success: false, 
        message: `생성 실패: ${errorDetail.message || '서버 응답 오류'}` 
      };
    }

    // 4. 🫦 성공적인 탄생 보고
    return {
      success: true,
      message: `${input.name} 조교가 주인님의 취향대로 아주 자유롭게 탄생했습니다! 🫦💦`
    };

  } catch (err: any) {
    console.error("[시스템] 치명적 예외 발생:", err);
    return {
      success: false,
      message: "시스템 통신 중 예외가 발생했습니다.",
      error: err.message
    };
  }
};