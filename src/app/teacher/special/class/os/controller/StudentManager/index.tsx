'use client';

import React, { useState, useMemo } from 'react';
import { useStudents } from '../StudentContext';
import { X, UserPlus, Trash2, RefreshCw, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function StudentManager({ isOpen, onClose }: Props) {
  const { students, refreshStudents, isLoading, selectedStudent, setSelectedStudent } = useStudents();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('고3');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null); // 🚀 삭제 중인 학생 ID 추적
  const [filterGrade, setFilterGrade] = useState('전체');

  // 정렬 로직 (학년 -> 이름)
  const sortedStudents = useMemo(() => {
    const list = [...students].sort((a, b) => {
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      return a.name.localeCompare(b.name);
    });
    if (filterGrade === '전체') return list;
    return list.filter(s => s.grade === filterGrade);
  }, [students, filterGrade]);

  if (!isOpen) return null;

  // 학생 추가
  const handleAddStudent = async () => {
    if (!name.trim()) return alert("이름을 입력해줘!");
    setIsCreating(true);
    try {
      const response = await fetch('/api/drive/students/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, grade }),
      });
      if (response.ok) {
        setName('');
        await refreshStudents();
      }
    } catch (error) {
      alert("생성 중 오류가 발생했어.");
    } finally {
      setIsCreating(false);
    }
  };

  // 🚀 학생 및 폴더 완전 삭제
  const handleDelete = async (id: string, studentName: string) => {
    // 경고 문구 수정: 폴더까지 삭제됨을 강조!
    if (!confirm(`⚠️ 경고: [${studentName}] 학생의 명단과 드라이브 폴더가 영구적으로 삭제돼. 정말 진행할까?`)) return;

    setDeletingId(id); // 🚀 삭제 애니메이션 시작
    try {
      const response = await fetch(`/api/drive/students/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        if (selectedStudent?.id === id) setSelectedStudent(null);
        await refreshStudents(); // 목록 새로고침
      } else {
        alert("삭제 실패했어. 권한을 확인해봐!");
      }
    } catch (error) {
      alert("삭제 중 네트워크 오류가 발생했어.");
    } finally {
      setDeletingId(null); // 🚀 애니메이션 종료
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-8 pb-4 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-black text-white italic tracking-tight uppercase">Student Manager</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 pt-0 overflow-y-auto custom-scrollbar">
          {/* 입력 영역 */}
          <div className="space-y-4 mb-8">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="학생 이름"
                disabled={isCreating}
                className="flex-1 bg-slate-800 border border-white/5 rounded-2xl px-5 py-3 text-white outline-none focus:ring-2 ring-indigo-500 transition-all disabled:opacity-50"
              />
              <select 
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                disabled={isCreating}
                className="bg-slate-800 border border-white/5 rounded-2xl px-4 text-white outline-none focus:ring-2 ring-indigo-500 disabled:opacity-50"
              >
                {['중1', '중2', '중3', '고1', '고2', '고3', 'N수'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <button 
              onClick={handleAddStudent}
              disabled={isCreating || isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:bg-slate-700"
            >
              {isCreating ? <Loader2 size={20} className="animate-spin" /> : <UserPlus size={20} />}
              {isCreating ? '계정 생성 중...' : '학생 계정 생성'}
            </button>
          </div>

          <div className="w-full h-[1px] bg-white/5 mb-6" />

          {/* 목록 컨트롤 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Student List</p>
              <select 
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-indigo-400 border border-indigo-500/30 rounded-lg px-2 py-0.5 outline-none"
              >
                {['전체', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <button 
              onClick={() => refreshStudents()}
              disabled={isLoading}
              className="text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* 학생 리스트 영역 */}
          <div className="space-y-2">
            {sortedStudents.length === 0 ? (
              <div className="py-10 text-center text-slate-600 text-xs italic">
                등록된 학생이 없거나 필터 조건에 맞지 않아.
              </div>
            ) : (
              sortedStudents.map(student => (
                <div key={student.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl group border border-transparent hover:border-white/5 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold bg-slate-800 text-slate-400 w-8 h-5 flex items-center justify-center rounded uppercase tracking-tighter">
                      {student.grade}
                    </span>
                    <span className="font-bold text-slate-200">{student.name}</span>
                  </div>
                  
                  {/* 🚀 삭제 버튼 상태 제어 */}
                  <button 
                    onClick={() => handleDelete(student.id, student.name)}
                    disabled={deletingId === student.id}
                    className="text-slate-600 hover:text-rose-500 p-2 transition-all"
                  >
                    {deletingId === student.id ? (
                      <Loader2 size={16} className="animate-spin text-indigo-500" />
                    ) : (
                      <Trash2 size={16} className="opacity-0 group-hover:opacity-100 transition-all" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}