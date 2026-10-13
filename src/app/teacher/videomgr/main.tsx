'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlaySquare, Plus, Search, ExternalLink, Trash2, Edit3, Eye, EyeOff,
  Video, Youtube, HardDrive, Check, X, Settings2, FileText, Download,
  RefreshCw, Sparkles, Filter, ChevronRight, AlertCircle, Play
} from 'lucide-react';
import { 
  VideoLectureItem, 
  VideoTagItem, 
  DEFAULT_TAGS, 
  ALL_GRADES, 
  parseVideoUrl, 
  TAG_COLOR_MAP 
} from '@/lib/videoTypes';

export default function VideoManagerMain() {
  const [videos, setVideos] = useState<VideoLectureItem[]>([]);
  const [tags, setTags] = useState<VideoTagItem[]>(DEFAULT_TAGS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('전체');
  const [selectedTag, setSelectedTag] = useState<string>('전체');

  // 모달 상태
  const [isUpsertOpen, setIsUpsertOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoLectureItem | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<VideoLectureItem | null>(null);

  // 영상 등록/수정 폼 상태
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formGrades, setFormGrades] = useState<string[]>(['중3']);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formAttachmentName, setFormAttachmentName] = useState('');
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 태그 추가/수정 상태
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('indigo');
  const [editingTag, setEditingTag] = useState<VideoTagItem | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('indigo');

  // 데이터 로드
  const fetchVideosAndTags = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/content/videos');
      const data = await res.json();
      if (data.success) {
        setVideos(data.videos || []);
        if (data.tags && data.tags.length > 0) {
          setTags(data.tags);
        }
      }
    } catch (e) {
      console.error('Failed to load videos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideosAndTags();
  }, []);

  // 폼 열기 (등록)
  const handleOpenCreate = () => {
    setEditingVideo(null);
    setFormTitle('');
    setFormUrl('');
    setFormDescription('');
    setFormGrades(['중3']);
    setFormTags([]);
    setFormAttachmentName('');
    setFormAttachmentUrl('');
    setFormIsActive(true);
    setIsUpsertOpen(true);
  };

  // 폼 열기 (수정)
  const handleOpenEdit = (v: VideoLectureItem) => {
    setEditingVideo(v);
    setFormTitle(v.title);
    setFormUrl(v.videoUrl);
    setFormDescription(v.description || '');
    setFormGrades(v.grades || ['공통']);
    setFormTags(v.tags || []);
    setFormAttachmentName(v.attachmentName || '');
    setFormAttachmentUrl(v.attachmentUrl || '');
    setFormIsActive(v.isActive !== false);
    setIsUpsertOpen(true);
  };

  // 입력 URL 실시간 파싱 결과
  const currentParsed = useMemo(() => {
    return parseVideoUrl(formUrl);
  }, [formUrl]);

  // 영상 저장 (등록/수정)
  const handleSubmitVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('강의 제목을 입력해주세요.');
      return;
    }
    if (!formUrl.trim() || !currentParsed.embedUrl) {
      alert('유효한 유튜브 링크 또는 구글 드라이브 링크를 입력해주세요.');
      return;
    }
    if (formGrades.length === 0) {
      alert('최소 1개 이상의 학년을 선택해주세요.');
      return;
    }

    try {
      setIsSaving(true);
      const videoData: Partial<VideoLectureItem> = {
        id: editingVideo ? editingVideo.id : `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: formTitle.trim(),
        description: formDescription.trim(),
        videoUrl: formUrl.trim(),
        sourceType: currentParsed.sourceType === 'youtube' ? 'youtube' : 'google_drive',
        embedUrl: currentParsed.embedUrl,
        thumbnailUrl: currentParsed.thumbnailUrl || '',
        grades: formGrades,
        tags: formTags,
        attachmentName: formAttachmentName.trim(),
        attachmentUrl: formAttachmentUrl.trim(),
        isActive: formIsActive,
        order: editingVideo ? editingVideo.order : videos.length + 1,
      };

      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_video',
          video: videoData,
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        setVideos(resData.videos);
        setIsUpsertOpen(false);
      } else {
        alert('저장 실패: ' + resData.error);
      }
    } catch (e: any) {
      alert('저장 중 오류: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 영상 삭제
  const handleDeleteVideo = async (id: string, title: string) => {
    if (!confirm(`'${title}' 영상을 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_video',
          videoId: id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(data.videos);
      }
    } catch (e) {
      alert('삭제 실패');
    }
  };

  // 영상 활성/비활성 토글
  const handleToggleActive = async (v: VideoLectureItem) => {
    try {
      const updated = { ...v, isActive: !v.isActive };
      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_video',
          video: updated,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(data.videos);
      }
    } catch (e) {
      alert('상태 변경 실패');
    }
  };

  // 칩 신규 추가
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const newTag: VideoTagItem = {
        id: `tag_${Date.now()}`,
        name: newTagName.trim(),
        color: newTagColor,
        createdAt: new Date().toISOString(),
      };
      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_tag',
          tag: newTag,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.tags);
        setNewTagName('');
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('칩 추가 실패');
    }
  };

  // 칩 수정 (🌟 기존 영상들 태그도 일괄 연동 업데이트)
  const handleUpdateTag = async (oldTag: VideoTagItem) => {
    if (!editTagName.trim()) return;
    try {
      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_tag',
          tagId: oldTag.id,
          oldName: oldTag.name,
          newName: editTagName.trim(),
          newColor: editTagColor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.tags);
        setVideos(data.videos);
        setEditingTag(null);
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('칩 수정 실패');
    }
  };

  // 칩 삭제 (🌟 기존 영상들에서 해당 태그 자동 제거)
  const handleDeleteTag = async (tag: VideoTagItem) => {
    if (!confirm(`'${tag.name}' 칩을 삭제하시겠습니까?\n해당 칩이 부여된 모든 영상에서도 칩이 제거됩니다.`)) return;
    try {
      const res = await fetch('/api/content/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_tag',
          tagId: tag.id,
          tagName: tag.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.tags);
        setVideos(data.videos);
        if (selectedTag === tag.name) setSelectedTag('전체');
      }
    } catch (e) {
      alert('칩 삭제 실패');
    }
  };

  // 필터링된 영상 목록
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      // 1. 검색어 필터
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(query);
        const matchDesc = (v.description || '').toLowerCase().includes(query);
        const matchTags = (v.tags || []).some(t => t.toLowerCase().includes(query));
        if (!matchTitle && !matchDesc && !matchTags) return false;
      }
      // 2. 학년 필터
      if (selectedGrade !== '전체') {
        const grades = v.grades || [];
        if (!grades.includes(selectedGrade) && !grades.includes('공통')) {
          return false;
        }
      }
      // 3. 태그 필터
      if (selectedTag !== '전체') {
        const tags = v.tags || [];
        if (!tags.includes(selectedTag)) return false;
      }
      return true;
    });
  }, [videos, searchQuery, selectedGrade, selectedTag]);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* 1. 상단 타이틀 & 주요 액션 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-black shadow-xs">
              <PlaySquare size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  인강 관리
                </h1>
                <span className="text-[11px] px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full font-extrabold">
                  컨텐츠 센터
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                유튜브 및 구글 드라이브 인강 링크를 등록하고, 학년별/단원별로 학생 화면에 제공합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsTagModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all cursor-pointer"
          >
            <Settings2 size={15} />
            <span>필터 칩(태그) 관리</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={3} />
            <span>새 인강 등록</span>
          </button>
        </div>
      </div>

      {/* 2. 학년 필터 바 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-black text-slate-400 mr-1 shrink-0">학년:</span>
        {['전체', ...ALL_GRADES].map((grade) => {
          const isSelected = selectedGrade === grade;
          return (
            <button
              key={grade}
              onClick={() => setSelectedGrade(grade)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-200'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {grade}
            </button>
          );
        })}
      </div>

      {/* 3. 커스텀 필터 칩(태그) 바 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-xs font-black text-slate-400 mr-1 shrink-0">태그:</span>
        <button
          onClick={() => setSelectedTag('전체')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            selectedTag === '전체'
              ? 'bg-slate-800 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          전체 보기
        </button>
        {tags.map((t) => {
          const isSelected = selectedTag === t.name;
          const colorMeta = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.indigo;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTag(t.name)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                isSelected
                  ? colorMeta.activeBg
                  : `${colorMeta.bg} ${colorMeta.text} ${colorMeta.border} hover:opacity-80`
              }`}
            >
              #{t.name}
            </button>
          );
        })}
      </div>

      {/* 4. 검색창 및 통계 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="강의 제목, 설명, 태그로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:border-rose-400 focus:bg-white transition-all"
          />
        </div>
        <div className="text-xs font-bold text-slate-500 flex items-center gap-3">
          <span>
            총 <strong className="text-rose-600">{filteredVideos.length}</strong>개 강의
          </span>
          <button
            onClick={fetchVideosAndTags}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 5. 영상 카드 그리드 */}
      {loading ? (
        <div className="p-20 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-rose-500" size={28} />
          <p className="text-xs font-bold">인강 목록을 불러오는 중입니다...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 space-y-3">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl mx-auto flex items-center justify-center">
            <Video size={24} />
          </div>
          <h3 className="text-sm font-black text-slate-700">등록된 영상 강의가 없습니다</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            상단의 <strong>[새 인강 등록]</strong> 버튼을 눌러 유튜브 링크나 구글 드라이브 영상을 등록해보세요.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer"
          >
            첫 인강 등록하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVideos.map((v) => {
            return (
              <div
                key={v.id}
                className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col group hover:shadow-lg ${
                  v.isActive 
                    ? 'border-slate-200/90 hover:border-rose-300' 
                    : 'border-slate-200 bg-slate-50/70 opacity-70'
                }`}
              >
                {/* 썸네일 영역 */}
                <div 
                  onClick={() => setPreviewVideo(v)}
                  className="relative aspect-video bg-slate-900 overflow-hidden cursor-pointer group/thumb"
                >
                  {v.thumbnailUrl ? (
                    <img 
                      src={v.thumbnailUrl} 
                      alt={v.title}
                      className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300" 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 bg-gradient-to-br from-slate-900 to-slate-800">
                      <HardDrive size={36} className="text-slate-400" />
                      <span className="text-[11px] font-bold text-slate-300">Google Drive Video</span>
                    </div>
                  )}

                  {/* 재생 버튼 오버레이 */}
                  <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/40 flex items-center justify-center transition-all">
                    <div className="w-12 h-12 bg-white/90 text-rose-600 rounded-full flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
                      <Play size={22} className="ml-1 fill-rose-600" />
                    </div>
                  </div>

                  {/* 플랫폼 배지 */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    {v.sourceType === 'youtube' ? (
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-md shadow-xs">
                        <Youtube size={12} /> YouTube
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-blue-600 text-white rounded-md shadow-xs">
                        <HardDrive size={12} /> Google Drive
                      </span>
                    )}
                  </div>

                  {/* 활성화 상태 배지 */}
                  <div className="absolute top-2.5 right-2.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs ${
                      v.isActive 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {v.isActive ? '노출 ON' : '숨김 OFF'}
                    </span>
                  </div>
                </div>

                {/* 본문 정보 영역 */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {/* 학년 배지 및 태그 칩 */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {(v.grades || []).map((g) => (
                        <span 
                          key={g} 
                          className="text-[10px] font-black px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200"
                        >
                          {g}
                        </span>
                      ))}

                      {(v.tags || []).map((tagName) => {
                        const tagObj = tags.find(t => t.name === tagName);
                        const c = TAG_COLOR_MAP[tagObj?.color || 'indigo'];
                        return (
                          <span 
                            key={tagName} 
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}
                          >
                            #{tagName}
                          </span>
                        );
                      })}
                    </div>

                    {/* 제목 */}
                    <h3 
                      onClick={() => setPreviewVideo(v)}
                      className="text-sm font-black text-slate-900 line-clamp-2 hover:text-rose-600 transition-colors cursor-pointer"
                      title={v.title}
                    >
                      {v.title}
                    </h3>

                    {/* 설명 */}
                    {v.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {v.description}
                      </p>
                    )}
                  </div>

                  {/* 하단 첨부자료 및 액션 컨트롤 */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {/* 첨부자료 */}
                    {v.attachmentUrl ? (
                      <a
                        href={v.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200/60 max-w-[150px] truncate"
                        title={v.attachmentName || '첨부자료'}
                      >
                        <FileText size={12} className="shrink-0" />
                        <span className="truncate">{v.attachmentName || '교재/자료'}</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">자료 없음</span>
                    )}

                    {/* 버튼 컨트롤 */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleActive(v)}
                        className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                          v.isActive 
                            ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' 
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={v.isActive ? '숨김 처리하기' : '노출 처리하기'}
                      >
                        {v.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(v)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                        title="수정하기"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteVideo(v.id, v.title)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="삭제하기"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. 영상 등록/수정 모달 */}
      {/* ========================================================= */}
      {isUpsertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            {/* 모달 헤더 */}
            <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <PlaySquare size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">
                    {editingVideo ? '인강 수정하기' : '새 인강 등록'}
                  </h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    유튜브 영상 주소 또는 구글 드라이브 공유 링크를 붙여넣으세요.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUpsertOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 본문 */}
            <form onSubmit={handleSubmitVideo} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
              {/* 강의 제목 */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                  <span>강의 제목</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: [중3 수학] 이차함수의 그래프와 핵심 개념 정리"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>

              {/* 영상 링크 */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                  <span>영상 링크 (YouTube 또는 Google Drive)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://www.youtube.com/watch?v=... 또는 https://drive.google.com/file/d/.../view"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-rose-500 focus:bg-white"
                />

                {/* 파싱 결과 피드백 */}
                {formUrl.trim() && (
                  <div className="mt-1">
                    {currentParsed.sourceType === 'youtube' && (
                      <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                        <Check size={12} strokeWidth={3} /> YouTube 동영상이 감지되었습니다.
                      </p>
                    )}
                    {currentParsed.sourceType === 'google_drive' && (
                      <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-2.5 space-y-1">
                        <p className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                          <Check size={12} strokeWidth={3} /> Google Drive 동영상이 감지되었습니다.
                        </p>
                        <p className="text-[10px] text-blue-600">
                          ⚠️ 구글 드라이브 파일의 공유 설정이 <strong>"링크가 있는 모든 사용자(뷰어)"</strong>로 설정되어 있는지 꼭 확인해주세요!
                        </p>
                      </div>
                    )}
                    {currentParsed.sourceType === 'unknown' && (
                      <p className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                        <AlertCircle size={12} /> 유튜브 또는 구글 드라이브 링크 형식인지 확인해주세요.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 실시간 미리보기 플레이어 (선생님 확인용) */}
              {currentParsed.embedUrl && (
                <div className="space-y-1 bg-slate-900 p-3 rounded-2xl">
                  <div className="flex items-center justify-between text-white text-[11px] font-bold mb-1.5">
                    <span className="flex items-center gap-1 text-rose-400">
                      <Play size={12} /> 등록 전 즉시 미리보기 (정상 재생 확인)
                    </span>
                    <span className="text-[10px] text-slate-400">영상과 소리를 체크해보세요</span>
                  </div>
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                    <iframe
                      src={currentParsed.embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}

              {/* 대상 학년 선택 (다중 선택) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                    <span>대상 학년</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (formGrades.length === ALL_GRADES.length) {
                        setFormGrades(['중3']);
                      } else {
                        setFormGrades([...ALL_GRADES]);
                      }
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:underline"
                  >
                    {formGrades.length === ALL_GRADES.length ? '선택 초기화' : '전 학년 선택'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_GRADES.map((g) => {
                    const isChecked = formGrades.includes(g);
                    return (
                      <button
                        type="button"
                        key={g}
                        onClick={() => {
                          if (isChecked) {
                            if (formGrades.length > 1) {
                              setFormGrades(formGrades.filter(x => x !== g));
                            }
                          } else {
                            setFormGrades([...formGrades, g]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                          isChecked
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isChecked && <Check size={12} strokeWidth={3} className="inline mr-1" />}
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 태그(필터 칩) 선택 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700">
                  태그 칩 선택 (단원/특징 분류)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const isSelected = formTags.includes(t.name);
                    const colorMeta = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.indigo;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          if (isSelected) {
                            setFormTags(formTags.filter(x => x !== t.name));
                          } else {
                            setFormTags([...formTags, t.name]);
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          isSelected
                            ? colorMeta.activeBg
                            : `${colorMeta.bg} ${colorMeta.text} ${colorMeta.border} opacity-60 hover:opacity-100`
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={3} className="inline mr-1" />}
                        #{t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 첨부자료 (선택) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-700">
                    첨부자료 이름 (선택)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 개념정리_워크시트.pdf"
                    value={formAttachmentName}
                    onChange={(e) => setFormAttachmentName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-700">
                    첨부자료 링크 URL (선택)
                  </label>
                  <input
                    type="text"
                    placeholder="구글드라이브 공유 링크나 다운로드 링크"
                    value={formAttachmentUrl}
                    onChange={(e) => setFormAttachmentUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* 간단 설명 / 코멘트 */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-700">
                  강의 설명 / 학습 메모 (선택)
                </label>
                <textarea
                  rows={2}
                  placeholder="학생들에게 전할 간단한 가이드나 강의 포인트를 적어주세요."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white resize-none"
                />
              </div>

              {/* 노출 여부 토글 */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-black text-slate-800">학생 화면 노출</span>
                  <p className="text-[10px] text-slate-500">체크 해제 시 학생들에게 숨김 처리됩니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    formIsActive ? 'bg-rose-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
                </button>
              </div>

              {/* 저장 버튼 */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUpsertOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSaving && <RefreshCw size={14} className="animate-spin" />}
                  <span>{editingVideo ? '수정 완료' : '등록하기'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. 필터 칩(태그) 관리 모달 */}
      {/* ========================================================= */}
      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Settings2 size={18} className="text-slate-700" />
                <h2 className="text-base font-black text-slate-800">
                  필터 칩(태그) 관리
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsTagModalOpen(false);
                  setEditingTag(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* 신규 칩 추가 섹션 */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <h3 className="text-xs font-black text-slate-800">새 필터 칩 추가</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="태그명 (예: 서술형대비, 심화킬러)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-rose-500"
                  />
                  <select
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                  >
                    <option value="indigo">보라 (Indigo)</option>
                    <option value="violet">자주 (Violet)</option>
                    <option value="emerald">초록 (Emerald)</option>
                    <option value="amber">주황 (Amber)</option>
                    <option value="rose">로즈 (Rose)</option>
                    <option value="sky">하늘 (Sky)</option>
                    <option value="teal">청록 (Teal)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-black cursor-pointer shrink-0"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 등록된 칩 목록 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-500">
                  <span>등록된 칩 목록 ({tags.length}개)</span>
                  <span className="text-[10px] text-slate-400">수정 시 해당 칩의 모든 영상도 자동 업데이트됩니다</span>
                </div>

                <div className="space-y-2">
                  {tags.map((t) => {
                    const isThisEditing = editingTag?.id === t.id;
                    const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.indigo;

                    if (isThisEditing) {
                      return (
                        <div key={t.id} className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2">
                          <input
                            type="text"
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-bold"
                          />
                          <select
                            value={editTagColor}
                            onChange={(e) => setEditTagColor(e.target.value)}
                            className="px-2 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-bold"
                          >
                            <option value="indigo">Indigo</option>
                            <option value="violet">Violet</option>
                            <option value="emerald">Emerald</option>
                            <option value="amber">Amber</option>
                            <option value="rose">Rose</option>
                            <option value="sky">Sky</option>
                            <option value="teal">Teal</option>
                          </select>
                          <button
                            onClick={() => handleUpdateTag(t)}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black cursor-pointer"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingTag(null)}
                            className="p-1 text-slate-400 hover:text-slate-600"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={t.id} 
                        className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
                            #{t.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingTag(t);
                              setEditTagName(t.name);
                              setEditTagColor(t.color);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg"
                            title="수정"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTag(t)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg"
                            title="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. 영상 재생 확인 모달 (선생님 검증용 팝업 플레이어) */}
      {/* ========================================================= */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-4xl rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-white">
                <PlaySquare size={18} className="text-rose-500" />
                <span className="text-sm font-black truncate max-w-md">
                  {previewVideo.title}
                </span>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="aspect-video w-full bg-black">
              <iframe
                src={previewVideo.embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="p-4 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {(previewVideo.grades || []).map(g => (
                  <span key={g} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">
                    {g}
                  </span>
                ))}
                {(previewVideo.tags || []).map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-300 border border-rose-900/50 font-bold">
                    #{t}
                  </span>
                ))}
              </div>

              {previewVideo.attachmentUrl && (
                <a
                  href={previewVideo.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-950/50 px-3 py-1.5 rounded-xl border border-indigo-900/60"
                >
                  <Download size={14} />
                  <span>첨부자료: {previewVideo.attachmentName || '열람하기'}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
