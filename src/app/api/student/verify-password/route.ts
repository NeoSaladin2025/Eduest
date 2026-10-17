import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { signStudentToken, comparePassword } from '@/lib/authUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 🛡️ 학생 4자리 PIN 무차별 대입 공격(Brute Force) 방어 메모리 저장소
// (IP / 학생ID 당 5회 연속 실패 시 5분간 입력 잠금)
const studentAttemptMap = new Map<string, { attempts: number; blockedUntil: number }>();

function checkStudentRateLimit(key: string): { blocked: boolean; remainingSec: number } {
  const record = studentAttemptMap.get(key);
  if (!record) return { blocked: false, remainingSec: 0 };

  if (record.blockedUntil > Date.now()) {
    const remainingSec = Math.ceil((record.blockedUntil - Date.now()) / 1000);
    return { blocked: true, remainingSec };
  }

  if (record.blockedUntil > 0 && record.blockedUntil <= Date.now()) {
    studentAttemptMap.delete(key);
  }

  return { blocked: false, remainingSec: 0 };
}

function recordStudentFailure(key: string) {
  const record = studentAttemptMap.get(key) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.blockedUntil = Date.now() + 5 * 60 * 1000; // 5분 잠금
  }
  studentAttemptMap.set(key, record);
}

function clearStudentFailure(key: string) {
  studentAttemptMap.delete(key);
}

// 1. GET: 학생의 비밀번호 설정 여부만 안전하게 확인 (비밀번호 내용은 일절 반환하지 않음)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json({ error: 'studentId가 필요합니다.' }, { status: 400 });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('id, password')
      .eq('id', studentId.trim())
      .maybeSingle();

    if (error || !student) {
      return NextResponse.json({ hasPassword: false }, { status: 404 });
    }

    // 🔒 비밀번호가 있는지 여부(Boolean)만 반환하고, 비밀번호 텍스트는 전송하지 않음!
    return NextResponse.json({
      hasPassword: !!student.password && student.password.trim().length > 0,
    });
  } catch (error: any) {
    console.error('Check student password status error:', error);
    return NextResponse.json({ hasPassword: false }, { status: 500 });
  }
}

// 2. POST: 4자리 비밀번호 검증 (Bcrypt 비교 & 점진적 자동 해싱)
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown_ip';
    const { studentId, password } = await req.json();

    const trimmedId = (studentId || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // Brute-force 방어 검사
    const rateKey = `student_${clientIp}_${trimmedId}`;
    const rateLimit = checkStudentRateLimit(rateKey);
    if (rateLimit.blocked) {
      return NextResponse.json(
        { error: `⚠️ 비밀번호 입력 5회 실패로 인해 ${rateLimit.remainingSec}초 동안 잠겼습니다.` },
        { status: 429 }
      );
    }

    // 1. students 테이블에서 학생 조회 (서버 측에서 안전하게 대조)
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, password')
      .eq('id', trimmedId)
      .maybeSingle();

    if (error || !student) {
      return NextResponse.json({ error: '해당 학생 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비밀번호가 설정되어 있지 않은 학생은 무조건 통과
    if (!student.password || student.password.trim().length === 0) {
      const token = signStudentToken(trimmedId);
      const res = NextResponse.json({ success: true, verified: true });
      res.cookies.set(`student_session_${trimmedId}`, token, {
        path: `/student/${trimmedId}`,
        maxAge: 28800, // 8시간
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return res;
    }

    // 비밀번호 대조 (Bcrypt 해시 또는 기존 평문 점진적 호환)
    const isPwValid = await comparePassword(trimmedPw, student.password);

    if (!isPwValid) {
      recordStudentFailure(rateKey);
      return NextResponse.json(
        { success: false, error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 성공 시 실패 카운트 초기화
    clearStudentFailure(rateKey);

    // 2. 인증 성공: 암호화된 학생 세션 서명 토큰 발급
    const token = signStudentToken(trimmedId);

    const response = NextResponse.json({
      success: true,
      verified: true,
    });

    response.cookies.set(`student_session_${trimmedId}`, token, {
      path: `/student/${trimmedId}`,
      maxAge: 28800, // 8시간
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Verify student password error:', error);
    return NextResponse.json({ error: '비밀번호 검증 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
