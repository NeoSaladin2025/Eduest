import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// 1. Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2. 구글 드라이브 인증 초기화
let driveClient: any = null;
function getDrive() {
  if (driveClient) return driveClient;
  const credsKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsKey) return null;
  try {
    const credentials = JSON.parse(credsKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
  } catch (e) {
    console.error('Google Auth init failed in grade API:', e);
    return null;
  }
}

// 학년 승급 계산 헬퍼 (접미사 유지 지원: 예 '고1-A' -> '고2-A')
const PROMOTE_MAP: Record<string, string> = {
  '중1': '중2',
  '중2': '중3',
  '중3': '고1',
  '고1': '고2',
  '고2': '고3',
};

function getPromotedGrade(currentGrade: string, high3Action: 'graduated' | 'keep' = 'keep'): string | null {
  const trimmed = (currentGrade || '').trim();
  const match = trimmed.match(/^(중1|중2|중3|고1|고2|고3)(.*)$/);
  if (!match) return null; // 승급 대상 아님

  const base = match[1];
  const suffix = match[2] || '';

  if (base === '고3') {
    if (high3Action === 'graduated') return `졸업${suffix}`;
    return `고3${suffix}`; // 유지
  }

  const nextBase = PROMOTE_MAP[base];
  if (!nextBase) return null;
  return `${nextBase}${suffix}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      action,
      studentIds,
      targetGrade,
      high3Action = 'keep',
      resetUnlockedFolders = false,
      renameDriveFolder = true,
    } = body;

    const drive = getDrive();

    // ----------------------------------------------------
    // 모드 1: 선택한 학생들의 학년 일괄 지정 변경 (target_update)
    // ----------------------------------------------------
    if (action === 'target_update') {
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return NextResponse.json({ error: '변경할 학생 ID 목록이 필요합니다.' }, { status: 400 });
      }
      if (!targetGrade || typeof targetGrade !== 'string') {
        return NextResponse.json({ error: '목표 학년을 지정해주세요.' }, { status: 400 });
      }

      const trimmedTarget = targetGrade.trim();

      // 대상 학생 정보 조회
      const { data: students, error: fetchErr } = await supabase
        .from('students')
        .select('id, name, grade, drive_folder_id')
        .in('id', studentIds);

      if (fetchErr) throw fetchErr;
      if (!students || students.length === 0) {
        return NextResponse.json({ error: '해당 학생들을 찾을 수 없습니다.' }, { status: 404 });
      }

      // Supabase 업데이트 객체 구성
      const updatePayload: any = {
        grade: trimmedTarget,
        updated_at: new Date().toISOString(),
      };
      if (resetUnlockedFolders) {
        updatePayload.unlocked_folders = [];
      }

      const { error: updateErr } = await supabase
        .from('students')
        .update(updatePayload)
        .in('id', studentIds);

      if (updateErr) throw updateErr;

      // 구글 드라이브 폴더명 동기화 (백그라운드 병렬 처리)
      if (renameDriveFolder && drive) {
        await Promise.allSettled(
          students.map(async (st) => {
            if (!st.drive_folder_id) return;
            try {
              await drive.files.update({
                fileId: st.drive_folder_id,
                requestBody: { name: `[${trimmedTarget}] ${st.name}` },
                supportsAllDrives: true,
              });
            } catch (dErr: any) {
              console.warn(`Drive folder rename failed for ${st.name}:`, dErr.message);
            }
          })
        );
      }

      return NextResponse.json({
        success: true,
        updatedCount: students.length,
        message: `${students.length}명의 학년이 '${trimmedTarget}'(으)로 변경되었습니다.`,
      });
    }

    // ----------------------------------------------------
    // 모드 2: 전체 1학년 진급 (promote_all)
    // ----------------------------------------------------
    if (action === 'promote_all') {
      // 모든 학생 정보 조회
      const { data: allStudents, error: fetchAllErr } = await supabase
        .from('students')
        .select('id, name, grade, drive_folder_id');

      if (fetchAllErr) throw fetchAllErr;
      if (!allStudents || allStudents.length === 0) {
        return NextResponse.json({ error: '등록된 학생이 없습니다.' }, { status: 404 });
      }

      // 진급 대상 학생들 선별 및 신규 학년 계산
      const promotionList: Array<{
        id: string;
        name: string;
        prevGrade: string;
        nextGrade: string;
        drive_folder_id?: string;
      }> = [];

      for (const st of allStudents) {
        const nextGrade = getPromotedGrade(st.grade, high3Action);
        if (nextGrade && nextGrade !== st.grade) {
          promotionList.push({
            id: st.id,
            name: st.name,
            prevGrade: st.grade,
            nextGrade,
            drive_folder_id: st.drive_folder_id,
          });
        }
      }

      if (promotionList.length === 0) {
        return NextResponse.json({
          success: true,
          updatedCount: 0,
          message: '진급 대상인 학생이 없습니다.',
        });
      }

      // 각 학생별로 DB 업데이트 및 드라이브 폴더명 변경
      await Promise.all(
        promotionList.map(async (item) => {
          const updateObj: any = {
            grade: item.nextGrade,
            updated_at: new Date().toISOString(),
          };
          if (resetUnlockedFolders) {
            updateObj.unlocked_folders = [];
          }

          const { error } = await supabase
            .from('students')
            .update(updateObj)
            .eq('id', item.id);

          if (error) {
            console.error(`DB update failed for student ${item.name}:`, error.message);
          }

          if (renameDriveFolder && drive && item.drive_folder_id) {
            try {
              await drive.files.update({
                fileId: item.drive_folder_id,
                requestBody: { name: `[${item.nextGrade}] ${item.name}` },
                supportsAllDrives: true,
              });
            } catch (dErr: any) {
              console.warn(`Drive folder rename failed for ${item.name}:`, dErr.message);
            }
          }
        })
      );

      return NextResponse.json({
        success: true,
        updatedCount: promotionList.length,
        promotedList: promotionList,
        message: `총 ${promotionList.length}명의 학생이 1학년씩 진급 완료되었습니다.`,
      });
    }

    return NextResponse.json({ error: '올바른 action(target_update 또는 promote_all)을 지정해주세요.' }, { status: 400 });
  } catch (error: any) {
    console.error('Grade update API error:', error);
    return NextResponse.json({ error: error.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
