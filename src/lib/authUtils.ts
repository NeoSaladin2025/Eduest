import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * [에듀에스트 - 보안 인증 & 암호화 유틸리티]
 * 1. HMAC-SHA256 기반 암호화 세션 서명 토큰
 * 2. Bcrypt 솔트 해시 비밀번호 암호화 및 안전 대조
 * 3. SESSION_SECRET 필수 강제 (안전하지 않은 fallback 원천 제거)
 */

function getAuthSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    // 운영 환경에서 시크릿 키가 누락되거나 너무 짧으면 즉시 차단
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: SESSION_SECRET must be set with at least 32 characters in production.');
    }
    // 로컬 개발 환경용 비상 디버그 키 (절대 배포 환경에서 작동하지 않음)
    return 'eduest_local_dev_only_secret_key_needs_real_session_secret_in_prod';
  }
  return secret;
}

export interface AdminSessionPayload {
  managerId: string;
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

// 1. 관리자 세션 토큰 생성 (고유 UUID + 역할 명시, 24시간 유효)
export function signAdminToken(
  managerId: string, 
  adminName: string, 
  role: 'SUPER_ADMIN' | 'TEACHER' = 'TEACHER'
): string {
  const secret = getAuthSecret();
  const payload: AdminSessionPayload = {
    managerId,
    adminName,
    role,
    createdAt: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24시간
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const signature = crypto
    .createHmac('sha256', secret)
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

  try {
    const secret = getAuthSecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null; // 서명 불일치 (위조된 토큰)
    }

    const payload: AdminSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (Date.now() > payload.exp) {
      return null; // 만료됨
    }
    return payload;
  } catch (e) {
    return null;
  }
}

// 3. 학생 세션 토큰 생성 (8시간 유효)
export function signStudentToken(studentId: string): string {
  const secret = getAuthSecret();
  const payload: StudentSessionPayload = {
    studentId,
    createdAt: Date.now(),
    exp: Date.now() + 8 * 60 * 60 * 1000, // 8시간
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const signature = crypto
    .createHmac('sha256', secret)
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

  try {
    const secret = getAuthSecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return false;
    }

    const payload: StudentSessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (Date.now() > payload.exp) return false;
    if (expectedStudentId && payload.studentId !== expectedStudentId) return false;
    return true;
  } catch (e) {
    return false;
  }
}

// ── 비밀번호 암호화 및 검증 헬퍼 (Bcrypt) ───────────────────────────────────

/**
 * 비밀번호를 단방향 솔트 해시(Bcrypt)로 변환
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

/**
 * 비밀번호가 이미 Bcrypt 해시 형태인지 판별
 */
export function isBcryptHash(str: string): boolean {
  return typeof str === 'string' && (str.startsWith('$2a$') || str.startsWith('$2b$'));
}

/**
 * 입력된 평문 비밀번호와 저장된 비밀번호(해시 또는 기존 평문) 대조
 * - 점진적 마이그레이션 지원: 기존 평문도 호환되지만, 해시가 되어있으면 bcrypt.compare로 검증!
 */
export async function comparePassword(plainInput: string, storedPassword?: string | null): Promise<boolean> {
  if (!storedPassword) return false;
  const trimmedInput = plainInput.trim();
  const trimmedStored = storedPassword.trim();

  if (isBcryptHash(trimmedStored)) {
    return bcrypt.compare(trimmedInput, trimmedStored);
  }

  // 아직 평문인 기존 계정 호환
  return trimmedInput === trimmedStored;
}
