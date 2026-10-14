import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { signAdminToken, comparePassword, hashPassword, isBcryptHash } from '@/lib/authUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 🛡️ 무차별 대입 공격(Brute Force) 방어용 메모리 저장소
// (IP / ID 당 5회 연속 실패 시 5분간 로그인 시도 차단)
const loginAttemptMap = new Map<string, { attempts: number; blockedUntil: number }>();

function checkRateLimit(key: string): { blocked: boolean; remainingSec: number } {
  const record = loginAttemptMap.get(key);
  if (!record) return { blocked: false, remainingSec: 0 };

  if (record.blockedUntil > Date.now()) {
    const remainingSec = Math.ceil((record.blockedUntil - Date.now()) / 1000);
    return { blocked: true, remainingSec };
  }

  // 차단 시간 지남 -> 초기화
  if (record.blockedUntil > 0 && record.blockedUntil <= Date.now()) {
    loginAttemptMap.delete(key);
  }

  return { blocked: false, remainingSec: 0 };
}

function recordLoginFailure(key: string) {
  const record = loginAttemptMap.get(key) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.blockedUntil = Date.now() + 5 * 60 * 1000; // 5분 차단
  }
  loginAttemptMap.set(key, record);
}

function clearLoginFailure(key: string) {
  loginAttemptMap.delete(key);
}

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown_ip';
    const { identifier, password } = await req.json();

    const trimmedId = (identifier || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId || !trimmedPw) {
      return NextResponse.json({ error: '아이디/성함과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const rateKey = `${clientIp}_${trimmedId}`;
    const rateLimit = checkRateLimit(rateKey);
    if (rateLimit.blocked) {
      return NextResponse.json(
        { error: `⚠️ 연속된 로그인 실패로 인해 ${rateLimit.remainingSec}초 동안 로그인이 차단되었습니다.` },
        { status: 429 }
      );
    }

    // 1. managers 테이블에서 성함(name) 또는 login_id로 대상 계정 조회
    const { data: manager, error } = await supabase
      .from('managers')
      .select('id, name, login_id, password, role')
      .or(`name.eq.${trimmedId},login_id.eq.${trimmedId}`)
      .maybeSingle();

    if (error || !manager) {
      recordLoginFailure(rateKey);
      return NextResponse.json(
        { error: '등록된 성함/아이디 또는 비밀번호가 일치하지 않습니다! 😢' },
        { status: 401 }
      );
    }

    // 2. 비밀번호 대조 (Bcrypt 해시 또는 기존 평문 점진적 호환)
    const isPasswordValid = await comparePassword(trimmedPw, manager.password);
    if (!isPasswordValid) {
      recordLoginFailure(rateKey);
      return NextResponse.json(
        { error: '등록된 성함/아이디 또는 비밀번호가 일치하지 않습니다! 😢' },
        { status: 401 }
      );
    }

    // 로그인 성공 -> 실패 카운트 초기화
    clearLoginFailure(rateKey);

    // 🌟 [자동 보안 업그레이드]: 아직 평문인 비밀번호는 로그인 성공 즉시 Bcrypt 해시로 자동 치환 저장!
    if (!isBcryptHash(manager.password)) {
      try {
        const secureHash = await hashPassword(trimmedPw);
        await supabase
          .from('managers')
          .update({ password: secureHash })
          .eq('id', manager.id);
        console.log(`🔒 [보안 업그레이드] '${manager.name}' 선생님 계정이 Bcrypt 해시로 자동 암호화되었습니다.`);
      } catch (hashErr) {
        console.error('Auto hash upgrade error:', hashErr);
      }
    }

    // 3. 역할 판정 (DB의 role 기준 + 초기 마스터 계정 DB 역할 마이그레이션)
    let isSuperAdmin = manager.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && (manager.login_id === 'master_kwak' || manager.name === '곽명용')) {
      isSuperAdmin = true;
      try {
        await supabase.from('managers').update({ role: 'SUPER_ADMIN' }).eq('id', manager.id);
      } catch (e) {
        console.error('Role update error:', e);
      }
    }
    const role: 'SUPER_ADMIN' | 'TEACHER' = isSuperAdmin ? 'SUPER_ADMIN' : 'TEACHER';

    // 4. 불변 UUID와 확정된 role을 기반으로 디지털 서명 토큰 발급
    const token = signAdminToken(manager.id, manager.name, role);

    const response = NextResponse.json({
      success: true,
      adminName: manager.name,
      managerId: manager.id,
      role,
    });

    // 5. 서명된 보안 쿠키 설정 (HttpOnly & Secure)
    response.cookies.set('admin_session_token', token, {
      path: '/',
      maxAge: 86400, // 24시간
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    // 기존 프론트엔드 호환용 currentAdminName 쿠키 (표시용)
    response.cookies.set('currentAdminName', manager.name, {
      path: '/',
      maxAge: 86400,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Teacher login API error:', error);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
