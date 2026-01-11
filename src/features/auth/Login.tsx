import { useState } from 'react';
import { useAuthCore } from './useAuthCore';

interface LoginProps {
  onLoginSuccess: (role: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading } = useAuthCore(onLoginSuccess);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(studentId, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 overflow-hidden font-['Montserrat']">
      <div className="w-full max-w-[400px] py-10 flex flex-col items-center animate-fade-in text-[#18181b]">
        
        {/* 🫦 [헤더] 3단 관통 레이아웃 */}
        <header className="text-center mb-16 w-full">
          <h1 className="leading-[1.1] tracking-[-0.05em] font-[900] uppercase italic">
            <span className="block text-[10vw] sm:text-[2.8rem] animate-shimmer">BEYOND THE</span>
            <span className="block text-[14vw] sm:text-[4rem] animate-shimmer">LINE</span>
            <span className="block text-[18vw] sm:text-[5.5rem] animate-shimmer mt-2 leading-none">MATH</span>
          </h1>
          <p className="mt-4 text-[10px] text-zinc-400 tracking-[0.8em] font-bold">토탈 학습 시스템 </p>
        </header>

        {/* 🫦 [폼] */}
        <form onSubmit={handleSubmit} className="w-full space-y-10">
          <div className="group relative">
            <label className="text-[10px] font-black text-zinc-300 tracking-widest block mb-1">IDENTITY</label>
            <input
              type="text"
              required
              className="w-full border-b-2 border-zinc-100 focus:border-zinc-900 outline-none py-3 text-center text-2xl font-black transition-all bg-transparent rounded-none"
              placeholder="IDENTITY"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>

          <div className="group relative">
            <label className="text-[10px] font-black text-zinc-300 tracking-widest block mb-1">CODE</label>
            <input
              type="password"
              required
              className="w-full border-b-2 border-zinc-100 focus:border-zinc-900 outline-none py-3 text-center text-2xl tracking-[0.5em] font-black transition-all bg-transparent rounded-none"
              placeholder="CODE"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-20 bg-zinc-900 text-white rounded-[2.5rem] font-[900] italic uppercase text-2xl tracking-[0.2em] active:scale-95 transition-all shadow-lg"
            >
              {loading ? 'PENETRATING...' : 'ENTRANCE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}