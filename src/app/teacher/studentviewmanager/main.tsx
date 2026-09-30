'use client';

import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  BookOpen, 
  Database, 
  Library, 
  CheckCircle2, 
  SlidersHorizontal,
  RefreshCw,
  Eye,
  AlertCircle,
  Save,
  Check,
  FileCheck
} from 'lucide-react';

interface MenuConfig {
  test: boolean;
  test2: boolean;
  homework: boolean;
  review: boolean;
  library: boolean;
}

const DEFAULT_CONFIG: MenuConfig = {
  test: true,
  test2: true,
  homework: true,
  review: true,
  library: true,
};

export default function StudentViewManagerMain() {
  const [config, setConfig] = useState<MenuConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewActiveTab, setPreviewActiveTab] = useState<string>('review');

  // 설정 불러오기
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/student/menu-config');
        const data = await res.json();
        if (data?.config) {
          setConfig(data.config);
          // 프리뷰 기본 활성 탭 설정
          const activeKeys = Object.keys(data.config).filter(k => (data.config as any)[k]);
          if (activeKeys.length > 0) {
            setPreviewActiveTab(activeKeys.includes('review') ? 'review' : activeKeys[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load menu config:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // 저장 함수
  const saveConfig = async (newConfig: MenuConfig) => {
    try {
      setSaving(true);
      setSaveSuccess(false);

      const res = await fetch('/api/student/menu-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save menu config:', err);
      alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 체크박스 토글
  const handleToggle = (key: keyof MenuConfig) => {
    // 최소 1개는 켜져 있어야 함
    const activeCount = Object.values(config).filter(Boolean).length;
    if (config[key] && activeCount <= 1) {
      alert('최소 1개 이상의 메뉴는 화면에 표시되어야 합니다.');
      return;
    }

    const nextConfig = { ...config, [key]: !config[key] };
    setConfig(nextConfig);

    // 프리뷰 활성 탭이 꺼지는 항목이면 다른 활성 탭으로 변경
    if (previewActiveTab === key && !nextConfig[key]) {
      const remaining = Object.keys(nextConfig).filter(k => (nextConfig as any)[k]);
      if (remaining.length > 0) {
        setPreviewActiveTab(remaining[0]);
      }
    }

    saveConfig(nextConfig);
  };

  // 전체 켜기
  const handleSelectAll = () => {
    const allOn: MenuConfig = { test: true, test2: true, homework: true, review: true, library: true };
    setConfig(allOn);
    saveConfig(allOn);
  };

  // 기본값 복원
  const handleReset = () => {
    if (confirm('기본 설정(모든 메뉴 표시)으로 복원하시겠습니까?')) {
      setConfig(DEFAULT_CONFIG);
      saveConfig(DEFAULT_CONFIG);
    }
  };

  const menuDefinitions = [
    {
      id: 'test' as keyof MenuConfig,
      name: 'TEST',
      korLabel: '시험 응시',
      desc: '선생님이 배정한 맞춤 시험지 및 카트리지 풀이, 실시간 자동 채점 및 감독',
      icon: <FileCheck size={22} className="text-violet-600" />,
      activeColor: 'bg-violet-500/10 border-violet-500 text-violet-600',
      badgeColor: 'bg-violet-100 text-violet-700 border-violet-200',
      previewIcon: <FileCheck size={18} />,
      previewActiveStyle: 'bg-violet-600 text-white shadow-xl scale-105',
    },
    {
      id: 'homework' as keyof MenuConfig,
      name: '숙제',
      korLabel: '과제 관리',
      desc: '부여된 숙제 확인, 문제 풀이 및 제출 내역 관리',
      icon: <BookOpen size={22} className="text-amber-500" />,
      activeColor: 'bg-amber-500/10 border-amber-500 text-amber-600',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      previewIcon: <BookOpen size={18} />,
      previewActiveStyle: 'bg-amber-600 text-white shadow-xl scale-105',
    },
    {
      id: 'review' as keyof MenuConfig,
      name: 'REVIEW',
      korLabel: '복습 탐색기',
      desc: '윈도우 탐색기 스타일의 개인 오답 및 라이브러리 복습 관리',
      icon: <Database size={22} className="text-indigo-600" />,
      activeColor: 'bg-indigo-500/10 border-indigo-500 text-indigo-600',
      badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      previewIcon: <Database size={18} />,
      previewActiveStyle: 'bg-indigo-600 text-white shadow-xl scale-105',
    },
    {
      id: 'library' as keyof MenuConfig,
      name: 'LIBRARY',
      korLabel: '문제 보관함',
      desc: '전체 학년별 기출 및 시험 라이브러리 폴더 열람',
      icon: <Library size={22} className="text-indigo-500" />,
      activeColor: 'bg-indigo-500/10 border-indigo-500 text-indigo-600',
      badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      previewIcon: <Library size={18} />,
      previewActiveStyle: 'bg-indigo-600 text-white shadow-xl scale-105',
    },
  ];

  const activeCount = Object.values(config).filter(Boolean).length;

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-10 animate-in fade-in duration-500">
      
      {/* 1. 상단 타이틀 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black shadow-sm">
              <SlidersHorizontal size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              학생화면 관리
            </h1>
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200/60 rounded-full font-bold">
              상단 메뉴 제어
            </span>
          </div>
          <p className="text-sm font-medium text-slate-500">
            학생이 로그인했을 때 상단에 노출될 메뉴를 체크박스로 선택할 수 있습니다. 체크된 메뉴만 학생 화면에 표시됩니다.
          </p>
        </div>

        {/* 제어 버튼 & 상태 알림 */}
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl animate-in fade-in zoom-in">
              <Check size={16} />
              클라우드 저장 완료!
            </div>
          )}
          {saving && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl">
              <RefreshCw size={14} className="animate-spin" />
              저장 중...
            </div>
          )}
          <button
            onClick={handleSelectAll}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            모두 선택
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all"
          >
            기본값 복원
          </button>
        </div>
      </div>

      {/* 2. 실시간 미리보기 (2번 스크린샷 형태 Live Preview) */}
      <div className="bg-[#020617] rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-white">
            <Eye size={18} className="text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-300">
              실시간 학생화면 미리보기 (Live Preview)
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            현재 노출 메뉴: <span className="text-indigo-400 font-black">{activeCount}개</span> / {menuDefinitions.length}개
          </div>
        </div>

        {/* 상단 알약 네비게이션 프리뷰 */}
        <div className="flex justify-center mb-8">
          <div className="bg-white/5 p-1.5 rounded-[32px] border border-white/10 backdrop-blur-3xl flex shadow-3xl">
            {menuDefinitions.map((item) => {
              if (!config[item.id]) return null;
              const isActive = previewActiveTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setPreviewActiveTab(item.id)}
                  className={`flex items-center gap-3 px-6 md:px-10 py-3.5 md:py-4 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${
                    isActive ? item.previewActiveStyle : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {item.previewIcon}
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 학생 예시 타이틀 (2번 스샷 일치) */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase leading-none text-white">
            홍길동 <span className="text-slate-700 not-italic">/</span> <span className="text-indigo-400">중3</span>
          </h2>
          <p className="text-[11px] font-bold text-slate-500 tracking-wider">
            학생은 위와 같이 체크된 메뉴만 볼 수 있으며, 클릭하여 각 기능을 이용합니다.
          </p>
        </div>
      </div>

      {/* 3. 메뉴별 체크박스 설정 카드 그리드 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
            <span>메뉴 노출 체크박스 설정</span>
            <span className="text-xs font-normal text-slate-400">
              (체크 시 학생 화면 상단에 노출됩니다)
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {menuDefinitions.map((item) => {
            const isChecked = config[item.id];

            return (
              <div
                key={item.id}
                onClick={() => handleToggle(item.id)}
                className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-5 select-none relative group ${
                  isChecked
                    ? 'bg-white border-indigo-600 shadow-lg shadow-indigo-100/50 scale-[1.01]'
                    : 'bg-slate-50/80 border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                }`}
              >
                {/* 체크박스 커스텀 UI */}
                <div className="pt-0.5">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                      isChecked
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-300'
                        : 'border-2 border-slate-300 bg-white group-hover:border-slate-400'
                    }`}
                  >
                    {isChecked && <Check size={16} strokeWidth={3} />}
                  </div>
                </div>

                {/* 메뉴 상세 내용 */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-lg text-slate-800">
                      {item.name}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      ({item.korLabel})
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        isChecked
                          ? item.badgeColor
                          : 'bg-slate-200 text-slate-500 border-slate-300'
                      }`}
                    >
                      {isChecked ? '화면 노출 ON' : '숨김 OFF'}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-500 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 주의사항 및 안내 */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 space-y-1">
          <p className="font-bold">설정 변경 안내</p>
          <p className="text-amber-700 leading-relaxed">
            체크박스를 클릭하면 즉시 클라우드에 자동 저장되며, 학생이 페이지를 열거나 새로고침할 때 체크된 메뉴만 보이게 됩니다.
            비활성화된 메뉴는 학생이 직접 주소창을 통해 접근하는 것도 안전하게 방지됩니다.
          </p>
        </div>
      </div>

    </div>
  );
}
