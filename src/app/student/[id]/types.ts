export interface ReviewItem {
  id: string; // file drive_id or unique ID
  fileId: string;
  name: string;
  folderId: string;
  folderName: string;
  problemUrl?: string;
  solutionUrl?: string;
  type: 'html' | 'image';
  addedAt: string;
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
