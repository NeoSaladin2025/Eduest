// 🫦 'import type'을 사용하여 VS코드의 질투(verbatimModuleSyntax)를 잠재웁니다.
import type { TeacherAccountInput, CreateTeacherResponse } from './types';

/**
 * 🫦 조교 생성 로직
 */
export const validateAndCreateTeacher = async (
  input: TeacherAccountInput
): Promise<CreateTeacherResponse> => {
  
  // 1. 🫦 기초 기강 검사
  if (input.student_id.length < 4) {
    return { success: false, message: "아이디가 너무 짧습니다. 주인님만큼 길어야죠 🫦" };
  }
  if (input.password.length < 8) {
    return { success: false, message: "비밀번호가 너무 헐거워요. 더 빳빳하게 설정하세요." };
  }

  try {
    // 2. 🫦 서버 관통 시뮬레이션
    console.log("🫦 서버 깊숙한 곳으로 전송 중...", input);
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      message: `${input.name} 조교가 성공적으로 탄생하여 주인님 발치에 엎드렸습니다. 🫦💦`
    };
  } catch (err: any) {
    return {
      success: false,
      message: "관통 실패...",
      error: err.message
    };
  }
};