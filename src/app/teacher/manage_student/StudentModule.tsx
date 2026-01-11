import React from 'react';
/** * @description 핵심 비즈니스 로직 및 타입 정의 임포트
 * 경로 오류(2307) 방지를 위해 상대 경로를 정밀하게 재설정하였습니다.
 */
import { useStudentMakerCore } from './account/useStudentMakerCore';
import type { StudentProfile } from './account/useStudentMakerCore';

/** * @description 하위 서비스 컴포넌트 임포트
 * 학생 계정 생성 및 리스트 관리 인터페이스입니다.
 */
import StudentMaker from './account/StudentMaker';

/**
 * @interface NavigationItem
 * @description 사이드 네비게이션 구성을 위한 데이터 규격 정의
 */
interface NavigationItem {
  id: string;
  label: string;
  description: string;
}

/**
 * @constant SERVICE_NAVIGATION
 * @description 학생 관리 도메인 내에서 제공되는 세부 서비스 리스트입니다.
 */
const SERVICE_NAVIGATION: NavigationItem[] = [
  { 
    id: 'ACCOUNT_MANAGEMENT', 
    label: '계정 생성 및 관리', 
    description: '학생 계정 발급, 리스트 조회 및 학년/비밀번호 데이터 제어' 
  }
];

/**
 * @component StudentModule
 * @description 
 * 학생 관리 시스템의 최상위 컨테이너 컴포넌트입니다.
 * 학부모 참관 및 관리자 운영 효율을 고려한 고해상도 비즈니스 레이아웃을 제공합니다.
 */
const StudentModule = () => {
  // 현재 활성화된 서비스 아이디 관리 (기본값: 계정 관리)
  const [activeService, setActiveService] = React.useState('ACCOUNT_MANAGEMENT');
  
  // 로직 엔진으로부터 데이터 로딩 상태 주입
  const { loading } = useStudentMakerCore();
  
  // 현재 활성화된 서비스의 메타데이터를 추출합니다.
  const currentServiceInfo = SERVICE_NAVIGATION.find((item) => item.id === activeService);

  return (
    <div className="flex w-full min-h-[calc(100vh-5rem)] bg-[#fafafa]">
      
      {/* @section 사이드바 LNB (Left Navigation Bar)
          시스템 하위 도메인 간의 빠른 전환을 위한 수직 네비게이션 구역입니다.
      */}
      <aside className="fixed w-72 h-[calc(100vh-5rem)] bg-[#ffffff] border-r border-[#f3f4f6] p-8 flex flex-col justify-between shadow-sm z-10">
        <div className="w-full">
          {/* 모듈 헤더: 현재 접속 중인 도메인 명시 */}
          <header className="mb-10 px-2">
            <p className="text-[10px] font-bold text-[#d1d5db] tracking-[0.2em] uppercase mb-1">
              Administration
            </p>
            <h2 className="text-xl font-[900] text-[#111827] tracking-tighter">
              학생 관리
            </h2>
          </header>

          {/* 서비스 전환 네비게이션 리스트 */}
          <nav className="flex flex-col gap-1.5 w-full">
            {SERVICE_NAVIGATION.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveService(item.id)}
                className={`w-full text-left px-5 py-4 rounded-2xl transition-all ${
                  activeService === item.id 
                  ? 'bg-[#f3f4f6] text-[#001f3f]' 
                  : 'text-[#9ca3af] hover:bg-[#fafafa] hover:text-[#111827]'
                }`}
              >
                <p className="text-xs font-bold">{item.label}</p>
              </button>
            ))}
          </nav>
        </div>

        {/* 시스템 하단 세션 상태 표시줄 */}
        <div className="px-2 py-6 border-t border-[#f3f4f6]">
          <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
            {loading ? 'Processing' : 'Service Active'}
          </span>
        </div>
      </aside>

      {/* @section 메인 컨텐츠 섹션
          선택된 비즈니스 모듈(StudentMaker)이 렌더링되는 구역입니다.
      */}
      <section className="flex-1 ml-72 p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {/* 섹션 타이틀 및 가이드 텍스트 로드 */}
          <header className="mb-12">
            <h3 className="text-4xl font-[900] tracking-tight text-[#111827]">
              {currentServiceInfo?.label}
            </h3>
            <p className="mt-2 text-[#9ca3af] text-sm font-medium">
              {currentServiceInfo?.description}
            </p>
          </header>

          {/* @render 계정 관리 모듈 연동
              학생 계정 생성, 학년 수정, 비밀번호 제어 기능을 수행하는 StudentMaker 컴포넌트 호출
          */}
          {activeService === 'ACCOUNT_MANAGEMENT' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StudentMaker />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default StudentModule;