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
