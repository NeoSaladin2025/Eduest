import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

/**
 * @interface StudentProfile
 * @description 학생 사용자의 상세 정보 규격 정의 (데이터베이스 레코드 구조)
 */
export interface StudentProfile {
  id: string;          // 고유 식별자 (UUID)
  student_id: string;  // 학생 로그인 아이디
  name: string;        // 학생 성명
  password: string;    // 관리용 비밀번호 (DB 기록용)
  role: string;        // 계정 권한 (student)
  grade: string;       // 학년 정보
  created_at: string;  // 계정 생성 일시
}

/**
 * @function useStudentMakerCore
 * @description 학생 계정 통합 관리 서비스 (조회, 생성, 수정, 삭제 기능 포함)
 */
export const useStudentMakerCore = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  /**
   * @method fetchStudentList
   * @description 데이터베이스로부터 최신 학생 명단을 조회하여 상태를 동기화합니다.
   */
  const fetchStudentList = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, student_id, name, password, role, grade, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudents(data || []);
      console.log("[시스템] 학생 데이터베이스 동기화 완료.");
    } catch (error: any) {
      console.error("[오류] 학생 데이터 로드 실패:", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * @method createStudentAccount
   * @description 신규 학생 계정을 생성합니다. 인증 서버(Auth)와 데이터베이스(DB)에 동시 등록됩니다.
   * @param payload 학생 성명, 아이디, 학년 정보를 포함한 객체
   */
  const createStudentAccount = async (payload: { name: string; studentId: string; grade: string }) => {
    setLoading(true);
    try {
      // 1. 현재 관리자(사용자)의 인증 세션 토큰을 획득합니다.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("유효한 관리자 세션이 없습니다. 다시 로그인해 주세요.");
      }

      // 2. 엣지 펑션 'create-user'를 호출하여 보안이 유지된 상태로 계정을 생성합니다.
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          studentId: payload.studentId,
          name: payload.name,
          password: '1234', // 초기 비밀번호 설정
          classId: 1,       // 기본 클래스 할당
          grade: payload.grade 
        },
        headers: {
          Authorization: `Bearer ${session.access_token}` 
        }
      });

      if (error) throw error;
      
      console.log("[시스템] 엣지 펑션 응답:", data.message);
      await fetchStudentList(); // 생성 후 리스트 즉시 갱신
      return { success: true };

    } catch (error: any) {
      console.error("[오류] 학생 계정 생성 실패:", error.message);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * @method updateStudentInfo
   * @description 학생의 비밀번호 및 학년 정보를 수정합니다. 
   * 비밀번호 수정 시 인증 서버(Auth)의 로그인 비밀번호와 데이터베이스의 기록을 동시에 변경합니다.
   * @param id 대상 학생의 UUID
   * @param updates 수정할 항목 (비밀번호 또는 학년)
   */
  const updateStudentInfo = async (id: string, updates: { password?: string; grade?: string }) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // [핵심 로직] 비밀번호 변경 요청이 포함된 경우, 엣지 펑션을 통해 Auth 서버의 비밀번호를 강제 업데이트합니다.
      // 이를 통해 수파베이스의 기본 비밀번호 복잡도 제한을 우회하거나 관리자 권한으로 즉시 변경이 가능합니다.
      if (updates.password) {
        const { error: authUpdateError } = await supabase.functions.invoke('update-user-password', {
          body: { 
            userId: id, 
            newPassword: updates.password 
          },
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
        if (authUpdateError) throw authUpdateError;
        console.log("[시스템] 인증 서버(Auth) 비밀번호 동기화 완료.");
      }

      // [DB 업데이트] 데이터베이스 내의 사용자 프로필 정보를 최신화합니다.
      const { error: dbUpdateError } = await supabase
        .from('users')
        .update({
          ...(updates.password && { password: updates.password }),
          ...(updates.grade && { grade: updates.grade })
        })
        .eq('id', id);

      if (dbUpdateError) throw dbUpdateError;

      console.log("[시스템] 학생 프로필 정보 수정 완료.");
      await fetchStudentList(); // 수정 후 리스트 갱신
      return { success: true };
    } catch (error: any) {
      console.error("[오류] 정보 수정 실패:", error.message);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * @method deleteStudentAccount
   * @description 해당 학생의 모든 데이터와 인증 계정을 시스템에서 영구적으로 삭제(방출)합니다.
   * @param studentId 삭제할 사용자의 UUID
   */
  const deleteStudentAccount = async (studentId: string) => {
    if (!confirm("해당 학생을 정말로 시스템에서 방출하시겠습니까?\n이 작업은 복구할 수 없습니다.")) {
      return { success: false, message: "사용자에 의해 작업이 취소되었습니다." };
    }
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 엣지 펑션을 호출하여 Auth 계정과 연관된 모든 DB 데이터를 안전하게 제거합니다.
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId: studentId },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      console.log(`[시스템] 학생(ID: ${studentId}) 계정 영구 삭제 완료.`);
      await fetchStudentList(); // 삭제 후 리스트 갱신
      return { success: true };
    } catch (error: any) {
      console.error("[오류] 계정 삭제 실패:", error.message);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  // 컴포넌트 마운트 시 최초 1회 명단 로드
  useEffect(() => {
    fetchStudentList();
  }, [fetchStudentList]);

  return { 
    students, 
    loading, 
    createStudentAccount, 
    updateStudentInfo,
    deleteStudentAccount,
    refresh: fetchStudentList 
  };
};