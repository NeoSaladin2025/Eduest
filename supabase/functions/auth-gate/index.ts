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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1단계: role까지 한꺼번에 긁어옵니다. 🫦
    const { data: userData, error: findError } = await supabaseAdmin
      .from('users')
      .select('email, password, role') // role 추가!
      .eq('student_id', studentId.trim())
      .single()

    if (findError || !userData || userData.password !== password) {
      return new Response(JSON.stringify({ error: '인증 실패 🫦' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 2단계: Auth 세션 생성
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.email,
      password: password,
    })

    if (sessionError) throw sessionError

    // 3단계: 세션과 role을 합쳐서 대령합니다. 🫦💦
    // sessionData 구조가 { user, session } 이므로 이를 펼쳐서 role을 섞습니다.
    return new Response(JSON.stringify({ 
      session: sessionData.session,
      user: sessionData.user,
      role: userData.role // 클라이언트가 DB 안 찔러도 되게 직접 하사
    }), {
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