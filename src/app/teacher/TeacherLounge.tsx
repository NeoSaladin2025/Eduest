/**
 * @file TeacherLounge.tsx
 * @description 교육 관리자용 중앙 관제 시스템 레이아웃 컴포넌트
 */

// 에러 발생 지점: React 17+ 환경에서는 JSX 사용 시 React 임포트가 필요하지 않습니다.
// TS6133 에러 해결을 위해 사용되지 않는 'React' 선언을 제거하였습니다.
import { useTeacherLoungeCore } from './useTeacherLoungeCore';

/** * @description 하위 도메인 모듈: 학생 관리 및 시즌 관리 시스템 임포트
 * 각 모듈은 독립된 비즈니스 로직과 UI 레이어를 가집니다.
 */
import StudentModule from './manage_student/StudentModule';
import SeasonModule from './manage_season/SeasonModule';

/**
 * @component TeacherLounge
 * @description 
 * 교육 관리자용 중앙 관제 시스템의 메인 레이아웃입니다.
 * 학생, 수업, 교재, 시즌 등 시스템 전반의 핵심 도메인을 제어합니다.
 */
const TeacherLounge = () => {
  /**
   * @constant useTeacherLoungeCore
   * @description 코어 비즈니스 로직 엔진으로부터 상태 및 핸들러 주입
   * - currentDomain: 현재 활성화된 관리 구역
   * - navigateToDomain: 도메인 이동 제어
   * - handleSignOut: 로그아웃 처리
   * - updateMyPassword: 비밀번호 변경 로직
   */
  const { 
    currentDomain, 
    navigateToDomain, 
    handleSignOut, 
    updateMyPassword 
  } = useTeacherLoungeCore();

  /**
   * @method handleChangeMyPassword
   * @description 관리자 보안 프로필(비밀번호) 수정을 위한 핸들러입니다.
   */
  const handleChangeMyPassword = async () => {
    const newPassword = prompt("보안을 위해 변경할 새로운 비밀번호를 입력하십시오.", "");
    
    // 입력값이 존재할 경우 유효성 검사 및 업데이트 프로세스 진행
    if (newPassword) {
      const result = await updateMyPassword(newPassword);
      if (result.success) {
        alert("보안 정책에 따라 비밀번호가 즉각 반영되었습니다.");
      } else {
        alert("데이터베이스 트랜잭션 오류: " + result.message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#ffffff] text-[#111827] antialiased font-sans">
      
      {/* @section Global Navigation Bar (GNB)
          시스템의 최상위 계층 통제 구역입니다.
      */}
      <nav className="fixed top-0 z-50 w-full bg-[#ffffff] border-b border-[#f3f4f6] px-10 h-20 flex justify-between items-center shadow-sm">
        
        {/* 브랜딩 및 메인 메뉴 섹션 */}
        <div className="flex items-center gap-14">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => window.location.reload()}
          >
            <div className="w-7 h-7 bg-[#001f3f] rounded-sm" />
            <h1 className="text-xl font-[900] tracking-tight text-[#001f3f]">BTL Math</h1>
          </div>
          
          <div className="flex gap-10 h-20">
            {[
              { id: 'STUDENT_MGMT', label: '학생 관리' },
              { id: 'COURSE_MGMT', label: '수업 관리' },
              { id: 'TEXTBOOK_MGMT', label: '교재 관리' },
              { id: 'SEASON_MGMT', label: '시즌 관리' }
            ].map((menu) => (
              <button 
                key={menu.id}
                onClick={() => navigateToDomain(menu.id as any)}
                className={`text-sm font-bold transition-all border-b-2 px-1 ${
                  currentDomain === menu.id 
                  ? 'border-[#001f3f] text-[#001f3f]' 
                  : 'border-transparent text-[#9ca3af] hover:text-[#111827]'
                }`}
              >
                {menu.label}
              </button>
            ))}
          </div>
        </div>

        {/* 보안 및 세션 제어 섹션 */}
        <div className="flex items-center gap-6">
          <button 
            onClick={handleChangeMyPassword}
            className="text-xs font-bold text-[#001f3f] hover:text-[#ff4d6d] transition-colors uppercase tracking-widest"
          >
            비밀번호 변경
          </button>

          <div className="h-4 w-[1px] bg-[#f3f4f6]" />

          <button 
            onClick={handleSignOut}
            className="text-xs font-bold text-[#9ca3af] hover:text-[#ef4444] transition-colors uppercase tracking-widest"
          >
            로그아웃
          </button>
        </div>
      </nav>

      {/* @section Dynamic Module Container
          선택된 도메인에 따라 해당 비즈니스 컴포넌트를 동적으로 렌더링합니다.
      */}
      <div className="pt-20">
        <main className="animate-in fade-in duration-500">
          
          {/* 학생 관리: 인적 자원 제어 모듈 */}
          {currentDomain === 'STUDENT_MGMT' && (
            <StudentModule />
          )}

          {/* 수업 관리: 구축 중 상태 표시 */}
          {currentDomain === 'COURSE_MGMT' && (
            <div className="flex items-center justify-center h-[calc(100vh-5rem)] text-[#d1d5db] font-bold tracking-widest text-xs bg-[#fafafa]">
              수업_관리_모듈_구축_중
            </div>
          )}

          {/* 교재 관리: 구축 중 상태 표시 */}
          {currentDomain === 'TEXTBOOK_MGMT' && (
            <div className="flex items-center justify-center h-[calc(100vh-5rem)] text-[#d1d5db] font-bold tracking-widest text-xs bg-[#fafafa]">
              교재_인벤토리_모듈_구축_중
            </div>
          )}

          {/* 시즌 관리: 통합 완료된 비즈니스 로직 모듈 */}
          {currentDomain === 'SEASON_MGMT' && (
            <SeasonModule />
          )}
        </main>
      </div>
    </div>
  );
};

export default TeacherLounge;