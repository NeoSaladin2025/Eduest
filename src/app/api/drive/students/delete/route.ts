import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Supabase 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function DELETE(req: Request) {
  try {
    const { studentId, folderId } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. Apps Script 호출 (구글 드라이브 폴더 삭제)
    if (folderId) {
      const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwrYYJiG4SjwAWOMyYq9P3sUL2XwcNXq88IE-NZrbdJab94r7qNY9JWtYmLHlFpd2Y/exec';
      
      try {
        const driveRes = await fetch(APPS_SCRIPT_URL, {
          method: 'POST', // Apps Script는 무조건 POST만 받음
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'delete_student',
            studentFolderId: folderId
          }),
          redirect: 'follow'
        });
        
        const driveResult = await driveRes.json();
        if (!driveResult.success) {
          console.warn("드라이브 폴더 삭제 실패:", driveResult.error);
        }
      } catch (e) {
        console.error("Apps Script 통신 에러 (무시하고 DB삭제 진행):", e);
      }
    }

    // 2. Supabase DB에서 학생 삭제
    const { error: dbError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (dbError) {
      console.error('DB 삭제 에러:', dbError);
      throw new Error('데이터베이스 삭제에 실패했습니다.');
    }

    return NextResponse.json({ success: true, message: '삭제 완료' });

  } catch (error: any) {
    console.error('🔥 Delete Route Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}