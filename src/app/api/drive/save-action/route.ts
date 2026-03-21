import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1️⃣ Supabase 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 🔥 [최종 업데이트] 고속 일괄 로딩 기능이 탑재된 최신 Apps Script 배포 주소 적용!
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfsRGa1EuoDaHjiYKCslabSsE4j3sHRsv7b0T-23wDuZqTGw_VrDlIXXfEB-zwyUKh1A/exec';

export async function POST(req: Request) {
  try {
    // 프론트엔드(SaveButton)에서 보내주는 필드들 수신
    const { 
      studentId, 
      imageData, 
      fileName, 
      problemUrl, 
      solutionUrl, 
      cartridgeName 
    } = await req.json();

    if (!studentId || !imageData) {
      return NextResponse.json({ error: '데이터가 부족합니다.' }, { status: 400 });
    }

    // 2️⃣ Supabase에서 해당 학생의 구글 드라이브 폴더 ID 가져오기
    const { data: student, error: dbError } = await supabase
      .from('students')
      .select('drive_folder_id, name')
      .eq('id', studentId)
      .single();

    if (dbError || !student?.drive_folder_id) {
      console.error('❌ DB 조회 에러:', dbError);
      throw new Error('학생의 드라이브 폴더 정보를 찾을 수 없습니다.');
    }

    const folderId = student.drive_folder_id;

    // 3️⃣ 🔥 [파일명 규칙 적용] [카트리지명] 원래파일명 형태로 변환
    // 이 규칙이 있어야 학생 페이지(Review Mode)에서 자동으로 팩을 분류해!
    const finalCartridge = cartridgeName || "미분류";
    const baseFileName = fileName || `${student.name}_${new Date().getTime()}.png`;
    const formattedFileName = `[${finalCartridge}] ${baseFileName}`;
    
    // Base64 데이터 처리 (이미지 헤더가 포함된 경우 제거)
    const pureBase64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;

    // 앱스크립트 호출
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, 
      body: JSON.stringify({
        action: 'upload_and_record', 
        studentFolderId: folderId,
        imageData: pureBase64,
        fileName: formattedFileName, // 🔥 카트리지 이름표가 붙은 파일명 전송
        problemUrl: problemUrl || "",
        solutionUrl: solutionUrl || ""
      }),
      redirect: 'follow', // 구글 드라이브 리다이렉트 대응
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apps Script 서버 응답 오류: ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Apps Script 저장 실패: ${result.error || '알 수 없는 오류'}`);
    }

    // 4️⃣ 최종 성공 응답 반환
    return NextResponse.json({ 
      success: true, 
      message: `${student.name} 학생의 [${finalCartridge}] 카트리지에 저장이 완료되었습니다! 🚀`,
      fileId: result.fileId 
    });

  } catch (error: any) {
    console.error('🔥 SaveAction Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}