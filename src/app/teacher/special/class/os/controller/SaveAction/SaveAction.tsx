'use client';

import React, { useState } from 'react';
import { useStudents } from '../StudentContext'; // 경로에 맞게 수정
import { Save, Loader2 } from 'lucide-react';

export default function SaveAction({ canvasData }: { canvasData: string }) {
  const { selectedStudent } = useStudents();
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!selectedStudent) return alert('학생을 먼저 선택해주세요! 👩‍🎓');
    if (!canvasData) return alert('저장할 판서 내용이 없습니다! 🎨');

    setLoading(true);
    try {
      const res = await fetch('/api/drive/save-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          imageData: canvasData,
          fileName: `${selectedStudent.name}_${new Date().toLocaleDateString()}.png`
        }),
      });

      const result = await res.json();
      if (res.ok) {
        alert('✅ 판서가 학생 드라이브에 저장되었습니다!');
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      alert(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSave}
      disabled={loading || !selectedStudent}
      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-200 disabled:bg-slate-300"
    >
      {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
      SAVE TO DRIVE
    </button>
  );
}