import { useState } from 'react';
// 🧠 Core의 뇌와 타입을 불러옵니다. 여기서도 type 수입 기강을 잡습니다.
import { validateAndCreateTeacher } from '../core/logic';
import type { TeacherAccountInput } from '../core/types';

export default function Admin_AccountCreate_Renderer() {
  const [formData, setFormData] = useState<TeacherAccountInput>({
    student_id: '',
    name: '',
    password: '',
    email: 'teacher@beyond.line', // 기본값 설정
  });

  const [loading, setLoading] = useState(false);

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
          <div className="space-y-1">
            <input
              type="text"
              placeholder="IDENTITY"
              className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center font-bold focus:border-white outline-none transition-all placeholder:text-zinc-600"
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <input
              type="text"
              placeholder="NAME"
              className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center font-bold focus:border-white outline-none transition-all placeholder:text-zinc-600"
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <input
              type="password"
              placeholder="ACCESS CODE"
              className="w-full h-14 bg-transparent border-b border-zinc-700 text-white text-center tracking-[0.5em] focus:border-white outline-none transition-all placeholder:tracking-normal placeholder:text-zinc-600"
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-20 mt-8 bg-white text-black rounded-[2rem] font-black text-xl active:scale-95 transition-all"
          >
            {loading ? 'BORN...' : 'CREATE NEW TEACHER'}
          </button>
        </form>
      </div>
    </div>
  );
}