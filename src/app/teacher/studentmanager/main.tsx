'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Search, ExternalLink, Trash2, GraduationCap, 
  Loader2, Copy, Check, Lock, Unlock 
} from 'lucide-react';

interface Student {
  id: string;
  name: string;
  grade: string;
  drive_folder_id?: string;
  is_unlocked: boolean; // 🔥 Supabase 락 상태
}

export default function StudentManagerMain() {
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 🔥 [학년 필터 상태]
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('전체');
  const gradeButtons = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'];

  // 복사 피드백을 위한 상태
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 🔗 [마법의 주소 복사 함수]
  const handleCopyLink = (studentId: string) => {
    const origin = window.location.origin;
    const studentUrl = `${origin}/student/${studentId}`;
    
    navigator.clipboard.writeText(studentUrl).then(() => {
      setCopiedId(studentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // 1️⃣ 학생 목록 불러오기
  const fetchStudents = async () => {
    try {
      setFetching(true);
      const res = await fetch('/api/drive/students');
      const data = await res.json();
      
      if (data.students) {
        setStudents(data.students);
      }
    } catch (err) {
      console.error('목록 로드 실패:', err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 🔐 [핵심] 학생 해설지 잠금 토글 함수 (API 연동)
  const toggleStudentLock = async (student: Student) => {
    const nextStatus = !student.is_unlocked;
    
    setStudents(prev => prev.map(s => 
      s.id === student.id ? { ...s, is_unlocked: nextStatus } : s
    ));

    try {
      const res = await fetch('/api/drive/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: student.id, 
          isUnlocked: nextStatus 
        }),
      });

      if (!res.ok) throw new Error();
    } catch (err) {
      alert('잠금 상태 변경에 실패했습니다. 다시 시도해주세요.');
      fetchStudents();
    }
  };

  // 2️⃣ 학생 등록
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !grade) return;

    setLoading(true);
    try {
      const res = await fetch('/api/drive/students/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, grade }),
      });

      if (res.ok) {
        setName('');
        setGrade('');
        await fetchStudents();
        alert(`✅ ${name} 학생 등록 및 드라이브 생성이 완료되었습니다!`);
      } else {
        const errorData = await res.json();
        alert(`등록 실패: ${errorData.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('학생 등록 중 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  // 3️⃣ 학생 삭제
  const handleDeleteStudent = async (student: Student) => {
    const confirmDelete = window.confirm(
      `⚠️ [주의] ${student.name} 학생을 삭제하시겠습니까?\n\n이 작업은 구글 드라이브의 복습 폴더도 휴지통으로 이동됩니다.`
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch('/api/drive/students/delete', {
        method: 'DELETE', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: student.id,           
          folderId: student.drive_folder_id 
        }),
      });

      if (res.ok) {
        alert(`✅ ${student.name} 학생 정보가 삭제되었습니다.`);
        fetchStudents();
      }
    } catch (err) {
      console.error('삭제 중 통신 오류:', err);
    }
  };

  // 🔥 [핵심 추가] 필터링 적용 및 가나다순(이름순) 정렬
  const filteredAndSortedStudents = useMemo(() => {
    return students
      .filter(s => {
        // 검색어 필터 (이름 또는 학년)
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             s.grade.toLowerCase().includes(searchTerm.toLowerCase());
        // 학년 버튼 필터
        const matchesGrade = selectedGradeFilter === '전체' || s.grade.includes(selectedGradeFilter);
        
        return matchesSearch && matchesGrade;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')); // 🇰🇷 가나다순 정렬
  }, [students, searchTerm, selectedGradeFilter]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 헤더 섹션 */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2 italic uppercase leading-none">EduOS Student Center</h1>
          <p className="text-slate-500 font-medium font-sans uppercase text-[10px] tracking-widest opacity-60">Database Management & Access Control</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold shadow-sm">
          <Users size={16} />
          총 {students.length}명
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 왼쪽: 학생 등록 폼 */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm sticky top-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                <UserPlus size={18} />
              </div>
              <h2 className="font-bold text-slate-800 text-lg italic uppercase tracking-tighter">New Student</h2>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 leading-none">Name</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-bold"
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 leading-none">Grade</label>
                <input 
                  required
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-bold"
                  placeholder="예: 중1, 고2-A"
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 uppercase tracking-tighter"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Student'}
              </button>
            </form>
          </div>
        </div>

        {/* 오른쪽: 학생 목록 */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 🔍 검색창 + 🔥 학년 필터 버튼 그룹 */}
          <div className="space-y-5">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-[24px] py-4 pl-12 pr-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold shadow-sm"
                placeholder="이름 또는 학년 검색..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {gradeButtons.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGradeFilter(g)}
                  className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${
                    selectedGradeFilter === g 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' 
                    : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {fetching ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p className="font-black italic uppercase tracking-widest text-xs">Syncing with Supabase...</p>
            </div>
          ) : filteredAndSortedStudents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAndSortedStudents.map((student) => (
                <div key={student.id} className="group bg-white border border-slate-100 rounded-[32px] p-6 hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 relative">
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6 transition-all duration-300 shadow-sm relative overflow-hidden">
                      < GraduationCap size={28} />
                      {!student.is_unlocked && (
                        <div className="absolute inset-0 bg-rose-500/80 flex items-center justify-center text-white">
                          <Lock size={18} />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => toggleStudentLock(student)}
                        className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 font-black text-[10px] uppercase tracking-tighter border shadow-sm ${
                          student.is_unlocked 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
                          : 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100'
                        }`}
                      >
                        {student.is_unlocked ? <Unlock size={14} /> : <Lock size={14} />}
                        {student.is_unlocked ? 'OPEN' : 'LOCKED'}
                      </button>

                      <button 
                        onClick={() => handleCopyLink(student.id)}
                        className={`p-2.5 rounded-xl transition-all border shadow-sm ${
                          copiedId === student.id 
                          ? 'bg-emerald-500 text-white border-emerald-400' 
                          : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        {copiedId === student.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      <button 
                        onClick={() => handleDeleteStudent(student)}
                        className="p-2 text-slate-200 hover:text-rose-500 transition-all transform hover:scale-110"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="mb-5">
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1 leading-none">{student.grade}</div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tighter leading-tight">{student.name}</h3>
                  </div>
                  
                  <button 
                    onClick={() => window.open(`/student/${student.id}`, '_blank')}
                    className="w-full bg-slate-50 group-hover:bg-indigo-600 text-slate-500 group-hover:text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    VIEW REPLAY <ExternalLink size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[40px] py-32 flex flex-col items-center justify-center text-slate-300">
              <Users size={60} className="mb-4 opacity-10" />
              <p className="font-black italic uppercase tracking-widest text-sm">No Student Found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}