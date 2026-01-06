import { useState, useEffect } from 'react';
import Login from './features/auth/Login';

// 🫦 유배지에서 불러오기 (파일 경로 기강 확립)
// VS코드 설정에 따라 자동 import가 되었다면 경로가 맞는지 확인하십시오.
import SuperSanctuary from './app/super/SuperSanctuary';

/**
 * 🫦 임시 대시보드 (아직 분리 전이라면 잠시 수용)
 * 나중에 각각 app/teacher, app/student 폴더로 유배 보낼 예정입니다.
 */
const AdminDashboard = () => (
  <div className="min-h-screen flex items-center justify-center text-5xl font-black bg-white text-black">
    ADMIN DASHBOARD
  </div>
);

const TeacherLounge = () => (
  <div className="min-h-screen flex items-center justify-center text-5xl font-black italic bg-zinc-50 text-zinc-800">
    TEACHER LOUNGE 🫦
  </div>
);

const StudentRoom = () => (
  <div className="min-h-screen flex items-center justify-center text-5xl font-black bg-[#fafafa] text-zinc-400">
    STUDENT ROOM
  </div>
);

function App() {
  // 🫦 유저의 역할을 저장하는 상태
  const [userRole, setUserRole] = useState<string | null>(null);

  // 🫦 [감시] 롤이 바뀔 때마다 시스템 로그를 남겨 기강을 잡습니다.
  useEffect(() => {
    if (userRole) {
      console.log(`🫦 [SYSTEM]: 유저 권한 감지 -> [${userRole}]`);
    }
  }, [userRole]);

  // 1. 🫦 인증되지 않은 존재는 입구(Login)에서 차단합니다.
  if (!userRole) {
    return (
      <Login 
        onLoginSuccess={(role) => {
          console.log("🫦 [GATE]: 인증 성공, 역할 하사:", role);
          setUserRole(role);
        }} 
      />
    );
  }

  // 2. 🫦 계급별 성벽으로 배정 (Switch-Gate)
  // 주인님의 설계대로 역할에 따라 다른 성소로 관통시킵니다.
  switch (userRole.toLowerCase()) {
    case 'super':
      return <SuperSanctuary />;
    case 'admin':
      return <AdminDashboard />;
    case 'teacher':
      return <TeacherLounge />;
    case 'student':
      return <StudentRoom />;
    default:
      console.error(`⚠️ 침입자 발생: ${userRole}`);
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-red-50">
          <p className="text-2xl font-bold mb-4 text-red-600">권한이 부정되었습니다. 🫦💦</p>
          <button 
            onClick={() => setUserRole(null)} 
            className="px-8 py-4 bg-black text-white rounded-full font-bold hover:scale-105 transition-all"
          >
            회귀하기
          </button>
        </div>
      );
  }
}

export default App;