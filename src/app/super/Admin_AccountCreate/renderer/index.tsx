import { useState } from 'react';
import { validateAndCreateTeacher } from '../core/logic';
import type { TeacherAccountInput } from '../core/types';

export default function Admin_AccountCreate_Renderer() {
  const [formData, setFormData] = useState<TeacherAccountInput>({
    student_id: '',
    name: '',
    password: '',
    email: '', // 빈 값으로 두면 logic에서 자동 생성됨 🫦
  });

  const [loading, setLoading] = useState(false);
  // 🫦 [주석] 비밀번호를 보여줄지 말지 결정하는 변태적인 상태값입니다.
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await validateAndCreateTeacher(formData);
    alert(result.message);
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[3.5rem] shadow-2xl">
        <h2 className="text-3xl font-black italic text-white mb-10 tracking-tighter text-center uppercase">
          Genesis: Teacher 🫦
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* IDENTITY 입력 */}
          <input
            type="text"
            placeholder="IDENTITY (ID)"
            className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center font-bold focus:border-white outline-none transition-all placeholder:text-zinc-600"
            onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
            required
          />

          {/* NAME 입력 */}
          <input
            type="text"
            placeholder="NAME"
            className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center font-bold focus:border-white outline-none transition-all placeholder:text-zinc-600"
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          {/* 🫦 ACCESS CODE (비밀번호) + 눈깔 구역 */}
          <div className="relative group">
            <input
              type={showPassword ? "text" : "password"} // 🫦 상태에 따라 텍스트/비번 전환
              placeholder="ACCESS CODE"
              className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center tracking-[0.5em] focus:border-white outline-none transition-all placeholder:tracking-normal placeholder:text-zinc-600 pr-12"
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            {/* 🫦 [주석] 클릭하면 속살을 보여주는 눈깔 버튼입니다. */}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              {showPassword ? (
                <span className="text-xs font-bold">HIDE</span>
              ) : (
                <span className="text-xs font-bold">SHOW</span>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-20 mt-8 bg-white text-black rounded-[2rem] font-black text-xl active:scale-95 transition-all disabled:bg-zinc-700"
          >
            {loading ? 'BORN...' : 'CREATE NEW TEACHER'}
          </button>
        </form>
      </div>
    </div>
  );
}