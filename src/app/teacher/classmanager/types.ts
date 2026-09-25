export type AttendanceStatus = 'ATTEND' | 'LATE' | 'ABSENT' | 'UNCHECKED' | null;
export type HomeworkCheckStatus = 'DONE' | 'NOT_DONE' | 'UNCHECKED' | null;

export interface StudentBasicInfo {
  id: string;
  name: string;
  grade: string;
}

export interface StudentAttendanceRecord {
  student_id: string;
  student_name: string;
  student_grade: string;
  status?: AttendanceStatus;
  absent_reason?: string;
  action_notes?: string;
  previous_homework?: string;
  previous_homework_due_date?: string;
  homework_check?: HomeworkCheckStatus;
  today_homework?: string;
  today_homework_due_date?: string;
  updated_at?: string;
}

export interface ClassItem {
  id: string;
  date: string; // 'YYYY-MM-DD'
  name: string;
  time: string;
  student_ids: string[];
  students_attendance: Record<string, StudentAttendanceRecord>;
  created_at: string;
  updated_at: string;
}

export interface SuggestionItem {
  id: string;
  text: string;
  count: number;
}

