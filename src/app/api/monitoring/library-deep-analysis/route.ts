import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 웹 UI 전용: Supabase에 아카이빙된 AI 분석 결과만 순수하게 조회/열람하는 경량 엔드포인트
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderDriveId = searchParams.get('folderId');

    if (!folderDriveId) {
      return NextResponse.json({ success: false, error: 'folderId is required' }, { status: 400 });
    }

    const archiveKey = `library_analysis_archive_${folderDriveId}`;

    const { data: existingArchive, error } = await supabase
      .from('exam_library')
      .select('file_data, updated_at')
      .eq('drive_id', archiveKey)
      .maybeSingle();

    if (error) {
      console.error('Archive query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!existingArchive?.file_data) {
      return NextResponse.json({
        success: true,
        archive: null,
        message: '아직 MCP로 분석된 결과가 등록되지 않은 폴더입니다.',
      });
    }

    try {
      const parsed = JSON.parse(existingArchive.file_data);
      return NextResponse.json({
        success: true,
        archive: parsed,
        updatedAt: existingArchive.updated_at,
      });
    } catch {
      return NextResponse.json({ success: false, error: 'Failed to parse archive data' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('Deep analysis GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
