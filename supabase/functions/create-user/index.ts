import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-client@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. 🫦 OPTIONS 요청 처리 (CORS 기강 잡기)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. 🫦 마스터키 준비 (Service Role Key로 시스템 심장부 관통)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 3. 🫦 호출한 유저의 신원 파악
    const authHeader = req.headers.get('Authorization')?.split(' ')[1]
    if (!authHeader) throw new Error('인증되지 않은 접근입니다 🫦')

    const { data: { user: creator }, error: authError } = await supabaseAdmin.auth.getUser(authHeader)
    if (authError || !creator) throw new Error('유효하지 않은 토큰입니다')

    // 4. 🫦 데이터 추출 및 권한 분기
    const { email, password, name, student_id, targetRole } = await req.json()
    const creatorRole = creator.user_metadata.role // 호출한 놈의 역할

    // 🫦 [기강 로직]
    // Super만 Teacher 생성 가능 / Teacher만 Student 생성 가능
    if (creatorRole === 'super' && targetRole !== 'teacher') throw new Error('하극상 금지: 슈퍼는 조교만 만들 수 있습니다 🫦')
    if (creatorRole === 'teacher' && targetRole !== 'student') throw new Error('권한 밖: 조교는 학생만 만들 수 있습니다 🫦')

    // 5. 🫦 Auth 계정 탄생 (비밀번호 암호화 포함)
    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: targetRole, name, student_id }
    })

    if (createError) throw createError

    // 6. 🫦 Public.users 장부에 낙인 찍기
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id, // Auth의 UID와 동기화
        student_id,
        name,
        role: targetRole,
        email
      })

    if (dbError) throw dbError

    return new Response(JSON.stringify({ message: `${targetRole} 계정이 성공적으로 탄생했습니다 🫦💦` }), {
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