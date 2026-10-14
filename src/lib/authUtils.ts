import crypto from 'crypto';

/**
 * [에듀에스트 - 보안 인증 유틸리티]
 * Node.js 내장 crypto 모듈을 사용한 HMAC-SHA256 기반 암호화 세션 서명 토큰
 * - 외부 라이브러리 설치 불필요 (경량 & 안전)
 * - 변조 불가능한 서명(Signature) 검증
 */

// 세션 비밀키: 환경변수가 없으면 내부 강력한 기본 시크릿 사용
const AUTH_SECRET = process.env.SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eduest_super_secure_vault_signature_key_2026';

export interface AdminSessionPayload {
  adminName: string;
  role: 'SUPER_ADMIN' | 'TEACHER';
  createdAt: number;
  exp: number; // 만료 시각 (타임스탬프)
}

export interface StudentSessionPayload {
  studentId: string;
  createdAt: number;
  exp: number;
}

// Base64URL 인코딩/디코딩 헬퍼
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString();
}

// 1. 관리자 세션 토큰 생성 (기본 24시간 유효)
export function signAdminToken(adminName: string, role: 'SUPER_ADMIN' | 'TEACHER' = 'TEACHER'): string {
  const payload: AdminSessionPayload = {
    adminName,
    role,
    createdAt: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24시간
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

// 2. 관리자 세션 토큰 검증
export function verifyAdminToken(token?: string | null): AdminSessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;

  // 서명 검증 (Timing-Safe 비교)
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null; // 서명 불일치 (위조된 토큰)
  }

  try {
    const payload: AdminSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    // 만료 시간 검사
    if (Date.now() > payload.exp) {
      return null; // 만료됨
    }
    return payload;
  } catch (e) {
    return null;
  }
}

// 3. 학생 4자리 비밀번호 인증 세션 토큰 생성 (8시간 유효)
export function signStudentToken(studentId: string): string {
  const payload: StudentSessionPayload = {
    studentId,
    createdAt: Date.now(),
    exp: Date.now() + 8 * 60 * 60 * 1000, // 8시간
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

// 4. 학생 세션 토큰 검증
export function verifyStudentToken(token?: string | null, expectedStudentId?: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload: StudentSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (Date.now() > payload.exp) return false;
    if (expectedStudentId && payload.studentId !== expectedStudentId) return false;
    return true;
  } catch (e) {
    return false;
  }
}
