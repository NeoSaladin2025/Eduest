export interface TwinQuestionItem {
  question_number: number;
  name: string;
  drive_id: string; // 해설 HTML drive_id
  question_image_drive_id?: string | null;
  image_url: string;
  raw_answer: string;
  answer: string;
  solution_drive_id: string;
}

export interface TwinRoundData {
  round_name: string; // 예: "1차", "2차"
  round_number: number; // 1, 2
  folder_id: string;
  items: TwinQuestionItem[];
}

export interface FolderTwinData {
  parent_folder_id: string; // 원본 회차 폴더 drive_id (예: 1차)
  parent_folder_name: string;
  twin_root_folder_id: string; // [쌍둥이] 폴더 drive_id
  grade: string;
  rounds: Record<string, TwinRoundData>; // { "1차": ..., "2차": ... }
  updated_at: string;
}

export interface TwinStoreData {
  folders: Record<string, FolderTwinData>; // key: parent_folder_id
  updated_at: string;
}

// 스캔 결과 요약 타입
export interface DetectedTwinFolder {
  parent_folder_id: string;
  parent_folder_name: string;
  twin_root_folder_id: string;
  grade: string;
  detected_rounds: Array<{
    round_name: string;
    folder_id: string;
    file_count: number;
  }>;
  has_new: boolean;
  synced_round_count: number;
}
