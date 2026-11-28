import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ExamPaper } from '@/app/api/test2/exam/route';
import type { StudentSubmission } from '@/app/api/test2/student-exams/route';

function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function hasAnyPendingAnswer(sub: Partial<StudentSubmission> | null | undefined): boolean {
  if (!sub) return false;
  if (sub.has_pending_review) return true;
  if (!sub.answers || typeof sub.answers !== 'object') return false;
  return Object.values(sub.answers).some(
    (ans: any) => ans && (ans.grading_status === 'pending' || (ans.is_descriptive && ans.is_correct === null))
  );
}

function toExamPaperRow(exam: ExamPaper) {
  return {
    id: exam.id,
    title: exam.title || '',
    grade: exam.grade || '공통',
    duration_min: typeof exam.duration_min === 'number' ? exam.duration_min : Number(exam.duration_min) || 0,
    assigned_student_ids: Array.isArray(exam.assigned_student_ids) ? exam.assigned_student_ids : [],
    target_student_id: exam.target_student_id || null,
    parent_exam_id: exam.parent_exam_id || null,
    is_wrong_review: Boolean(exam.is_wrong_review),
    is_special: Boolean(exam.is_special),
    is_treasure_hunt: Boolean(exam.is_treasure_hunt),
    question_count: Array.isArray(exam.questions) ? exam.questions.length : 0,
    payload: exam,
    created_at: exam.created_at || new Date().toISOString(),
    updated_at: exam.updated_at || new Date().toISOString(),
  };
}

function toSubmissionRow(sub: StudentSubmission) {
  const isPending = hasAnyPendingAnswer(sub);
  return {
    id: sub.id || `${sub.student_id}_${sub.exam_id}`,
    student_id: sub.student_id,
    exam_id: sub.exam_id,
    exam_title: sub.exam_title || '',
    submitted_at: sub.submitted_at || new Date().toISOString(),
    score: typeof sub.score === 'number' ? sub.score : Number(sub.score) || 0,
    total_questions: typeof sub.total_questions === 'number' ? sub.total_questions : Number(sub.total_questions) || 0,
    correct_count: typeof sub.correct_count === 'number' ? sub.correct_count : Number(sub.correct_count) || 0,
    has_pending_review: isPending,
    pending_count: typeof sub.pending_count === 'number' ? sub.pending_count : 0,
    submitted_by: sub.submitted_by || null,
    payload: {
      ...sub,
      has_pending_review: isPending,
    },
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Exam Papers Queries (normalized public.exam_papers)
// ---------------------------------------------------------------------------

export async function getAllExamPapersDb(): Promise<ExamPaper[]> {
  const sb = getServerSupabase();
  const list: ExamPaper[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('exam_papers')
      .select('payload')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`시험지 목록 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (row?.payload) list.push(row.payload as ExamPaper);
    }
    if (data.length < pageSize) break;
  }
  return list;
}

export async function getExamPapersByStudentDb(studentId: string): Promise<ExamPaper[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('exam_papers')
    .select('payload')
    .contains('assigned_student_ids', JSON.stringify([studentId]))
    .order('created_at', { ascending: false });
  if (error) throw new Error(`학생 시험지 목록 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as ExamPaper).filter(Boolean);
}

export async function getSpecialExamPapersDb(): Promise<ExamPaper[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('exam_papers')
    .select('payload')
    .or('is_special.eq.true,title.ilike.%[스페셜]%')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`스페셜 시험지 목록 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as ExamPaper).filter(Boolean);
}

export async function getExamPaperByIdDb(examId: string): Promise<ExamPaper | null> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('exam_papers')
    .select('payload')
    .eq('id', examId)
    .maybeSingle();
  if (error) throw new Error(`시험지 단건 조회 실패: ${error.message}`);
  return (data?.payload as ExamPaper) || null;
}

export async function getExamPapersByIdsDb(examIds: string[]): Promise<ExamPaper[]> {
  if (!examIds.length) return [];
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('exam_papers')
    .select('payload')
    .in('id', examIds);
  if (error) throw new Error(`시험지 다건 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as ExamPaper).filter(Boolean);
}

export async function upsertExamPaperDb(exam: ExamPaper): Promise<void> {
  const sb = getServerSupabase();
  const { error } = await sb
    .from('exam_papers')
    .upsert(toExamPaperRow(exam), { onConflict: 'id' });
  if (error) throw new Error(`시험지 저장 실패: ${error.message}`);
}

export async function upsertExamPapersDb(exams: ExamPaper[]): Promise<void> {
  if (!exams.length) return;
  const sb = getServerSupabase();
  const rows = exams.map(toExamPaperRow);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb
      .from('exam_papers')
      .upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`시험지 일괄 저장 실패: ${error.message}`);
  }
}

