import React, { useState } from 'react';
import { useStudentMakerCore } from './useStudentMakerCore';
import type { StudentProfile } from './useStudentMakerCore';

/**
 * @component StudentMaker
 * @description 학생 계정 발급, 학년 지정, 비밀번호 실시간 감시 및 계정 영구 방출 기능을 통합 관리하는 UI 컴포넌트
 */
const StudentMaker = () => {
  // 코어 엔진으로부터 학생 목록 상태 및 제어 함수 주입
  const { 
    students, 
    loading, 
    createStudentAccount, 
    updateStudentInfo, // 학년과 비밀번호를 동시에 제어하기 위한 핵심 엔진
    deleteStudentAccount 
  } = useStudentMakerCore();
  
  // 신규 계정 생성을 위한 입력 상태 관리
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [grade, setGrade] = useState('중1');

  /**
   * @method handleRegister
   * @description 관리자 권한을 통한 신규 학생 계정 생성 실행 (학년 정보 포함)
   */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !studentId.trim()) {
      alert("학생 성함과 아이디를 모두 정확히 입력하십시오.");
      return;
    }

    const res = await createStudentAccount({ name, studentId, grade });

    if (res.success) {
      alert(`${grade} ${name} 학생 계정이 성공적으로 발급되었습니다.`);
      setName('');
      setStudentId('');
      setGrade('중1');
    } else {
      alert(`계정 생성 실패: ${res.message || "서버 통신 상태를 확인하십시오."}`);
    }
  };

  /**
   * @method handleInfoUpdate
   * @description 
   * [통합 수정] 학생의 학년과 비밀번호를 순차적으로 수정하여 계정 제어권 행사
   * 1단계: 학년 변경 (학년 진급 및 데이터 정정 반영)
   * 2단계: 비밀번호 변경 (보안 정책에 따른 계정 제어)
   * @param student 수정 대상 학생의 전체 프로필 객체
   */
  const handleInfoUpdate = async (student: StudentProfile) => {
    // 1. 학년 정보 수정 프로세스 (기존 학년을 기본값으로 제시)
    const nextGrade = prompt(`[정보 관리] ${student.name} 학생의 현재 학년: ${student.grade}\n변경할 새로운 학년(예: 중2, 고1)을 입력하십시오.`, student.grade);
    if (nextGrade === null) return; // 사용자가 취소를 선택한 경우 프로세스 중단

    // 2. 비밀번호 정보 수정 프로세스 (기존 비밀번호를 기본값으로 제시)
    const nextPw = prompt(`[비밀번호 관리] 현재 설정값: ${student.password}\n변경할 새로운 비밀번호를 입력하십시오.\n(변경을 원치 않으시면 확인을 누르십시오.)`, student.password);
    if (nextPw === null) return;

    // 데이터베이스 반영을 위한 업데이트 페이로드 구성
    const updates: { grade?: string; password?: string } = { grade: nextGrade };
    
    // 비밀번호가 변경된 경우에만 페이로드에 포함
    if (nextPw !== student.password) {
      updates.password = nextPw;
    }

    const res = await updateStudentInfo(student.id, updates);
    if (res.success) {
      alert("학생의 정보가 성공적으로 업데이트되었습니다.");
    } else {
      alert(`수정 실패: ${res.message}`);
    }
  };

  /**
   * @method handleDelete
   * @description 특정 학생의 모든 데이터를 시스템 및 인증 서버에서 소멸시키는 방출 집행
   */
  const handleDelete = async (id: string) => {
    const res = await deleteStudentAccount(id);
    if (res?.success) {
      alert("해당 학생의 모든 기록이 시스템에서 영구 소멸되었습니다.");
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-700">
      
      {/* SECTION: 계정 생성 및 발급 제어 유닛 */}
      <section className="bg-white p-8 rounded-[2.5rem] border border-[#f3f4f6] shadow-sm">
        <header className="mb-6">
          <h4 className="text-xl font-black text-[#001f3f]">학생 계정 발급 센터</h4>
          <p className="text-xs text-[#9ca3af] font-bold mt-1">
            신규 등록 시 초기 비밀번호는 1234로 고정되며, 학년별 계급 체계에 따라 즉시 발급됩니다.
          </p>
        </header>

        <form onSubmit={handleRegister} className="flex flex-col md:flex-row gap-4">
          <select 
            className="flex-1 px-6 py-4 bg-[#fafafa] rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#001f3f] transition-all cursor-pointer appearance-none"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="중1">중1</option>
            <option value="중2">중2</option>
            <option value="중3">중3</option>
            <option value="고1">고1</option>
            <option value="고2">고2</option>
            <option value="고3">고3</option>
          </select>

          <input 
            className="flex-1 px-6 py-4 bg-[#fafafa] rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#001f3f] transition-all"
            placeholder="학생 성함"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input 
            className="flex-1 px-6 py-4 bg-[#fafafa] rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#001f3f] transition-all"
            placeholder="로그인 아이디"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
          <button 
            type="submit"
            disabled={loading}
            className="px-10 py-4 bg-[#001f3f] text-white rounded-2xl font-black text-sm hover:shadow-lg hover:shadow-[#001f3f]/20 transition-all active:scale-95 disabled:bg-gray-300"
          >
            {loading ? "통신 중" : "계정 생성"}
          </button>
        </form>
      </section>

      {/* SECTION: 학생 명단 및 지배권 행사 유닛 */}
      <section className="bg-white p-8 rounded-[2.5rem] border border-[#f3f4f6] shadow-sm text-center">
        <header className="mb-8 flex justify-between items-center px-4">
          <h4 className="text-xl font-black text-[#001f3f]">등록 학생 명단 및 계정 제어</h4>
          <span className="text-[10px] font-bold text-[#9ca3af] bg-[#fafafa] px-3 py-1 rounded-full border border-[#f3f4f6]">
            Total: {students.length}명
          </span>
        </header>

        <div className="w-full overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-black text-[#d1d5db] uppercase border-b border-[#f3f4f6] tracking-widest">
                <th className="pb-4 px-4 text-center">학년</th>
                <th className="pb-4 px-4 text-center">아이디</th>
                <th className="pb-4 px-4 text-center">성함</th>
                <th className="pb-4 px-4 text-center">비밀번호</th>
                <th className="pb-4 px-4 text-right">관리 액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#fafafa]">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-24 text-center">
                    <p className="text-xs font-black text-[#d1d5db] tracking-tighter">
                      {loading ? "데이터를 동기화하고 있습니다" : "등록된 학생 데이터가 없습니다"}
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-[#fafafa]/50 transition-colors group">
                    <td className="py-6 px-4 font-black text-[#001f3f] text-center">
                      <span className="px-3 py-1 bg-[#f3f4f6] rounded-lg">{student.grade}</span>
                    </td>
                    <td className="py-6 px-4 font-bold text-gray-500 text-center">{student.student_id}</td>
                    <td className="py-6 px-4 font-bold text-gray-600 text-center">{student.name}</td>
                    <td className="py-6 px-4 text-center">
                      <span className="bg-[#fff0f3] text-[#ff4d6d] px-4 py-2 rounded-xl font-mono font-black text-sm border border-[#ffccd5] shadow-sm">
                        {student.password}
                      </span>
                    </td>
                    <td className="py-6 px-4 text-right space-x-2">
                      <button 
                        onClick={() => handleInfoUpdate(student)}
                        className="px-4 py-2 bg-[#001f3f] text-white rounded-xl font-black text-[10px] hover:bg-[#003366] transition-all shadow-sm"
                      >
                        수정
                      </button>
                      <button 
                        onClick={() => handleDelete(student.id)}
                        className="px-4 py-2 bg-[#ff4d6d] text-white rounded-xl font-black text-[10px] hover:bg-[#c9184a] transition-all shadow-sm"
                      >
                        방출
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default StudentMaker;