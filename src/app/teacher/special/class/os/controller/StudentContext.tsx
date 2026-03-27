'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// 👩‍🎓 학생 데이터 타입 (DB 구조와 코드 편의성을 모두 잡음!)
export interface Student {
  id: string;               // Supabase UUID
  name: string;             // 학생 이름
  grade: string;            // 학년
  drive_folder_id: string;  // 💾 DB 원본 필드명
  folderId?: string;        // 🚀 코드에서 편하게 쓰기 위한 별칭 (Optional)
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
      const response = await fetch('/api/drive/students');
      const data = await response.json();
      
      if (data && Array.isArray(data.students)) {
        // 🔄 매핑 작업: drive_folder_id를 folderId로도 쓸 수 있게 복사해줌
        const mappedStudents = data.students.map((s: any) => ({
          ...s,
          folderId: s.drive_folder_id // 👈 이제 .folderId 로 접근 가능!
        }));

        setStudents(mappedStudents);
        console.log("✅ 학생 명부 동기화 완료:", mappedStudents.length, "명");
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