export async function deleteExamPaperDb(examId: string): Promise<void> {
  const sb = getServerSupabase();
  const { error } = await sb
    .from('exam_papers')
    .delete()
    .eq('id', examId);
  if (error) throw new Error(`시험지 삭제 실패: ${error.message}`);
}

export async function deleteExamPapersDb(examIds: string[]): Promise<void> {
  if (!examIds.length) return;
  const sb = getServerSupabase();
  const { error } = await sb
    .from('exam_papers')
    .delete()
    .in('id', examIds);
  if (error) throw new Error(`시험지 일괄 삭제 실패: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Student Exam Submissions Queries (normalized public.student_exam_submissions)
// ---------------------------------------------------------------------------

export async function getAllSubmissionsDb(): Promise<StudentSubmission[]> {
  const sb = getServerSupabase();
  const list: StudentSubmission[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('student_exam_submissions')
      .select('payload')
      .order('submitted_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`제출 기록 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (row?.payload) list.push(row.payload as StudentSubmission);
    }
    if (data.length < pageSize) break;
  }
  return list;
}

export async function getAllSubmissionSummariesDb(): Promise<StudentSubmission[]> {
  const sb = getServerSupabase();
  const list: StudentSubmission[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('student_exam_submission_summaries')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`제출 요약 목록 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      list.push(row as StudentSubmission);
    }
    if (data.length < pageSize) break;
  }
  return list;
}

export async function getSubmissionsByStudentDb(studentId: string): Promise<StudentSubmission[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('student_exam_submissions')
    .select('payload')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`학생 제출 기록 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as StudentSubmission).filter(Boolean);
}

export async function getSubmissionsByExamDb(examId: string): Promise<StudentSubmission[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('student_exam_submissions')
    .select('payload')
    .eq('exam_id', examId)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`시험지별 제출 기록 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as StudentSubmission).filter(Boolean);
}

export async function getSubmissionsByExamIdsDb(examIds: string[]): Promise<StudentSubmission[]> {
  if (!examIds.length) return [];
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('student_exam_submissions')
    .select('payload')
    .in('exam_id', examIds)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`다중 시험지 제출 기록 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as StudentSubmission).filter(Boolean);
}

export async function getPendingDescriptiveSubmissionsDb(): Promise<StudentSubmission[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('student_exam_submissions')
    .select('payload')
    .eq('has_pending_review', true)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`채점 대기 제출 조회 실패: ${error.message}`);
  return (data || []).map((r: any) => r.payload as StudentSubmission).filter(Boolean);
}

export async function getSubmissionByStudentAndExamDb(
  studentId: string,
  examId: string
): Promise<StudentSubmission | null> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('student_exam_submissions')
    .select('payload')
    .eq('student_id', studentId)
    .eq('exam_id', examId)
    .maybeSingle();
  if (error) throw new Error(`단건 제출 조회 실패: ${error.message}`);
  return (data?.payload as StudentSubmission) || null;
}

export async function upsertSubmissionDb(sub: StudentSubmission): Promise<void> {
  const sb = getServerSupabase();
  const { error } = await sb
    .from('student_exam_submissions')
    .upsert(toSubmissionRow(sub), { onConflict: 'id' });
  if (error) throw new Error(`제출 기록 저장 실패: ${error.message}`);
}

export async function upsertSubmissionsDb(subs: StudentSubmission[]): Promise<void> {
  if (!subs.length) return;
  const sb = getServerSupabase();
  const rows = subs.map(toSubmissionRow);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb
      .from('student_exam_submissions')
      .upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`제출 기록 일괄 저장 실패: ${error.message}`);
  }
}

export async function deleteSubmissionByIdDb(id: string): Promise<void> {
  const sb = getServerSupabase();
  const { error } = await sb
    .from('student_exam_submissions')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`제출 기록 삭제 실패: ${error.message}`);
}

export async function deleteSubmissionsByExamIdDb(examId: string): Promise<void> {
  const sb = getServerSupabase();
  const { error } = await sb
    .from('student_exam_submissions')
    .delete()
    .eq('exam_id', examId);
  if (error) throw new Error(`시험지 제출 기록 삭제 실패: ${error.message}`);
}
