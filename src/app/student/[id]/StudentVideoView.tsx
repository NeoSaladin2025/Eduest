'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlaySquare, Search, FileText, Download, ExternalLink, 
  Youtube, HardDrive, Play, Sparkles, Filter, CheckCircle2, ChevronRight
} from 'lucide-react';
import { 
  VideoLectureItem, 
  VideoTagItem, 
  DEFAULT_TAGS, 
  ALL_GRADES, 
  extractBaseGrade, 
  TAG_COLOR_MAP 
} from '@/lib/videoTypes';

interface StudentVideoViewProps {
  student: any;
}

export default function StudentVideoView({ student }: StudentVideoViewProps) {
  const [videos, setVideos] = useState<VideoLectureItem[]>([]);
  const [tags, setTags] = useState<VideoTagItem[]>(DEFAULT_TAGS);
  const [loading, setLoading] = useState(true);

  // 학생의 본인 학년 추출 (예: '중3-A' -> '중3')
  const myBaseGrade = useMemo(() => {
    return extractBaseGrade(student?.grade);
  }, [student?.grade]);

  // 기본 선택 학년 = 본인 학년!
  const [selectedGrade, setSelectedGrade] = useState<string>(myBaseGrade);
  const [selectedTag, setSelectedTag] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPlayingVideo, setCurrentPlayingVideo] = useState<VideoLectureItem | null>(null);

  // 데이터 로드
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/content/videos');
        const data = await res.json();
        if (data.success) {
          const activeVideos = (data.videos || []).filter((v: VideoLectureItem) => v.isActive !== false);
          setVideos(activeVideos);
          if (data.tags && data.tags.length > 0) {
            setTags(data.tags);
          }

          // 초기 재생할 비디오 자동 선정: 본인 학년 비디오 중 첫 번째
          const myGradeVideos = activeVideos.filter((v: VideoLectureItem) => {
            const grades = v.grades || [];
            return grades.includes(myBaseGrade) || grades.includes('공통');
          });

          if (myGradeVideos.length > 0) {
            setCurrentPlayingVideo(myGradeVideos[0]);
          } else if (activeVideos.length > 0) {
            setCurrentPlayingVideo(activeVideos[0]);
          }
        }
      } catch (e) {
        console.error('Failed to load student videos:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [myBaseGrade]);

  // 학년 변경 시 selectedGrade 동기화
  useEffect(() => {
    if (myBaseGrade) {
      setSelectedGrade(myBaseGrade);
    }
  }, [myBaseGrade]);

  // 필터링된 영상 리스트
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      // 1. 검색어
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(q);
        const matchDesc = (v.description || '').toLowerCase().includes(q);
        const matchTags = (v.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchTags) return false;
      }
      // 2. 학년 필터 (특정 학년 선택 시 해당 학년 또는 '공통' 영상 노출)
      if (selectedGrade !== '전체') {
        const grades = v.grades || [];
        if (!grades.includes(selectedGrade) && !grades.includes('공통')) {
          return false;
        }
      }
      // 3. 태그 필터
      if (selectedTag !== '전체') {
        const videoTags = v.tags || [];
        if (!videoTags.includes(selectedTag)) return false;
      }
      return true;
    });
  }, [videos, searchQuery, selectedGrade, selectedTag]);

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0f19] text-white p-4 md:p-6 lg:p-8 overflow-y-auto animate-in fade-in duration-300">
      
      {/* 1. 상단 안내 헤더 & 학년 필터 바 */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold border border-rose-500/30">
                <PlaySquare size={20} />
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>유용한 영상강의</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                  {student?.name || '학생'} 전용
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              기본으로 <strong>[{myBaseGrade}]</strong> 맞춤 영상이 추천되며, 다른 학년 탭을 선택해 예습·복습 강의도 자유롭게 시청할 수 있습니다.
            </p>
          </div>

          {/* 검색창 */}
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="강의명 또는 태그 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:bg-white/10 transition-all"
            />
          </div>
        </div>

        {/* 학년 전환 탭 (본인 학년 강조) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">학년 선택:</span>
          {['전체', ...ALL_GRADES].map((grade) => {
            const isSelected = selectedGrade === grade;
            const isMyGrade = grade === myBaseGrade;

            return (
              <button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50 scale-102'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {grade}
                {isMyGrade && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    내 학년
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 커스텀 필터 칩(태그) 바 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">주제/단원:</span>
          <button
            onClick={() => setSelectedTag('전체')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTag === '전체'
                ? 'bg-white text-slate-900 font-black'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            전체 태그
          </button>
          {tags.map((t) => {
            const isSelected = selectedTag === t.name;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTag(t.name)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600/30 text-rose-300 border-rose-500 font-black shadow-xs'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
                }`}
              >
                #{t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 메인 컨텐츠 영역 (대형 플레이어 + 강의 목록 리스트) */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 py-20">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold">강의 영상을 준비하는 중입니다...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 my-8">
          <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 mb-3">
            <PlaySquare size={28} />
          </div>
          <h3 className="text-sm font-black text-slate-200">선택하신 조건의 영상이 없습니다</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            다른 학년 탭을 선택하시거나 다른 태그를 클릭해보세요!
          </p>
          <button
            onClick={() => {
              setSelectedGrade('전체');
              setSelectedTag('전체');
              setSearchQuery('');
            }}
            className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl cursor-pointer"
          >
            전체 영상 보기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
          
          {/* 좌측: 대형 비디오 플레이어 & 상세 정보 (8 cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            {currentPlayingVideo ? (
              <div className="bg-slate-900/90 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col">
                {/* 비디오 iframe 컨테이너 */}
                <div className="aspect-video w-full bg-black relative">
                  <iframe
                    src={currentPlayingVideo.embedUrl}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* 강의 헤더 및 메타정보 */}
                <div className="p-5 md:p-6 space-y-4 bg-gradient-to-b from-slate-900/90 to-slate-950">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      {/* 배지들 */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white">
                          {currentPlayingVideo.sourceType === 'youtube' ? (
                            <>
                              <Youtube size={12} /> YouTube
                            </>
                          ) : (
                            <>
                              <HardDrive size={12} /> Google Drive
                            </>
                          )}
                        </span>

                        {(currentPlayingVideo.grades || []).map((g) => (
                          <span key={g} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-slate-300">
                            {g}
                          </span>
                        ))}

                        {(currentPlayingVideo.tags || []).map((t) => (
                          <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            #{t}
                          </span>
                        ))}
                      </div>

                      {/* 강의 제목 */}
                      <h2 className="text-lg md:text-xl font-black text-white leading-snug">
                        {currentPlayingVideo.title}
                      </h2>
                    </div>

                    {/* 🌟 첨부자료 다운로드 버튼 (있는 경우) */}
                    {currentPlayingVideo.attachmentUrl && (
                      <a
                        href={currentPlayingVideo.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-900/50 transition-all shrink-0 cursor-pointer"
                        title="강의 교재/자료 다운로드"
                      >
                        <Download size={15} />
                        <span>교재/자료 열람</span>
                      </a>
                    )}
                  </div>

                  {/* 강의 설명 / 메모 */}
                  {currentPlayingVideo.description && (
                    <div className="p-3.5 bg-white/5 rounded-2xl border border-white/5 text-xs text-slate-300 font-medium leading-relaxed">
                      {currentPlayingVideo.description}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center text-slate-400">
                우측 목록에서 시청할 강의를 선택해주세요.
              </div>
            )}
          </div>

          {/* 우측: 강의 목록 리스트 (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                강의 목록 ({filteredVideos.length}개)
              </span>
              <span className="text-[11px] font-bold text-rose-400">
                {selectedGrade}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {filteredVideos.map((v) => {
                const isPlaying = currentPlayingVideo?.id === v.id;

                return (
                  <div
                    key={v.id}
                    onClick={() => setCurrentPlayingVideo(v)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex gap-3 group ${
                      isPlaying
                        ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-950/50'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15'
                    }`}
                  >
                    {/* 미니 썸네일 */}
                    <div className="relative w-28 aspect-video rounded-xl bg-black overflow-hidden shrink-0">
                      {v.thumbnailUrl ? (
                        <img 
                          src={v.thumbnailUrl} 
                          alt={v.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900">
                          <HardDrive size={20} />
                        </div>
                      )}
                      
                      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        isPlaying ? 'bg-rose-900/40 opacity-100' : 'bg-black/30 opacity-0 group-hover:opacity-100'
                      }`}>
                        <Play size={16} className="fill-white text-white" />
                      </div>

                      {isPlaying && (
                        <div className="absolute top-1 left-1">
                          <span className="text-[8px] font-black px-1.5 py-0.2 bg-rose-600 text-white rounded-md">
                            재생 중
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 강의 정보 */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        {/* 태그들 */}
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          {(v.grades || []).slice(0, 1).map(g => (
                            <span key={g} className="text-[9px] font-bold px-1.5 py-0.2 bg-white/10 text-slate-300 rounded">
                              {g}
                            </span>
                          ))}
                          {(v.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="text-[9px] font-bold px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded">
                              #{t}
                            </span>
                          ))}
                        </div>

                        {/* 제목 */}
                        <h4 className={`text-xs font-black line-clamp-2 leading-snug ${
                          isPlaying ? 'text-rose-400' : 'text-slate-200 group-hover:text-white'
                        }`}>
                          {v.title}
                        </h4>
                      </div>

                      {/* 하단 첨부 여부 */}
                      {v.attachmentUrl && (
                        <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold mt-1">
                          <FileText size={10} />
                          <span>교재 자료 포함</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
