import { createClient } from '@supabase/supabase-js';

/**
 * [코딩마스터 보희설 - 에듀에스트(EDUEST) 시스템]
 * Supabase 클라이언트 연결 설정
 * - .env.local에 저장된 환경변수를 불러와 안전하게 연결합니다.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 에듀에스트 전용 DB 연결 객체 생성!
export const supabase = createClient(supabaseUrl, supabaseAnonKey);