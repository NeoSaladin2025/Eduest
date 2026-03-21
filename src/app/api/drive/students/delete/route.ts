import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis'; // 👈 구글 API 추가
import { NextResponse } from 'next/server';

// 1️⃣ Supabase 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2️⃣ 구글 인증 설정 (생성 로직과 동일하게 유지)
const getGoogleAuth = () => {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error('환경변수 KEY가 없습니다.');
  const credentials = JSON.parse(keyString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
};

export async function DELETE(req: Request) {
  try {
    const { studentId, folderId } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 🚀 STEP 1: 구글 드라이브 폴더 삭제 (직접 호출)
    if (folderId) {
      try {
        const auth = getGoogleAuth();
        const drive = google.drive({ version: 'v3', auth });
        
        // 폴더를 완전히 삭제하는 대신 '휴지통'으로 보냅니다 (안전을 위해)
        await drive.files.update({
          fileId: folderId,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        });
        
        console.log(`✅ 구글 드라이브 폴더(${folderId}) 휴지통 이동 완료`);
      } catch (driveErr: any) {
        // 드라이브 삭제 실패해도 DB는 지울 수 있게 에러만 기록
        console.error("❌ 드라이브 삭제 중 에러 발생 (무시하고 진행):", driveErr.message);
      }
    }

    // 🚀 STEP 2: Supabase DB에서 학생 삭제
    const { error: dbError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (dbError) {
      console.error('DB 삭제 에러:', dbError);
      throw new Error('데이터베이스 삭제에 실패했습니다.');
    }

    return NextResponse.json({ success: true, message: '학생 정보 및 드라이브 폴더 삭제 완료' });

  } catch (error: any) {
    console.error('🔥 Delete Route Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}