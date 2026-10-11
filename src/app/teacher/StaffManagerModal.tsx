'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Users, 
  ShieldCheck, 
  Key, 
  Trash2, 
  Edit3, 
  Check, 
  Copy, 
  Eye, 
  EyeOff, 
  Search, 
  Lock,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export interface TeacherAccount {
  id: string;
  name: string;
  login_id: string;
  password?: string;
  role: 'SUPER_ADMIN' | 'TEACHER';
  created_at?: string;
  is_protected?: boolean;
}

interface StaffManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdminName: string;
}

export default function StaffManagerModal({
  isOpen,
  onClose,
  currentAdminName,
}: StaffManagerModalProps) {
  const [teachers, setTeachers] = useState<TeacherAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 비밀번호 표시 토글 맵
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  
  // 등록/수정 모달 상태
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherAccount | null>(null);
  const [formName, setFormName] = useState('');
  const [formLoginId, setFormLoginId] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'TEACHER' | 'SUPER_ADMIN'>('TEACHER');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // 알림 토스트
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);

  const showToast = (text: string, type: 'success' | 'warn' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 1. 목록 로드
  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/teachers');
      const data = await res.json();
      if (data.teachers && Array.isArray(data.teachers)) {
        setTeachers(data.teachers);
      }
    } catch (e) {
      console.error('Failed to load teachers:', e);
      showToast('선생님 목록을 불러오지 못했습니다.', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTeachers();
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 등록/수정 모달 열기
  const handleOpenCreate = () => {
    setEditingTeacher(null);
    setFormName('');
    setFormLoginId('');
    setFormPassword('');
    setFormRole('TEACHER');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (teacher: TeacherAccount) => {
    setEditingTeacher(teacher);
    setFormName(teacher.name);
    setFormLoginId(teacher.login_id);
    setFormPassword(teacher.password || '');
    setFormRole(teacher.role);
    setIsFormOpen(true);
  };

  // 등록 및 수정 저장
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('선생님 성함을 입력해 주세요.', 'warn');
      return;
    }
    if (!formLoginId.trim()) {
      showToast('계정 ID를 입력해 주세요.', 'warn');
      return;
    }
    if (!formPassword.trim()) {
      showToast('비밀번호를 입력해 주세요.', 'warn');
      return;
    }

    try {
      setFormSubmitting(true);
      if (editingTeacher) {
        // 수정
        const res = await fetch('/api/teachers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingTeacher.id,
            name: formName.trim(),
            login_id: formLoginId.trim(),
            password: formPassword.trim(),
            role: formRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || '수정에 실패했습니다.', 'warn');
          return;
        }
        showToast(`✨ '${formName.trim()}' 선생님 정보가 수정되었습니다!`, 'success');
      } else {
        // 신규 등록
        const res = await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            login_id: formLoginId.trim(),
            password: formPassword.trim(),
            role: formRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || '등록에 실패했습니다.', 'warn');
          return;
        }
        showToast(`🎉 '${formName.trim()}' 선생님 계정이 새로 생성되었습니다!`, 'success');
      }

      setIsFormOpen(false);
      fetchTeachers();
    } catch (e) {
      console.error('Error saving teacher:', e);
      showToast('처리 중 오류가 발생했습니다.', 'warn');
    } finally {
      setFormSubmitting(false);
    }
  };

  // 삭제 처리
  const handleDeleteTeacher = async (teacher: TeacherAccount) => {
    if (teacher.is_protected || teacher.name === '곽명용') {
      alert('최고 관리자(곽명용 원장님) 계정은 삭제할 수 없습니다!');
      return;
    }

    const confirmMsg = `'${teacher.name}' (${teacher.login_id}) 선생님 계정을 정말 삭제하시겠습니까?\n\n삭제 시 해당 계정으로 더 이상 로그인할 수 없습니다.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/teachers?id=${teacher.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || '삭제 실패', 'warn');
        return;
      }
      showToast(`🗑️ '${teacher.name}' 선생님 계정이 삭제되었습니다.`, 'success');
      fetchTeachers();
    } catch (e) {
      console.error('Error deleting teacher:', e);
      showToast('삭제 중 오류가 발생했습니다.', 'warn');
    }
  };

  // 복사 기능
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`📋 ${label}이(가) 클립보드에 복사되었습니다!`, 'success');
  };

  // 필터링된 선생님 목록
  const filteredTeachers = teachers.filter(t => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.login_id.toLowerCase().includes(q) ||
      (t.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      
      {/* 토스트 메시지 */}
      {toastMessage && (
        <div className="fixed top-8 right-8 z-[200] animate-in slide-in-from-top-3 fade-in duration-150">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2 text-sm font-bold ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}>
            <Sparkles size={16} />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 메인 모달 창 */}
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* 상단 헤더 */}
        <div className="px-7 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-300 shadow-inner">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">교직원(선생님) 계정 관리</h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-[11px] font-bold text-indigo-200">
                  총 {teachers.length}명
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                선생님 계정을 등록, 수정, 삭제하고 로그인 권한을 관리합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-900/50 cursor-pointer active:scale-95"
            >
              <Plus size={15} />
              <span>새 선생님 등록</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              title="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 툴바: 검색 및 가이드 */}
        <div className="px-7 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="선생님 성함 또는 계정 ID 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-9 pr-3 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition-all shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1 text-indigo-600 font-bold">
              💡 한글 계정 ID & 자유 비밀번호 지원
            </span>
            <span className="text-slate-300">|</span>
            <span>로그인 창에서 성함 또는 계정 ID로 모두 접속 가능</span>
          </div>
        </div>

        {/* 선생님 목록 테이블 */}
        <div className="flex-1 overflow-y-auto p-7">
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-sm font-bold flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <span>계정 목록을 불러오는 중...</span>
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm font-bold flex flex-col items-center gap-2">
              <AlertCircle size={32} className="text-slate-300" />
              <span>검색 결과 또는 등록된 선생님 계정이 없습니다.</span>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">선생님 성함</th>
                    <th className="py-3 px-4">계정 ID (한글/영문)</th>
                    <th className="py-3 px-4">비밀번호</th>
                    <th className="py-3 px-4">권한 등급</th>
                    <th className="py-3 px-4 text-center">관리 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700 bg-white">
                  {filteredTeachers.map(teacher => {
                    const isProtected = teacher.is_protected || teacher.name === '곽명용';
                    const isSuper = teacher.role === 'SUPER_ADMIN' || isProtected;
                    const showPwd = !!showPasswordMap[teacher.id];

                    return (
                      <tr 
                        key={teacher.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isProtected ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* 성함 */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs ${
                              isSuper 
                                ? 'bg-gradient-to-tr from-amber-500 to-indigo-600' 
                                : 'bg-slate-700'
                            }`}>
                              {teacher.name.slice(0, 1)}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                <span>{teacher.name}</span>
                                {isProtected && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black">
                                    원장님 👑
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {teacher.created_at ? new Date(teacher.created_at).toLocaleDateString() : '기본 등록'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 계정 ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-slate-100 px-2 py-1 rounded-lg text-indigo-950 border border-slate-200">
                              {teacher.login_id}
                            </span>
                            <button
                              onClick={() => handleCopyText(teacher.login_id, '계정 ID')}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              title="아이디 복사"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </td>

                        {/* 비밀번호 */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="bg-slate-100 px-2 py-1 rounded-lg text-slate-800 border border-slate-200 min-w-[70px] text-center font-bold">
                              {showPwd ? (teacher.password || '••••') : '••••••'}
                            </span>
                            <button
                              onClick={() => setShowPasswordMap(prev => ({ ...prev, [teacher.id]: !prev[teacher.id] }))}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                              title={showPwd ? '비밀번호 가리기' : '비밀번호 확인'}
                            >
                              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            {teacher.password && (
                              <button
                                onClick={() => handleCopyText(teacher.password || '', '비밀번호')}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                title="비밀번호 복사"
                              >
                                <Copy size={13} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 권한 등급 */}
                        <td className="py-3.5 px-4">
                          {isSuper ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                              <ShieldCheck size={13} className="text-amber-600" />
                              최고 관리자
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">
                              <Users size={13} className="text-indigo-500" />
                              일반 선생님
                            </span>
                          )}
                        </td>

                        {/* 관리 액션 */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* 수정 버튼 */}
                            <button
                              onClick={() => handleOpenEdit(teacher)}
                              className="p-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-lg transition-all border border-slate-200 cursor-pointer"
                              title="정보 및 비밀번호 수정"
                            >
                              <Edit3 size={14} />
                            </button>

                            {/* 삭제 버튼 (수퍼 관리자는 안전 잠금) */}
                            {isProtected ? (
                              <button
                                disabled
                                className="p-1.5 bg-slate-50 text-slate-300 rounded-lg border border-slate-100 cursor-not-allowed opacity-60"
                                title="최고 관리자 계정은 삭제할 수 없습니다 (시스템 보호)"
                              >
                                <Lock size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeleteTeacher(teacher)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg transition-all border border-slate-200 cursor-pointer"
                                title="계정 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-7 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            현재 접속자: <span className="font-extrabold text-slate-800">{currentAdminName} 선생님</span> (SUPER ADMINISTRATOR)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 🌟 선생님 등록 / 수정 서브 모달 */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                <h3 className="font-black text-sm">
                  {editingTeacher ? `'${editingTeacher.name}' 선생님 정보 수정` : '새 선생님 계정 등록'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              {/* 성함 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  선생님 성함 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 임효재, 김철수"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
                  required
                />
              </div>

              {/* 계정 ID */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-slate-700">
                    로그인 계정 ID <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-bold">한글 / 영문 / 숫자 모두 가능</span>
                </div>
                <input
                  type="text"
                  placeholder="예: 수학쌤, teacher_kim, 임선생"
                  value={formLoginId}
                  onChange={e => setFormLoginId(e.target.value)}
                  disabled={editingTeacher?.is_protected}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all disabled:opacity-50"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 로그인할 때 성함 대신 이 ID를 입력해도 바로 접속할 수 있어요.
                </p>
              </div>

              {/* 비밀번호 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-slate-700">
                    비밀번호 <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-emerald-600 font-bold">자릿수 제한 없음</span>
                </div>
                <input
                  type="text"
                  placeholder="예: 1, 1234, 0000 등 자유롭게"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 복잡한 특수문자 규칙 없이 편한 길이로 설정하세요.
                </p>
              </div>

              {/* 권한 등급 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  권한 등급
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRole('TEACHER')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      formRole === 'TEACHER'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-black shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Users size={14} />
                    <span>일반 선생님</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormRole('SUPER_ADMIN')}
                    disabled={editingTeacher?.is_protected}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 ${
                      formRole === 'SUPER_ADMIN'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 font-black shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck size={14} />
                    <span>최고 관리자</span>
                  </button>
                </div>
              </div>

              {/* 버튼 액션 */}
              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-indigo-200 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {formSubmitting ? (
                    <span>저장 중...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>{editingTeacher ? '변경사항 저장' : '선생님 등록 완료'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
