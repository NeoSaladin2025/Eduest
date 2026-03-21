'use client';

import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, ExternalLink, Trash2, GraduationCap, Loader2, Copy, Check } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  grade: string;
  drive_folder_id?: string;
}

export default function StudentManagerMain() {
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // 🔥 복사 피드백을 위한 상태 (어떤 학생이 복사되었는지 ID 저장)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 🔗 [마법의 주소 복사 함수]
  // 로컬 환경이면 localhost를, 배포 환경이면 실제 도메인을 자동으로 감지합니다.
  const handleCopyLink = (studentId: string) => {
    const origin = window.location.origin; // 로컬/온라인 자동 감지
    const studentUrl = `${origin}/student/${studentId}`;
    
    navigator.clipboard.writeText(studentUrl).then(() => {
      setCopiedId(studentId);
      setTimeout(() => setCopiedId(null), 2000); // 2초 후 아이콘 복구
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
      alert('학생 등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 3️⃣ 🔥 학생 삭제
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
        const result = await res.json();
        if (result.success) {
          alert(`✅ ${student.name} 학생 정보가 삭제되었습니다.`);
          fetchStudents();
        } else {
          alert(`삭제 실패: ${result.error || '알 수 없는 오류'}`);
        }
      } else {
        alert(`서버 에러 (${res.status}): 삭제 요청 실패`);
      }
    } catch (err) {
      console.error('삭제 중 통신 오류:', err);
      alert('네트워크 오류가 발생했습니다.');
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.grade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 헤더 섹션 */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">학생 관리</h1>
          <p className="text-slate-500 font-medium font-sans">Eduest 전용 학생 데이터베이스 및 학습 폴더 관리</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold">
          <Users size={16} />
          총 {students.length}명
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 왼쪽: 학생 등록 폼 */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm sticky top-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                <UserPlus size={18} />
              </div>
              <h2 className="font-bold text-slate-800 text-lg italic uppercase tracking-tighter">New Student</h2>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Name</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-bold"
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Grade</label>
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
        <div className="lg:col-span-2 space-y-4">
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
              placeholder="학생 이름 또는 학년 검색..."
            />
          </div>

          {fetching ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p className="font-black italic uppercase tracking-widest text-xs">Syncing with Supabase...</p>
            </div>
          ) : filteredStudents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStudents.map((student) => (
                <div key={student.id} className="group bg-white border border-slate-100 rounded-3xl p-6 hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6 transition-all duration-300 shadow-sm">
                      <GraduationCap size={28} />
                    </div>
                    
                    <div className="flex gap-2 items-center">
                      {/* 🔗 🔥 [추가] 링크 복사 버튼 */}
                      <button 
                        onClick={() => handleCopyLink(student.id)}
                        className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 font-black text-[10px] uppercase tracking-tighter border ${
                          copiedId === student.id 
                          ? 'bg-emerald-500 text-white border-emerald-400' 
                          : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                        title="복습 링크 복사"
                      >
                        {copiedId === student.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === student.id ? 'COPIED!' : 'GET LINK'}
                      </button>

                      <button 
                        onClick={() => handleDeleteStudent(student)}
                        className="p-2 text-slate-200 hover:text-rose-500 transition-all transform hover:scale-125"
                        title="학생 삭제"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{student.grade}</div>
                    <h3 className="text-xl font-black text-slate-800 mb-5 tracking-tighter">{student.name}</h3>
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