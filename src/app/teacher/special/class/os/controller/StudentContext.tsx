'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// 👩‍🎓 학생 데이터 타입 (Supabase 구조에 맞게 수정!)
export interface Student {
  id: string;              // Supabase UUID (매직 링크의 핵심!)
  name: string;            // 학생 이름
  grade: string;           // 학년
  drive_folder_id: string; // 구글 드라이브 폴더 ID
}

interface StudentContextType {
  students: Student[];
  selectedStudent: Student | null;
  isLoading: boolean;
  setSelectedStudent: (student: Student | null) => void;
  refreshStudents: () => Promise<void>;
}

const StudentContext = createContext<StudentContextType | undefined>(undefined);

export function StudentProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      // ✅ 우리가 만든 Supabase 통합 API 호출
      const response = await fetch('/api/drive/students');
      const data = await response.json();
      
      // 🚩 수정 포인트: API가 { students: [] } 형태로 주니까 data.students를 체크!
      if (data && Array.isArray(data.students)) {
        // 최신 등록 순으로 정렬되어 오겠지만, 한 번 더 확실히 세팅!
        setStudents(data.students);
        console.log("✅ 학생 명부 동기화 완료:", data.students.length, "명");
      } else {
        console.warn("⚠️ 학생 데이터 형식이 올바르지 않습니다:", data);
      }
    } catch (error) {
      console.error("❌ 학생 명부 로딩 실패:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStudents();
  }, [refreshStudents]);

  return (
    <StudentContext.Provider value={{ 
      students, 
      selectedStudent, 
      isLoading, 
      setSelectedStudent, 
      refreshStudents 
    }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudents() {
  const context = useContext(StudentContext);
  if (context === undefined) throw new Error('useStudents must be used within StudentProvider');
  return context;
}