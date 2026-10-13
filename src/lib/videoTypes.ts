/**
 * [에듀에스트 - 컨텐츠 관리: 인강 관리 타입 및 유틸리티]
 */

export interface VideoTagItem {
  id: string;
  name: string;
  color: string; // 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'teal'
  createdAt: string;
}

export interface VideoLectureItem {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  sourceType: 'youtube' | 'google_drive';
  embedUrl: string;
  thumbnailUrl?: string;
  grades: string[]; // ['중1', '중2', '중3', '고1', '고2', '고3', '공통']
  tags: string[]; // 태그 칩 이름 목록 (예: ['개념정리', '기출특강'])
  attachmentUrl?: string; // 첨부자료 링크 (구글드라이브 PDF 등)
  attachmentName?: string; // 첨부자료 이름 (예: '개념정리_워크시트.pdf')
  isActive: boolean;
  order: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_TAGS: VideoTagItem[] = [
  { id: 'tag-concept', name: '개념정리', color: 'indigo', createdAt: new Date().toISOString() },
  { id: 'tag-problems', name: '문제풀이', color: 'violet', createdAt: new Date().toISOString() },
  { id: 'tag-previous', name: '기출특강', color: 'emerald', createdAt: new Date().toISOString() },
  { id: 'tag-summary', name: '핵심요약', color: 'amber', createdAt: new Date().toISOString() },
  { id: 'tag-killer', name: '고난도킬러', color: 'rose', createdAt: new Date().toISOString() },
];

export const ALL_GRADES = ['중1', '중2', '중3', '고1', '고2', '고3', '공통'] as const;

/**
 * YouTube / Google Drive URL 파싱 및 임베드 정보 생성 유틸
 */
export function parseVideoUrl(url: string): {
  sourceType: 'youtube' | 'google_drive' | 'unknown';
  embedUrl: string;
  thumbnailUrl?: string;
} {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { sourceType: 'unknown', embedUrl: '' };
  }

  // 1. YouTube 판별
  // 형태: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const ytMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );

  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      sourceType: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  // 2. Google Drive 판별
  // 형태: drive.google.com/file/d/FILE_ID/view, drive.google.com/open?id=FILE_ID, drive.google.com/file/d/FILE_ID
  const gdMatch = trimmed.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
  );

  if (gdMatch && gdMatch[1]) {
    const fileId = gdMatch[1];
    return {
      sourceType: 'google_drive',
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      thumbnailUrl: '', // 드라이브는 기본 비디오 아이콘 처리
    };
  }

  return { sourceType: 'unknown', embedUrl: '' };
}

/**
 * 학생의 학년 문자열(예: '중3', '중3-A', '고1(특화)')에서 기본 학년 코드 추출
 */
export function extractBaseGrade(rawGrade?: string): string {
  if (!rawGrade) return '공통';
  const trimmed = rawGrade.trim();
  const match = trimmed.match(/^(중1|중2|중3|고1|고2|고3)/);
  if (match) return match[1];
  return '공통';
}

/**
 * 태그 색상 테마 맵
 */
export const TAG_COLOR_MAP: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', activeBg: 'bg-indigo-600 text-white border-indigo-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', activeBg: 'bg-violet-600 text-white border-violet-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', activeBg: 'bg-emerald-600 text-white border-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', activeBg: 'bg-amber-600 text-white border-amber-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', activeBg: 'bg-rose-600 text-white border-rose-600' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', activeBg: 'bg-sky-600 text-white border-sky-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', activeBg: 'bg-teal-600 text-white border-teal-600' },
};
