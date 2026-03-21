import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// 1️⃣ Supabase 클라이언트 초기화 (환경 변수 사용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2️⃣ 구글 드라이브 인증 설정
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// 3️⃣ 상수 설정 (본인의 ID로 확인 필수!)
const PARENT_FOLDER_ID = '19qVOvQECMVXVrZcnSFbEIHPrGqn1lt8v'; 
const INDEX_TEMPLATE_ID = '1WLA9uiWBneFMyAZuQ-Nj5secEGRDBddo';
const LIST_TEMPLATE_ID = '1SOUNPJUb4hSSoFYhYcU0DYMyDIoISl_9';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx47YS3s2V6-PWUURUxiLO1T--d3ZjLC8VxsTZJAy3abfvEaJcu-IGB9laGnGSDnxdNyg/exec';

export async function POST(req: Request) {
  try {
    const { name, grade } = await req.json();

    // 🚀 STEP 1: 구글 드라이브 학생 폴더 생성
    const folderRes = await drive.files.create({
      requestBody: {
        name: `[${grade}] ${name}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_FOLDER_ID],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const studentFolderId = folderRes.data.id!;

    // 🚀 STEP 2: Supabase DB에 학생 정보 저장
    // drive_folder_id 컬럼에 생성된 폴더 ID를 꼭 같이 저장해!
    const { data: newStudent, error: supabaseError } = await supabase
      .from('students')
      .insert([
        { 
          name: name, 
          grade: grade, 
          drive_folder_id: studentFolderId 
        }
      ])
      .select()
      .single();

    if (supabaseError) {
      console.error('Supabase 저장 에러:', supabaseError.message);
      throw new Error(`DB 저장 실패: ${supabaseError.message}`);
    }

    // 🚀 STEP 3: 앱 스크립트 대리인 호출 (파일 복사 - 백그라운드 작업)
    // fetch에 await를 붙이지 않고 백그라운드에서 처리하게 던져버림 (응답 속도 향상)
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, 
      body: JSON.stringify({
        action: 'setup_student',
        studentFolderId,
        indexTemplateId: INDEX_TEMPLATE_ID,
        listTemplateId: LIST_TEMPLATE_ID
      }),
      redirect: 'follow',
    }).catch(err => console.warn('⚠️ 앱 스크립트 작업 중 조용한 에러:', err.message));

    // 모든 과정 성공 시 Supabase에 저장된 데이터 반환
    return NextResponse.json({ success: true, student: newStudent });

  } catch (error: any) {
    console.error('🔥 학생 생성 통합 에러:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}