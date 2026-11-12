// =========================================================================
// Eduest 라이브러리 콘텐츠 활용 분석 전용 타입 및 유틸리티
// =========================================================================

export interface LibrarySessionActivityItem {
  folderDriveId: string;
  folderName: string;
  folderParentPath?: string;
  fileId?: string;
  fileName: string; // e.g. "0001", "__folder_explore__"
  docDisplayName?: string;
  durationSec: number;
  openCount: number;
  solutionViews: number;
}

export interface StudentLibrarySessionRecord {
  id: string; // `${student_id}_${date}`
  student_id: string;
  student_name: string;
  student_grade: string;
  date: string; // "YYYY-MM-DD" (KST)
  total_duration_sec: number;
  first_access_at: string;
  last_access_at: string;
  sessions: Array<{
    id: string;
    started_at: string;
    ended_at: string;
    duration_sec: number;
    items: LibrarySessionActivityItem[];
  }>;
  items_summary: Record<string, {
    folderDriveId: string;
    folderName: string;
    fileName: string;
    totalDurationSec: number;
    totalOpenCount: number;
    totalSolutionViews: number;
  }>;
  updated_at: string;
}

export function getKSTDateString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
