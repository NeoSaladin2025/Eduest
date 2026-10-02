export interface ReviewItem {
  id: string; // file drive_id or unique ID
  fileId: string;
  name: string;
  folderId: string;
  folderName: string;
  problemUrl?: string;
  solutionUrl?: string;
  type: 'html' | 'image';
  addedAt?: string;
  answer?: string;
  raw_answer?: string;
  points?: number;
  questionNumber?: number;
  examTitle?: string;
  lastTestedAt?: string;
  lastIsCorrect?: boolean;
  lastUserAnswer?: string;
  lastSpentSec?: number;
  bestSpentSec?: number;           // 역대 최단 정답 시간 (초)
  timeRecords?: ReviewLapRecord[]; // 누적 타임랩 풀이 기록
}

export interface ReviewLapRecord {
  id: string;
  spentSec: number;        // 소요 시간(초)
  isCorrect: boolean;      // 정답 여부
  recordedAt: string;      // 기록 일시 (ISO string)
  userAnswer?: string;     // 작성한 답안
  diffFromPrev?: number;   // 이전 풀이 대비 단축/증가 시간 (음수면 단축, 예: -14)
}

export interface ReviewTestResultItem {
  itemId: string;
  questionName: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  spentSec: number;
  solutionUrl?: string;
  problemUrl?: string;
  diffFromPrev?: number;   // 이전 풀이 대비 시간 차이 (음수: 단축)
  isNewRecord?: boolean;   // 신기록 달성 여부
  bestSpentSec?: number;   // 역대 최고(최단) 시간
  topRecords?: ReviewLapRecord[]; // 해당 문항 TOP 3 기록
}

export interface ReviewTestHistory {
  id: string;
  folderId?: string | null;
  folderName?: string;
  testedAt: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  timeSpentSec: number;
  results: ReviewTestResultItem[];
}

export interface ReviewFolder {
  id: string;
  name: string;
  createdAt: string;
  parentId?: string | null;
}

export interface StudentReviewData {
  folders: ReviewFolder[];
  items: ReviewItem[];
  testHistory?: ReviewTestHistory[];
}

export interface StudentHomeworkItem {
  id: string;
  classId: string;
  className: string;
  classDate: string; // 부여받은 날짜
  content: string; // 숙제 내용
  dueDate: string; // 제출 기한
  status: 'DONE' | 'NOT_DONE' | 'UNCHECKED'; // 완료 여부
}
