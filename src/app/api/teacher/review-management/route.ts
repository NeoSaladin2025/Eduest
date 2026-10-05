import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { ExamPaper } from '@/app/api/test2/exam/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXAMS_RECORD_DRIVE_ID = 'test2_exam_papers_data';
const SUBMISSIONS_RECORD_DRIVE_ID = 'test2_student_submissions_data';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const mode = searchParams.get('mode'); // 'single_student' | 'special_exams' | 'summary'

    // ----------------------------------------------------
    // 모드 1: 특정 학생의 상세 복습 데이터 조회 (+ 해당 학생의 시험 제출 기록 통합)
    // ----------------------------------------------------
    if (studentId && mode !== 'special_exams') {
      const [revRes, subsRes] = await Promise.all([
        supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', `student_review_${studentId}`)
          .maybeSingle(),
        supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', SUBMISSIONS_RECORD_DRIVE_ID)
          .maybeSingle(),
      ]);

      const reviewData = revRes.data?.file_data ? JSON.parse(revRes.data.file_data) : { folders: [], items: [] };
      const allSubs: StudentSubmission[] = subsRes.data?.file_data ? JSON.parse(subsRes.data.file_data).submissions || [] : [];
      const studentSubmissions = allSubs.filter(s => s.student_id === studentId);

      return NextResponse.json({
        success: true,
        studentId,
        reviewData,
        studentSubmissions,
      });
    }

    // ----------------------------------------------------
    // 모드 2: 스페셜 시험지 목록 및 제출 현황(인증샷 포함) 조회
    // ----------------------------------------------------
    if (mode === 'special_exams') {
      const [examsRes, subsRes, studentsRes] = await Promise.all([
        supabase.from('exam_library').select('file_data').eq('drive_id', EXAMS_RECORD_DRIVE_ID).maybeSingle(),
        supabase.from('exam_library').select('file_data').eq('drive_id', SUBMISSIONS_RECORD_DRIVE_ID).maybeSingle(),
        supabase.from('students').select('id, name, grade, drive_folder_id'),
      ]);

      const allExams: ExamPaper[] = examsRes.data?.file_data ? JSON.parse(examsRes.data.file_data).exams || [] : [];
      const allSubs: StudentSubmission[] = subsRes.data?.file_data ? JSON.parse(subsRes.data.file_data).submissions || [] : [];
      const studentsMap = new Map((studentsRes.data || []).map(s => [s.id, s]));

      // 스페셜 시험지만 필터링
      const specialExams = allExams.filter(e => e.is_special || e.title.includes('[스페셜]'));

      const result = specialExams.map(exam => {
        const assignedStudents = (exam.assigned_student_ids || []).map(sid => {
          const st = studentsMap.get(sid);
          const sub = allSubs.find(s => s.student_id === sid && s.exam_id === exam.id) || null;
          return {
            student_id: sid,
            student_name: st?.name || '알 수 없음',
            student_grade: st?.grade || '-',
            drive_folder_id: st?.drive_folder_id,
            is_submitted: !!sub,
            submission: sub,
          };
        });

        return {
          ...exam,
          assigned_students: assignedStudents,
          submitted_count: assignedStudents.filter(s => s.is_submitted).length,
          total_assigned: assignedStudents.length,
        };
      });

      return NextResponse.json({
        success: true,
        specialExams: result,
      });
    }

    // ----------------------------------------------------
    // 모드 3 (기본): 전체 학생 목록 + 각 학생의 복습 통계 요약
    // ----------------------------------------------------
    const { data: students, error: stErr } = await supabase
      .from('students')
      .select('id, name, grade, drive_folder_id, created_at')
      .order('grade', { ascending: true })
      .order('name', { ascending: true });

    if (stErr) throw stErr;

    // 전체 복습 데이터 일괄 조회 (drive_id prefix: student_review_)
    const { data: reviewRows } = await supabase
      .from('exam_library')
      .select('drive_id, file_data')
      .like('drive_id', 'student_review_%');

    const reviewMap = new Map<string, any>();
    (reviewRows || []).forEach(row => {
      const sId = row.drive_id.replace('student_review_', '');
      try {
        if (row.file_data) reviewMap.set(sId, JSON.parse(row.file_data));
      } catch (e) {}
    });

    const studentsWithStats = (students || []).map(st => {
      const rData = reviewMap.get(st.id) || { folders: [], items: [] };
      const items: any[] = rData.items || [];
      const folders: any[] = rData.folders || [];

      let totalAttempts = 0;
      let correctAttempts = 0;
      let lastTestedAt: string | null = null;

      items.forEach(it => {
        const records = Array.isArray(it.timeRecords) ? it.timeRecords : [];
        if (records.length > 0) {
          totalAttempts += records.length;
          correctAttempts += records.filter((r: any) => r.isCorrect).length;
          records.forEach((r: any) => {
            if (r.recordedAt && (!lastTestedAt || r.recordedAt > lastTestedAt)) {
              lastTestedAt = r.recordedAt;
            }
          });
        } else if (it.lastTestedAt) {
          totalAttempts += 1;
          if (it.lastIsCorrect) correctAttempts += 1;
          if (!lastTestedAt || it.lastTestedAt > lastTestedAt) {
            lastTestedAt = it.lastTestedAt;
          }
        }
      });

      const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

      return {
        id: st.id,
        name: st.name,
        grade: st.grade,
        drive_folder_id: st.drive_folder_id,
        folderCount: folders.length,
        itemCount: items.length,
        totalAttempts,
        correctAttempts,
        accuracyRate: accuracy,
        lastTestedAt,
      };
    });

    return NextResponse.json({
      success: true,
      students: studentsWithStats,
    });
  } catch (error: any) {
    console.error('Review management API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '복습 관리 데이터 로드 실패' },
      { status: 500 }
    );
  }
}
