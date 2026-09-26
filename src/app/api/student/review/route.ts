import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getDriveId = (studentId: string) => `student_review_${studentId}`;

// GET: 학생의 복습 폴더 및 선택 파일 데이터 조회
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json({ error: 'studentId가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', getDriveId(studentId))
      .maybeSingle();

    if (error || !data || !data.file_data) {
      return NextResponse.json({ 
        reviewData: { folders: [], items: [] } 
      });
    }

    const parsed = JSON.parse(data.file_data);
    return NextResponse.json({ 
      reviewData: parsed || { folders: [], items: [] } 
    });
  } catch (error: any) {
    console.error('Student review GET error:', error);
    return NextResponse.json({ reviewData: { folders: [], items: [] } });
  }
}

// POST: 학생의 복습 폴더 및 선택 파일 데이터 저장
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { studentId, reviewData } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId가 필요합니다.' }, { status: 400 });
    }

    const jsonString = JSON.stringify(reviewData || { folders: [], items: [] });

    const { error } = await supabase
      .from('exam_library')
      .upsert({
        drive_id: getDriveId(studentId),
        name: `student_review_${studentId}.json`,
        type: 'file',
        grade: '공통',
        file_data: jsonString,
        updated_at: new Date().toISOString()
      }, { onConflict: 'drive_id' });

    if (error) {
      console.error('Student review save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Student review POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
