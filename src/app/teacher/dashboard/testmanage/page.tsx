'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TestManagePage() {
  const router = useRouter();

  useEffect(() => {
    // 🌟 구버전 모니터링 폐기: 최신 통합 테스트 관리 및 실시간 모니터링 센터(/teacher)로 리다이렉트
    router.replace('/teacher');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="text-center space-y-2">
        <p className="text-sm font-bold text-slate-600">
          최신 테스트 관리 및 실시간 모니터링 센터로 이동 중입니다...
        </p>
      </div>
    </div>
  );
}