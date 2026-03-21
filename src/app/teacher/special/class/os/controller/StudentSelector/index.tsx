'use client';

import React from 'react';
import { useStudents } from '../StudentContext';
import { User, ChevronDown } from 'lucide-react';

export default function StudentSelector() {
  const { students, selectedStudent, isLoading, setSelectedStudent } = useStudents();

  return (
    <div className="flex items-center gap-3">
      <div className="relative group">
        {/* 아이콘 */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-indigo-400 transition-colors z-10 pointer-events-none">
          <User size={16} />
        </div>

        {/* 셀렉트 박스 */}
        <select
          disabled={isLoading}
          value={selectedStudent?.id || ''}
          onChange={(e) => {
            const student = students.find((s) => s.id === e.target.value);
            setSelectedStudent(student || null);
          }}
          className={`
            appearance-none pl-10 pr-10 py-2.5 bg-slate-800/40 border border-white/5 
            rounded-2xl text-[13px] font-bold text-slate-200 outline-none transition-all
            cursor-pointer hover:bg-slate-800/60 hover:border-white/10
            ${isLoading ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 ring-indigo-500/50 focus:border-indigo-500/50'}
          `}
        >
          {isLoading ? (
            <option>명부 동기화 중...</option>
          ) : (
            <>
              <option value="">학생 선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.grade}] {s.name}
                </option>
              ))}
            </>
          )}
        </select>

        {/* 커스텀 화살표 */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
          <ChevronDown size={14} />
        </div>
      </div>

      {/* 로딩 스피너 (로딩 중일 때만 표시) */}
      {isLoading && (
        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      )}

      {/* 활성화 표시 */}
      {!isLoading && selectedStudent && (
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">
            Session Live
          </span>
        </div>
      )}
    </div>
  );
}