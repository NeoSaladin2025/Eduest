import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';

// 1. Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2. 구글 드라이브 인증
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
    console.error('Google Auth init failed in upload-proof:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studentId = formData.get('studentId') as string | null;
    const examId = (formData.get('examId') as string) || 'special_exam';
    const examTitle = (formData.get('examTitle') as string) || '스페셜테스트';
    const questionNumber = (formData.get('questionNumber') as string) || '1';
    const questionId = (formData.get('questionId') as string) || '';

    if (!file || !studentId) {
      return NextResponse.json(
        { success: false, error: '파일과 studentId는 필수입니다.' },
        { status: 400 }
      );
    }

    const drive = getDrive();
    if (!drive) {
      return NextResponse.json(
        { success: false, error: '구글 드라이브 서비스 계정 인증에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 학생 정보 조회 (drive_folder_id 확인)
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

    let targetFolderId = student.drive_folder_id;
    if (!targetFolderId) {
      return NextResponse.json(
        { success: false, error: '해당 학생의 구글 드라이브 폴더가 존재하지 않습니다.' },
        { status: 400 }
      );
    }

    // 파일 버퍼 및 스트림 생성
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // 구글 드라이브 파일명 생성 (예: [스페셜풀이] 1번_공수2A모의평가_김미경_1720000000.jpg)
    const sanitizedTitle = examTitle.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const extension = file.type.includes('png') ? 'png' : 'jpg';
    const fileName = `[스페셜풀이] ${questionNumber}번_${sanitizedTitle}_${student.name}_${Date.now()}.${extension}`;

    // 구글 드라이브 해당 학생 폴더에 업로드
    const driveRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [targetFolderId],
        mimeType: file.type || 'image/jpeg',
      },
      media: {
        mimeType: file.type || 'image/jpeg',
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    const fileId = driveRes.data.id;
    if (!fileId) {
      throw new Error('드라이브 파일 생성에 실패했습니다.');
    }

    // 우리 프록시를 통과하여 인증 없이 바로 브라우저에서 볼 수 있는 뷰어 URL 생성
    const proxyUrl = `/api/drive/library/file?fileId=${fileId}&type=image`;

    return NextResponse.json({
      success: true,
      fileId,
      fileName,
      url: proxyUrl,
      webViewLink: driveRes.data.webViewLink,
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
