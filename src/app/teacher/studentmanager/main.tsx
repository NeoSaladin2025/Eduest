'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Search, ExternalLink, Trash2, GraduationCap, 
  Loader2 as LoaderIcon, Copy, Check, Lock, Unlock, Settings2, X, CheckSquare, Square, KeyRound
} from 'lucide-react';

interface Student {
  id: string;
  name: string;
  grade: string;
  drive_folder_id?: string;
  is_unlocked: boolean;
  unlocked_folders?: string[];
  password?: string;
}

export default function StudentManagerMain() {
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('전체');
  const gradeButtons = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'];

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // 비번 모달 상태
  const [pwdStudent, setPwdStudent] = useState<Student | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleCopyLink = (studentId: string) => {
    const origin = window.location.origin;
    const studentUrl = `${origin}/student/${studentId}`;
    
    navigator.clipboard.writeText(studentUrl).then(() => {
      setCopiedId(studentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

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

  // 비번 없는 학생에게 고유 4자리 자동 배정 (fetchStudents와 분리)
  useEffect(() => {
    if (fetching || students.length === 0) return;
    const noPasswd = students.filter(s => !s.password);
    if (noPasswd.length === 0) return;

    const usedSet = new Set(students.filter(s => s.password).map(s => s.password!));
    const genPwd = (): string => {
      let p: string;
      do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (usedSet.has(p));
      usedSet.add(p);
      return p;
    };

    Promise.all(noPasswd.map(async (s) => {
      const pwd = genPwd();
      await fetch('/api/drive/students/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: s.id, password: pwd }),
      });
      return { id: s.id, password: pwd };
    })).then(results => {
      setStudents(prev => prev.map(s => {
        const found = results.find(r => r.id === s.id);
        return found ? { ...s, password: found.password } : s;
      }));
    }).catch(err => console.error('비번 자동배정 실패:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetching]);

  // 비번 변경 저장
  const handleSavePwd = async () => {
    if (!pwdStudent) return;
    const trimmed = newPwd.trim();
    if (!/^\d{4}$/.test(trimmed)) return alert('4자리 숫자만 입력해줘!');
    if (students.some(s => s.id !== pwdStudent.id && s.password === trimmed))
      return alert('이미 다른 학생이 쓰고 있는 번호야. 다른 번호로 바꿔줘!');

    setPwdSaving(true);
    try {
      const res = await fetch('/api/drive/students/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: pwdStudent.id, password: trimmed }),
      });
      if (res.ok) {
        setStudents(prev => prev.map(s => s.id === pwdStudent.id ? { ...s, password: trimmed } : s));
        setPwdStudent(null);
        setNewPwd('');
      } else {
        alert('저장 실패. 다시 시도해줘!');
      }
    } finally {
      setPwdSaving(false);
    }
  };

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

  const saveFolderPermissions = async (folderIds: string[]) => {
    if (!selectedStudent) return;
    setModalLoading(true);

    try {
      const res = await fetch('/api/drive/library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: selectedStudent.id, 
          unlockedFolders: folderIds 
        }),
      });

      if (res.ok) {
        setStudents(prev => prev.map(s => 
          s.id === selectedStudent.id ? { ...s, unlocked_folders: folderIds } : s
        ));
        setIsModalOpen(false);
      }
    } catch (err) {
      alert('권한 저장에 실패했습니다.');
    } finally {
      setModalLoading(false);
    }
  };

  const openLockModal = async (student: Student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/drive/library?grade=${student.grade}`);
      const data = await res.json();
      
      const filtered = (data.items || [])
        .filter((item: any) => 
          item.type === 'folder' && 
          item.name.trim() !== student.grade.trim()
        )
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko'));
        
      setLibraryItems(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

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

  const filteredAndSortedStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             s.grade.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesGrade = selectedGradeFilter === '전체' || s.grade.includes(selectedGradeFilter);
        return matchesSearch && matchesGrade;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [students, searchTerm, selectedGradeFilter]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 🔐 [완전 강제 교정본] 회차 관리 설정창 */}
      {isModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          {/* 🔥 1. 모달 전체 높이 제한 강제 (maxHeight: 80vh) */}
          <div 
            className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col animate-in zoom-in duration-200"
            style={{ maxHeight: '80vh' }} 
          >
            
            {/* 상단 헤더 (높이 고정) */}
            <div className="shrink-0 p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-[32px]">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter italic uppercase leading-none">
                  {selectedStudent.name} <span className="text-indigo-600 font-bold ml-1 text-xl">회차 관리</span>
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Exam Sessions Selection</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            {/* 🔥 2. 스크롤 강제 활성화 영역 (overflowY: auto) */}
            <div 
              className="flex-1 p-6 bg-white"
              style={{ overflowY: 'auto' }}
            >
              {modalLoading ? (
                <div className="h-full flex items-center justify-center py-20"><Loader2 size={40} className="animate-spin text-indigo-500" /></div>
              ) : libraryItems.length > 0 ? (
                
                /* 🔥 3. 2열 그리드 강제 (인라인 스타일) */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  {libraryItems.map(item => {
                    const isChecked = selectedStudent.unlocked_folders?.includes(item.drive_id);
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          const current = selectedStudent.unlocked_folders || [];
                          const next = isChecked ? current.filter(id => id !== item.drive_id) : [...current, item.drive_id];
                          setSelectedStudent({ ...selectedStudent, unlocked_folders: next });
                        }}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer select-none ${isChecked ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50 hover:border-slate-300'}`}
                        style={{ overflow: 'hidden' }}
                      >
                        {isChecked ? <CheckSquare size={22} className="text-indigo-600 shrink-0" /> : <Square size={22} className="text-slate-300 shrink-0" />}
                        <span 
                          className={`font-black text-sm sm:text-base ${isChecked ? 'text-indigo-700' : 'text-slate-600'}`}
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {item.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                
              ) : (
                <div className="h-full flex items-center justify-center py-20">
                  <p className="text-center text-slate-400 font-bold italic text-lg">데이터가 없습니다.</p>
                </div>
              )}
            </div>

            {/* 하단 버튼 (높이 고정) */}
            <div className="shrink-0 p-6 bg-slate-50 border-t border-slate-100 flex gap-3 rounded-b-[32px]">
              <button 
                onClick={() => {
                  const allIds = libraryItems.map(i => i.drive_id);
                  const isAll = libraryItems.length > 0 && allIds.every(i => selectedStudent.unlocked_folders?.includes(i));
                  setSelectedStudent({ ...selectedStudent, unlocked_folders: isAll ? [] : allIds });
                }}
                className="w-28 sm:w-32 py-4 bg-white border-2 border-slate-200 text-slate-500 font-black rounded-xl text-xs uppercase hover:bg-slate-100 transition-all shadow-sm"
              >
                전체 선택
              </button>
              <button 
                onClick={() => saveFolderPermissions(selectedStudent.unlocked_folders || [])}
                disabled={modalLoading}
                className="flex-1 bg-slate-900 text-white font-black py-4 rounded-xl shadow-xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 text-sm sm:text-base uppercase tracking-wider"
              >
                {modalLoading ? <Loader2 size={18} className="animate-spin" /> : 'Save Permissions'}
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 비번 변경 모달 */}
      {pwdStudent && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => { setPwdStudent(null); setNewPwd(''); }} />
          <div className="relative bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">비번 변경</h3>
                <p className="text-xs text-slate-400 font-bold mt-0.5">{pwdStudent.name} · {pwdStudent.grade}</p>
              </div>
              <button onClick={() => { setPwdStudent(null); setNewPwd(''); }} className="text-slate-300 hover:text-slate-600 transition-colors">
                <X size={22} />
              </button>
            </div>
            <div className="mb-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">새 비번 (4자리 숫자)</label>
              <input
                type="text"
                maxLength={4}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-center text-3xl font-black text-slate-800 tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSavePwd()}
              />
            </div>
            <p className="text-[10px] text-slate-400 mb-6 text-center">현재: <span className="font-black text-amber-600">{pwdStudent.password ?? '없음'}</span></p>
            <div className="flex gap-3">
              <button onClick={() => { setPwdStudent(null); setNewPwd(''); }} className="flex-1 py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all">취소</button>
              <button
                onClick={handleSavePwd}
                disabled={pwdSaving || newPwd.length !== 4}
                className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
              >
                {pwdSaving ? <Loader2 size={18} className="animate-spin" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-bold text-xs"
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 leading-none">Grade</label>
                <input 
                  required
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-bold text-xs"
                  placeholder="예: 중1, 고2-A"
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 uppercase tracking-tighter text-[10px]"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : 'Create Student'}
              </button>
            </form>
          </div>
        </div>

        {/* 오른쪽: 학생 목록 */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="space-y-5">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-[24px] py-4 pl-12 pr-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold shadow-sm text-sm"
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
              <Loader2 size={40} className="animate-spin mb-4" />
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
                        <div className="absolute inset-0 bg-rose-500/80 flex items-center justify-center text-white group-hover:rotate-0 transition-transform">
                          <Lock size={18} />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => openLockModal(student)}
                        className="p-2.5 rounded-xl bg-white text-slate-400 border border-slate-100 hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all"
                        title="회차별 권한 설정"
                      >
                        <Settings2 size={18} />
                      </button>

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
                  <div className="mb-4">
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1 leading-none">{student.grade}</div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tighter leading-tight mb-3">{student.name}</h3>
                    {/* 비번 배지 */}
                    <button
                      onClick={() => { setPwdStudent(student); setNewPwd(student.password || ''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-amber-700 font-black text-xs transition-all"
                      title="비번 변경"
                    >
                      <KeyRound size={13} />
                      {student.password ?? '배정 중...'}
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => window.open(`/student/${student.id}`, '_blank')}
                    className="w-full bg-slate-50 group-hover:bg-indigo-600 text-slate-500 group-hover:text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm text-xs"
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

// Props 타입을 정의하고 LoaderIcon을 사용하도록 수정
function Loader2({ size, className }: { size: number, className?: string }) {
  return <LoaderIcon size={size} className={className} />;
}
