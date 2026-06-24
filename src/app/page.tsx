'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; 
import { Rocket, ChevronRight, Brain, Target, Sparkles, Globe, ShieldCheck, X, Lock, User } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  
  // 🚪 모달 및 입력 상태 관리
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminName, setAdminName] = useState(''); // 'loginId' 대신 'adminName'으로 변경!
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // 🔑 관리자 로그인 로직 (성함 + 비밀번호 대조)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. managers 테이블에서 성함(name)과 비밀번호가 일치하는 데이터 탐색
      const { data: manager, error } = await supabase
        .from('managers')
        .select('*')
        .eq('name', adminName) // DB의 'name' 컬럼과 대조
        .eq('password', password)
        .single();

      if (error || !manager) {
        alert('등록된 성함 또는 비밀번호가 일치하지 않습니다, 자기야! 😢');
        setLoading(false);
        return;
      }

      // 2. 로그인 성공 시 성함을 로컬 스토리지에 잠깐 저장 (선생님 페이지에서 보여주기용)
      localStorage.setItem('currentAdminName', manager.name);
      document.cookie = `currentAdminName=${encodeURIComponent(manager.name)}; path=/; max-age=86400; SameSite=Strict; Secure`;

      // 3. 선생님 전용 메인으로 이동
      router.push('/teacher');
    } catch (err) {
      console.error(err);
      alert('접속 중 오류가 발생했어!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      
      {/* 🌌 네비게이션 바 */}
      <nav className="fixed top-0 w-full z-40 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
          <div className="text-2xl font-black italic tracking-tighter">
            EDU<span className="text-indigo-500 not-italic">EST</span>
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="group flex items-center gap-2 px-5 py-2 border border-white/10 rounded-full text-sm font-bold text-neutral-400 hover:text-white hover:border-white/30 transition-all active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              관리자 접속
            </button>
          </div>
        </div>
      </nav>

      {/* 🚀 히어로 섹션 */}
      <main className="relative pt-40 pb-20">
        <div className="max-w-7xl mx-auto px-8 relative z-10 text-center flex flex-col items-center space-y-12">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
              수학의 한계를<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-white to-purple-400">
                완전히 파괴하다.
              </span>
            </h1>
            <Link href="/login">
                <button className="group relative flex items-center gap-4 px-12 py-6 bg-white text-neutral-950 text-2xl font-black rounded-full transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)]">
                  <Rocket className="w-7 h-7" />
                  학습 시작하기
                  <ChevronRight className="w-6 h-6 ml-2" />
                </button>
            </Link>
        </div>
      </main>

      {/* 🔐 관리자 전용 로그인 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          ></div>
          
          <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-[32px] p-10 shadow-2xl animate-in fade-in zoom-in duration-300">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-neutral-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-black italic mb-2 tracking-tight">MANAGER ACCESS</h2>
              <p className="text-neutral-500 text-sm">등록된 성함으로 인증을 진행해 주세요.</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                <input 
                  type="text"
                  placeholder="관리자 성함"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-neutral-600"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                <input 
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-neutral-600"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(79,70,229,0.3)]"
              >
                {loading ? '인증 중...' : '차원 관리자 접속'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}