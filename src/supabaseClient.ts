import { createClient } from '@supabase/supabase-js'

// 바이트년이 속삭여주는 환경변수 수신
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 수파베이스 조교(Client) 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey)