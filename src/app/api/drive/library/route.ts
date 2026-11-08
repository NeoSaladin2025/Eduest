import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 1️⃣ 학년별 라이브러리 목록 불러오기
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get('grade');

  if (!grade) {
    return NextResponse.json({ error: 'Grade is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('*')
      .eq('grade', grade)
      .eq('type', 'folder');

    if (error) throw error;

    const items = data || [];
    // 🌟 쌍둥이 폴더 및 그 모든 하위 폴더(자식/손자 등) 재귀적 배제
    const twinIds = new Set<string>();
    items.forEach((item: any) => {
      if (item.name && item.name.includes('쌍둥이')) {
        twinIds.add(item.drive_id);
      }
    });

    let added = true;
    while (added) {
      added = false;
      items.forEach((item: any) => {
        if (item.parent_id && twinIds.has(item.parent_id) && !twinIds.has(item.drive_id)) {
          twinIds.add(item.drive_id);
          added = true;
        }
      });
    }

    const filteredItems = items.filter((item: any) => !twinIds.has(item.drive_id));

    return NextResponse.json({ items: filteredItems });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2️⃣ 학생의 개별 또는 다중 일괄 회차 권한(배열) 저장하기 (단일 studentId & 다중 studentIds, ADD / OVERWRITE 모드 지원)
export async function PATCH(request: Request) {
  try {
    // 🛡️ 관리자 권한 확인 (외부 무단 호출 차단)
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session_token')?.value;
    const session = verifyAdminToken(token);
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다. (로그인 필요)' }, { status: 401 });
    }

    const body = await request.json();
    const { studentId, studentIds, unlockedFolders, mode = 'ADD' } = body;

    const targetStudentIds: string[] = Array.isArray(studentIds)
      ? studentIds.filter(Boolean)
      : (studentId ? [studentId] : []);

    if (targetStudentIds.length === 0 || !Array.isArray(unlockedFolders)) {
      return NextResponse.json({ error: 'Invalid parameters: studentIds and unlockedFolders are required' }, { status: 400 });
    }

    // [단일 학생 + OVERWRITE] 기본 레거시 케이스 빠른 처리
    if (targetStudentIds.length === 1 && mode === 'OVERWRITE') {
      const { data, error } = await supabase
        .from('students')
        .update({ unlocked_folders: unlockedFolders })
        .eq('id', targetStudentIds[0])
        .select('id, unlocked_folders');

      if (error) throw error;
      return NextResponse.json({ success: true, data, updatedCount: 1 });
    }

    // [다중 학생 OVERWRITE 모드: 선택된 폴더 목록으로 일괄 덮어쓰기]
    if (mode === 'OVERWRITE') {
      const { data, error } = await supabase
        .from('students')
        .update({ unlocked_folders: unlockedFolders })
        .in('id', targetStudentIds)
        .select('id, unlocked_folders');

      if (error) throw error;
      return NextResponse.json({ success: true, data, updatedCount: data?.length || 0 });
    }

    // [기본 모드: ADD 모드 - 기존 권한에 선택된 폴더 합집합(Union) 추가]
    const { data: existingStudents, error: fetchErr } = await supabase
      .from('students')
      .select('id, unlocked_folders')
      .in('id', targetStudentIds);

    if (fetchErr) throw fetchErr;

    const updatePromises = (existingStudents || []).map(async (student: any) => {
      const currentList: string[] = Array.isArray(student.unlocked_folders) ? student.unlocked_folders : [];
      const mergedSet = new Set<string>([...currentList, ...unlockedFolders]);
      const mergedList = Array.from(mergedSet);

      return supabase
        .from('students')
        .update({ unlocked_folders: mergedList })
        .eq('id', student.id)
        .select('id, unlocked_folders');
    });

    const results = await Promise.all(updatePromises);
    const updatedStudents = results.map(r => r.data?.[0]).filter(Boolean);

    return NextResponse.json({
      success: true,
      updatedCount: updatedStudents.length,
      data: updatedStudents
    });
  } catch (error: any) {
    console.error('Permission Update Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
