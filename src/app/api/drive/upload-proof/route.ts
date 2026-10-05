import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// 1. Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2. 선생님 구글 계정 권한으로 실행되는 Google Apps Script WebApp URL (Quota 0 에러 우회 및 개인 드라이브 직접 저장)
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzfsRGa1EuoDaHjiYKCslabSsE4j3sHRsv7b0T-23wDuZqTGw_VrDlIXXfEB-zwyUKh1A/exec';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studentId = formData.get('studentId') as string | null;
    const examId = (formData.get('examId') as string) || 'special_exam';
    const examTitle = (formData.get('examTitle') as string) || '스페셜테스트';
    const questionNumber = (formData.get('questionNumber') as string) || '1';
    const questionId = (formData.get('questionId') as string) || '';

    const studentFolderId = formData.get('studentFolderId') as string | null;
    const studentNameParam = formData.get('studentName') as string | null;

    if (!file || !studentId) {
      return NextResponse.json(
        { success: false, error: '파일과 studentId는 필수입니다.' },
        { status: 400 }
      );
    }

    let targetFolderId = studentFolderId;
    let studentName = studentNameParam || '';

    // 학생 정보 조회 (formData에 폴더 ID가 없거나 학생명이 없는 경우에만 DB 조회 fallback)
    if (!targetFolderId || !studentName) {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, name, grade, drive_folder_id')
        .eq('id', studentId)
        .single();

      if (studentErr || !student) {
        return NextResponse.json(
          { success: false, error: '학생 정보를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      targetFolderId = targetFolderId || student.drive_folder_id;
      studentName = studentName || student.name;
    }

    if (!targetFolderId) {
      return NextResponse.json(
        { success: false, error: '해당 학생의 구글 드라이브 폴더가 존재하지 않습니다.' },
        { status: 400 }
      );
    }

    // 파일 버퍼 및 Base64 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64String = buffer.toString('base64');

    // 구글 드라이브 파일명 생성 (예: [스페셜풀이] 1번_공수2A모의평가_김미경_1720000000.jpg)
    const sanitizedTitle = examTitle.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const extension = file.type.includes('png') ? 'png' : 'jpg';
    const fileName = `[스페셜풀이] ${questionNumber}번_${sanitizedTitle}_${studentName}_${Date.now()}.${extension}`;

    // 🔥 서비스 계정의 0바이트 Quota 제약을 우회하기 위해
    // 선생님 본인 계정 권한으로 동작하는 GAS WebApp을 호출하여 학생 폴더에 파일 생성
    const gasResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'upload_and_record',
        studentFolderId: targetFolderId,
        imageData: base64String,
        fileName: fileName,
      }),
      redirect: 'follow',
    });

    if (!gasResponse.ok) {
      const errorText = await gasResponse.text();
      throw new Error(`Google Apps Script 서버 응답 오류: ${errorText}`);
    }

    const gasResult = await gasResponse.json();

    if (!gasResult.success || !gasResult.fileId) {
      throw new Error(
        `구글 드라이브 저장 실패: ${gasResult.error || '알 수 없는 오류'}`
      );
    }

    const fileId = gasResult.fileId;

    // 우리 프록시를 통해 브라우저 img 태그에서 바로 렌더링될 수 있는 고속 이미지 스트림 URL
    const proxyUrl = `/api/drive/library/file?fileId=${fileId}&type=image&raw=true`;

    return NextResponse.json({
      success: true,
      fileId,
      fileName,
      url: proxyUrl,
      questionId,
      questionNumber,
    });
  } catch (error: any) {
    console.error('Upload proof image error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '인증샷 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
