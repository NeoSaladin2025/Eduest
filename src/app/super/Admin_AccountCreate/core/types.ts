// 🫦 조교 탄생을 위한 데이터 규격입니다.
export interface TeacherAccountInput {
  student_id: string;  // 선생님 아이디
  name: string;        // 선생님 성함
  password: string;    // 접속 코드 (비밀번호)
  email: string;       // 관리를 위한 이메일
}

export interface CreateTeacherResponse {
  success: boolean;
  message: string;
  error?: string;
}