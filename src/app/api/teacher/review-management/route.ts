import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { ExamPaper } from '@/app/api/test2/exam/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';
import { google } from 'googleapis';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EXAMS_RECORD_DRIVE_ID = 'test2_exam_papers_data';
const SUBMISSIONS_RECORD_DRIVE_ID = 'test2_student_submissions_data';

// 헬퍼: Google Drive 클라이언트
function getDriveClient() {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) return null;
  try {
    const credentials = JSON.parse(keyString);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch (e) {
    console.error('Google Auth initialization error in review-management:', e);
    return null;
  }
}

// 헬퍼: 구글 드라이브 인증샷 파일 안전 삭제
async function deleteDriveFileSafely(fileId?: string) {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    if (!drive) return;
    try {
      await drive.files.delete({ fileId, supportsAllDrives: true });
      console.log(`✅ Google Drive proof deleted in review-management: ${fileId}`);
    } catch {
      await drive.files.update({
        fileId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      console.log(`✅ Google Drive proof trashed in review-management: ${fileId}`);
    }
  } catch (e) {
    console.warn(`Drive file deletion error for ${fileId}:`, e);
  }
}

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

// ----------------------------------------------------
// POST & DELETE: 특정 문항 풀이 이력 삭제 / 전체 내역 초기화
// ----------------------------------------------------
export async function POST(req: NextRequest) {
  return handleMutation(req);
}

export async function DELETE(req: NextRequest) {
  return handleMutation(req);
}

async function handleMutation(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      studentId,
      itemId,
      sourceType,
      recordedAt,
      submissionId,
      questionKey,
      proofDriveId,
      targetDriveId,
      solutionUrl,
      name,
    } = body;

    if (!studentId) {
      return NextResponse.json(
        { success: false, error: 'studentId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 개별 시도 기록 삭제 (delete_attempt)
    if (action === 'delete_attempt') {
      if (sourceType === 'review') {
        const revRes = await supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', `student_review_${studentId}`)
          .maybeSingle();

        if (revRes.data?.file_data) {
          const reviewData = JSON.parse(revRes.data.file_data);
          const items: any[] = reviewData.items || [];
          const item = items.find((it: any) => it.id === itemId || it.fileId === itemId);

          if (item) {
            if (Array.isArray(item.timeRecords)) {
              item.timeRecords = item.timeRecords.filter((r: any) => r.recordedAt !== recordedAt);
              if (item.timeRecords.length > 0) {
                const sorted = [...item.timeRecords].sort(
                  (a: any, b: any) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
                );
                const latest = sorted[0];
                item.lastTestedAt = latest.recordedAt;
                item.lastIsCorrect = latest.isCorrect;
                item.lastUserAnswer = latest.userAnswer;
                const spents = item.timeRecords
                  .map((r: any) => r.spentSec)
                  .filter((s: any) => typeof s === 'number' && s > 0);
                item.bestSpentSec = spents.length > 0 ? Math.min(...spents) : undefined;
              } else {
                item.timeRecords = [];
                item.lastTestedAt = undefined;
                item.lastIsCorrect = undefined;
                item.lastUserAnswer = undefined;
                item.bestSpentSec = undefined;
              }
            } else if (item.lastTestedAt === recordedAt) {
              item.lastTestedAt = undefined;
              item.lastIsCorrect = undefined;
              item.lastUserAnswer = undefined;
              item.bestSpentSec = undefined;
            }

            await supabase.from('exam_library').upsert(
              {
                drive_id: `student_review_${studentId}`,
                name: `student_review_${studentId}.json`,
                type: 'file',
                grade: '공통',
                file_data: JSON.stringify(reviewData),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'drive_id' }
            );
          }
        }

        return NextResponse.json({
          success: true,
          message: '복습 테스트 기록이 삭제되었습니다.',
        });
      }

      if (sourceType === 'special_exam') {
        const subsRes = await supabase
          .from('exam_library')
          .select('file_data')
          .eq('drive_id', SUBMISSIONS_RECORD_DRIVE_ID)
          .maybeSingle();

        if (subsRes.data?.file_data) {
          const parsed = JSON.parse(subsRes.data.file_data);
          let allSubs: any[] = parsed.submissions || [];
          const subIdx = allSubs.findIndex(
            (s: any) => s.id === submissionId || (s.student_id === studentId && s.id === submissionId)
          );

          if (subIdx !== -1) {
            const sub = allSubs[subIdx];
            let driveFileToDelete = proofDriveId;

            if (sub.answers && questionKey) {
              if (!driveFileToDelete && sub.answers[questionKey]?.proof_image_drive_id) {
                driveFileToDelete = sub.answers[questionKey].proof_image_drive_id;
              }
              delete sub.answers[questionKey];
            }

            if (Array.isArray(sub.proof_images)) {
              if (!driveFileToDelete) {
                const foundProof = sub.proof_images.find((p: any) => p.question_id === questionKey);
                if (foundProof?.drive_id) driveFileToDelete = foundProof.drive_id;
              }
              sub.proof_images = sub.proof_images.filter(
                (p: any) => p.question_id !== questionKey && p.drive_id !== driveFileToDelete
              );
            }

            const remainingKeys = Object.keys(sub.answers || {});
            sub.total_questions = remainingKeys.length;
            sub.correct_count = remainingKeys.filter((k: string) => sub.answers[k]?.is_correct).length;
            sub.score =
              sub.total_questions > 0
                ? Math.round((sub.correct_count / sub.total_questions) * 100)
                : 0;

            if (remainingKeys.length === 0) {
              allSubs.splice(subIdx, 1);
            }

            await supabase.from('exam_library').upsert(
              {
                drive_id: SUBMISSIONS_RECORD_DRIVE_ID,
                name: 'test2_student_submissions.json',
                type: 'file',
                grade: '공통',
                file_data: JSON.stringify({
                  submissions: allSubs,
                  updated_at: new Date().toISOString(),
                }),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'drive_id' }
            );

            if (driveFileToDelete) {
              await deleteDriveFileSafely(driveFileToDelete);
            }
          }
        }

        return NextResponse.json({
          success: true,
          message: '스페셜 시험 제출 기록 및 인증샷이 삭제되었습니다.',
        });
      }
    }

    // 2. 이 문항의 모든 풀이 기록 일괄 초기화 (delete_all_attempts)
    if (action === 'delete_all_attempts') {
      const proofsToDelete = new Set<string>();

      // (1) student_review_${studentId} 초기화
      const revRes = await supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', `student_review_${studentId}`)
        .maybeSingle();

      if (revRes.data?.file_data) {
        const reviewData = JSON.parse(revRes.data.file_data);
        const items: any[] = reviewData.items || [];
        const item = items.find((it: any) => it.id === itemId || it.fileId === itemId);
        if (item) {
          item.timeRecords = [];
          item.lastTestedAt = undefined;
          item.lastIsCorrect = undefined;
          item.lastUserAnswer = undefined;
          item.bestSpentSec = undefined;

          await supabase.from('exam_library').upsert(
            {
              drive_id: `student_review_${studentId}`,
              name: `student_review_${studentId}.json`,
              type: 'file',
              grade: '공통',
              file_data: JSON.stringify(reviewData),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'drive_id' }
          );
        }
      }

      // (2) test2_student_submissions_data 에서 이 학생의 해당 문항 답안 모두 제거
      const subsRes = await supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', SUBMISSIONS_RECORD_DRIVE_ID)
        .maybeSingle();

      if (subsRes.data?.file_data) {
        const parsed = JSON.parse(subsRes.data.file_data);
        let allSubs: any[] = parsed.submissions || [];

        const tDriveId = (targetDriveId || itemId || '').trim();

        allSubs = allSubs
          .map((sub: any) => {
            if (sub.student_id !== studentId || !sub.answers) return sub;

            const keysToDelete: string[] = [];
            Object.keys(sub.answers).forEach((qKey) => {
              const ans = sub.answers[qKey];
              const isMatch =
                (tDriveId && qKey.includes(tDriveId)) ||
                (solutionUrl && ans?.solution_drive_id === solutionUrl) ||
                (name && ans?.name === name);

              if (isMatch) {
                keysToDelete.push(qKey);
                if (ans?.proof_image_drive_id) {
                  proofsToDelete.add(ans.proof_image_drive_id);
                }
              }
            });

            if (keysToDelete.length > 0) {
              keysToDelete.forEach((k) => delete sub.answers[k]);
              if (Array.isArray(sub.proof_images)) {
                sub.proof_images.forEach((p: any) => {
                  if (keysToDelete.includes(p.question_id) && p.drive_id) {
                    proofsToDelete.add(p.drive_id);
                  }
                });
                sub.proof_images = sub.proof_images.filter((p: any) => !keysToDelete.includes(p.question_id));
              }

              const remainingKeys = Object.keys(sub.answers || {});
              sub.total_questions = remainingKeys.length;
              sub.correct_count = remainingKeys.filter((k: string) => sub.answers[k]?.is_correct).length;
              sub.score =
                sub.total_questions > 0
                  ? Math.round((sub.correct_count / sub.total_questions) * 100)
                  : 0;
            }

            return sub;
          })
          .filter((sub: any) => Object.keys(sub.answers || {}).length > 0);

        await supabase.from('exam_library').upsert(
          {
            drive_id: SUBMISSIONS_RECORD_DRIVE_ID,
            name: 'test2_student_submissions.json',
            type: 'file',
            grade: '공통',
            file_data: JSON.stringify({
              submissions: allSubs,
              updated_at: new Date().toISOString(),
            }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'drive_id' }
        );

        // 연계된 모든 구글 드라이브 인증 사진 삭제
        for (const fileId of Array.from(proofsToDelete)) {
          await deleteDriveFileSafely(fileId);
        }
      }

      return NextResponse.json({
        success: true,
        message: '해당 문항의 모든 풀이 기록 및 인증샷이 완전히 삭제되었습니다.',
      });
    }

    // 3. 학생 복습함에서 특정 문항 완전히 삭제 (delete_review_item)
    if (action === 'delete_review_item') {
      if (!itemId) {
        return NextResponse.json({ success: false, error: 'itemId가 필요합니다.' }, { status: 400 });
      }

      const revRes = await supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', `student_review_${studentId}`)
        .maybeSingle();

      if (revRes.data?.file_data) {
        const reviewData = JSON.parse(revRes.data.file_data);
        const prevItems: any[] = reviewData.items || [];
        const nextItems = prevItems.filter((it: any) => it.id !== itemId && it.fileId !== itemId);

        // 남은 문항이 속한 폴더들만 유지 (문항이 0개면 폴더도 완전 비움)
        let nextFolders: any[] = reviewData.folders || [];
        if (nextItems.length === 0) {
          nextFolders = [];
        } else {
          const activeFolderIds = new Set(nextItems.map((i: any) => i.folderId).filter(Boolean));
          const activeFolderNames = new Set(nextItems.map((i: any) => i.folderName).filter(Boolean));
          nextFolders = nextFolders.filter((f: any) =>
            activeFolderIds.has(f.id) ||
            activeFolderNames.has(f.name) ||
            nextFolders.some((child: any) => child.parentId === f.id && activeFolderIds.has(child.id))
          );
        }

        await supabase.from('exam_library').upsert(
          {
            drive_id: `student_review_${studentId}`,
            name: `student_review_${studentId}.json`,
            type: 'file',
            grade: '공통',
            file_data: JSON.stringify({ folders: nextFolders, items: nextItems }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'drive_id' }
        );
      }

      return NextResponse.json({
        success: true,
        message: '문항이 학생의 복습함에서 삭제되었습니다.',
      });
    }

    // 4. 학생 복습함 전체 비우기 (clear_student_review)
    if (action === 'clear_student_review') {
      await supabase.from('exam_library').upsert(
        {
          drive_id: `student_review_${studentId}`,
          name: `student_review_${studentId}.json`,
          type: 'file',
          grade: '공통',
          file_data: JSON.stringify({ folders: [], items: [] }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'drive_id' }
      );

      return NextResponse.json({
        success: true,
        message: '학생의 복습함이 완전히 비워졌습니다.',
      });
    }

    return NextResponse.json(
      { success: false, error: '유효하지 않은 action입니다.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Review management deletion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '삭제 처리 중 오류 발생' },
      { status: 500 }
    );
  }
}
