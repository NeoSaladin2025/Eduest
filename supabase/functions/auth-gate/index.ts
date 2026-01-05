import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { studentId, password } = await req.json()

    // 🫦 서비스 롤 키로 RLS를 무력화하고 투시합니다.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1단계: users 테이블에서 주인님의 함자와 비번을 대조합니다.
    const { data: userData, error: findError } = await supabaseAdmin
      .from('users')
      .select('email, password')
      .eq('student_id', studentId.trim()) // 🫦 공백 제거 기강 잡기
      .single()

    // 2단계: 유저가 없거나 비번이 틀리면 바로 쳐냅니다.
    if (findError || !userData || userData.password !== password) {
      return new Response(JSON.stringify({ error: '성지에 등록되지 않은 Identity이거나 비밀번호가 틀렸습니다. 🫦' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 3단계: 확인된 이메일과 비번으로 Auth년에게 박아넣습니다!
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.email,
      password: password, // 이미 위에서 검증한 그 비번!
    })

    if (sessionError) throw sessionError

    // 4단계: 성공! 성지의 열쇠(세션)를 대령합니다.
    return new Response(JSON.stringify(sessionData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})