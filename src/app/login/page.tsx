'use client';

import React from 'react';
import Link from 'next/link';
import { MessageCircle, ShieldCheck, ArrowLeft, Zap } from 'lucide-react';

/**
 * [코딩마스터 보희설 - EDUEST 전용 로그인 포털]
 * - 직관적인 폴더 구조: app/login/page.tsx
 * - 메인 랜딩의 '지구 최강' 감성을 그대로 계승한 하이테크 UI
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* 🌌 배경 이펙트: 대문과 통일된 우주 오로라 느낌 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 blur-[150px] rounded-full z-0 pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full z-0 pointer-events-none"></div>

      {/* ⬅️ 뒤로가기: 메인 대문으로 돌아가기 */}
      <Link 
        href="/" 
        className="absolute top-8 left-8 flex items-center gap-2 text-neutral-500 hover:text-white transition-all group z-20"
      >
        <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </div>
        <span className="text-sm font-medium">대문으로 돌아가기</span>
      </Link>

      {/* 🎫 로그인 카드 섹션 */}
      <main className="z-10 w-full max-w-[420px]">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[40px] shadow-2xl relative overflow-hidden">
          
          {/* 상단 장식 라인 */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>

          {/* 로고 영역 */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600/20 rounded-2xl mb-6 border border-indigo-500/30">
              <Zap className="w-8 h-8 text-indigo-400 fill-indigo-400/20" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter mb-2">
              EDU<span className="text-indigo-500 not-italic">EST</span>
            </h1>
            <p className="text-neutral-500 text-[10px] tracking-[0.4em] uppercase font-mono">
              Identity Verification
            </p>
          </div>

          {/* 본문 텍스트 */}
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">반가워요, 수학 정복자님!</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              지구 최강 수학 차원에 접속하기 위해<br />카카오 인증을 진행해 주세요.
            </p>
          </div>

          {/* 🟡 카카오 로그인 버튼 (핵심!) */}
          <div className="space-y-4">
            <button 
              className="w-full flex items-center justify-center gap-3 bg-[#FEE500] text-[#191919] py-4 rounded-2xl font-black text-lg hover:bg-[#FADA0A] hover:shadow-[0_0_25px_rgba(254,229,0,0.3)] transition-all transform active:scale-[0.98]"
            >
              <MessageCircle className="w-6 h-6 fill-current" />
              카카오로 시작하기
            </button>
            
            <p className="text-[11px] text-center text-neutral-600 px-4">
              로그인 시 에듀이스트의 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
            </p>
          </div>

          {/* 보안 뱃지 */}
          <div className="mt-10 flex justify-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">
                Secure SSL Encrypted
              </span>
            </div>
          </div>
        </div>

        {/* 푸터 문구 */}
        <div className="mt-8 text-center">
          <p className="text-neutral-700 text-[10px] font-mono tracking-widest">
            PROJECT EDUEST © 2026 / ALL RIGHTS RESERVED
          </p>
        </div>
      </main>
    </div>
  );
}