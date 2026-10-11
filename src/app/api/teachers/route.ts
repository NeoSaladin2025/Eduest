import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// 🛡️ 수퍼 관리자 식별 기준 (곽명용 원장님 절대 보호)
function isSuperAdmin(manager: { login_id?: string; name?: string }) {
  return (
    manager.login_id?.trim().toLowerCase() === 'master_kwak' ||
    manager.name?.trim() === '곽명용'
  );
}

// 1. GET: 선생님 목록 전체 조회
export async function GET() {
  try {
    const { data: managers, error } = await supabase
      .from('managers')
      .select('id, login_id, name, password, role, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Teachers GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 곽명용 원장님 계정은 role을 항상 SUPER_ADMIN으로 보장
    const formatted = (managers || []).map(m => ({
      ...m,
      role: isSuperAdmin(m) ? 'SUPER_ADMIN' : (m.role || 'TEACHER'),
      is_protected: isSuperAdmin(m),
    }));

    return NextResponse.json({ teachers: formatted });
  } catch (error: any) {
    console.error('Teachers GET server error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: 신규 선생님 등록 (한글 ID 및 자유 자릿수 비밀번호 허용)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, login_id, password, role = 'TEACHER' } = body;

    const trimmedName = (name || '').trim();
    const trimmedLoginId = (login_id || '').trim();
    const trimmedPassword = (password || '').trim();

    if (!trimmedName) {
      return NextResponse.json({ error: '선생님 성함을 입력해 주세요.' }, { status: 400 });
    }
    if (!trimmedLoginId) {
      return NextResponse.json({ error: '계정 ID를 입력해 주세요 (한글/영문 모두 가능).' }, { status: 400 });
    }
    if (!trimmedPassword) {
      return NextResponse.json({ error: '비밀번호를 입력해 주세요 (자릿수 제한 없음).' }, { status: 400 });
    }

    // 아이디 중복 검사 (대소문자 무시 및 공백 정규화)
    const { data: existingLoginId } = await supabase
      .from('managers')
      .select('id, login_id')
      .eq('login_id', trimmedLoginId)
      .maybeSingle();

    if (existingLoginId) {
      return NextResponse.json(
        { error: `이미 등록된 계정 ID('${trimmedLoginId}')입니다. 다른 ID를 입력해 주세요.` },
        { status: 409 }
      );
    }

    // 신규 등록
    const { data: newTeacher, error: insertError } = await supabase
      .from('managers')
      .insert({
        name: trimmedName,
        login_id: trimmedLoginId,
        password: trimmedPassword,
        role: role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'TEACHER',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Teacher insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      teacher: {
        ...newTeacher,
        is_protected: false,
      } 
    });
  } catch (error: any) {
    console.error('Teacher POST server error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. PUT: 선생님 정보 수정 (성함, ID, 비밀번호 등)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, login_id, password, role } = body;

    if (!id) {
      return NextResponse.json({ error: '수정할 선생님 ID가 필요합니다.' }, { status: 400 });
    }

    // 기존 데이터 확인
    const { data: currentTeacher, error: findError } = await supabase
      .from('managers')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !currentTeacher) {
      return NextResponse.json({ error: '대상 선생님 계정을 찾을 수 없습니다.' }, { status: 404 });
    }

    const trimmedName = (name || '').trim();
    const trimmedLoginId = (login_id || '').trim();
    const trimmedPassword = (password || '').trim();

    // 🛡️ 수퍼 관리자 보호: 수퍼 관리자는 login_id 변경 방지
    if (isSuperAdmin(currentTeacher)) {
      if (trimmedLoginId && trimmedLoginId !== currentTeacher.login_id) {
        return NextResponse.json({ error: '최고 관리자의 고유 계정 ID는 변경할 수 없습니다.' }, { status: 403 });
      }
    }

    // ID 중복 검사 (다른 선생님이 이미 사용 중인지)
    if (trimmedLoginId && trimmedLoginId !== currentTeacher.login_id) {
      const { data: dupCheck } = await supabase
        .from('managers')
        .select('id')
        .eq('login_id', trimmedLoginId)
        .neq('id', id)
        .maybeSingle();

      if (dupCheck) {
        return NextResponse.json({ error: `이미 사용 중인 계정 ID('${trimmedLoginId}')입니다.` }, { status: 409 });
      }
    }

    const updatePayload: Record<string, any> = {};
    if (trimmedName) updatePayload.name = trimmedName;
    if (trimmedLoginId) updatePayload.login_id = trimmedLoginId;
    if (trimmedPassword) updatePayload.password = trimmedPassword;
    if (role && !isSuperAdmin(currentTeacher)) {
      updatePayload.role = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'TEACHER';
    }

    const { data: updated, error: updateError } = await supabase
      .from('managers')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Teacher update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      teacher: {
        ...updated,
        is_protected: isSuperAdmin(updated),
      } 
    });
  } catch (error: any) {
    console.error('Teacher PUT server error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 4. DELETE: 선생님 계정 삭제 (수퍼 관리자 삭제 절대 금지!)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '삭제할 계정 ID가 누락되었습니다.' }, { status: 400 });
    }

    // 대상 확인
    const { data: targetTeacher, error: findError } = await supabase
      .from('managers')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !targetTeacher) {
      return NextResponse.json({ error: '삭제할 대상을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 🛡️ 무적 가드: 최고 관리자 계정 삭제 시도 시 즉시 차단
    if (isSuperAdmin(targetTeacher)) {
      return NextResponse.json(
        { error: '최고 관리자(곽명용 원장님) 계정은 시스템 보호 대상이므로 삭제할 수 없습니다!' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from('managers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Teacher delete error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `'${targetTeacher.name}' 선생님 계정이 성공적으로 삭제되었습니다.` 
    });
  } catch (error: any) {
    console.error('Teacher DELETE server error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
