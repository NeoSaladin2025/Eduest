import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** 시험 라이브러리용 GAS 배포 URL — Vercel에서는 `GAS_LIBRARY_WEBAPP_URL` 환경 변수로 덮어쓸 수 있음 */
const DEFAULT_GAS_LIBRARY_URL =
  "https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 🌟 [핵심 방어막] 동기화 후 Supabase exam_library 내 쌍둥이 폴더 및 하위 문항 전량 자동 즉시 영구 삭제 */
async function purgeTwinsFromSupabase(): Promise<number> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. 이름에 '쌍둥이'가 포함된 모든 레코드 찾기
  const { data: directTwins } = await supabase
    .from("exam_library")
    .select("drive_id")
    .ilike("name", "%쌍둥이%");

  if (!directTwins || directTwins.length === 0) return 0;

  const twinIds = new Set<string>(directTwins.map((t) => t.drive_id));

  // 2. 재귀적으로 쌍둥이 하위 모든 자식/손자 폴더 및 파일 수집
  let added = true;
  while (added) {
    added = false;
    const parentList = Array.from(twinIds);
    if (parentList.length === 0) break;

    for (let i = 0; i < parentList.length; i += 20) {
      const chunk = parentList.slice(i, i + 20);
      const { data: children } = await supabase
        .from("exam_library")
        .select("drive_id")
        .in("parent_id", chunk);

      if (children) {
        for (const child of children) {
          if (!twinIds.has(child.drive_id)) {
            twinIds.add(child.drive_id);
            added = true;
          }
        }
      }
    }
  }

  // 특수 영구 데이터는 안전 보호
  twinIds.delete("test_twin_problems_data");
  twinIds.delete("test2_exam_papers_data");
  twinIds.delete("test2_student_submissions_data");

  const idsToDelete = Array.from(twinIds);
  if (idsToDelete.length === 0) return 0;

  for (let i = 0; i < idsToDelete.length; i += 50) {
    const chunk = idsToDelete.slice(i, i + 50);
    await supabase.from("exam_library").delete().in("drive_id", chunk);
  }

  console.log(`[POST-SYNC PURGE] Cleaned up ${idsToDelete.length} twin items from exam_library.`);
  return idsToDelete.length;
}

export async function POST(req: NextRequest) {
  const target = process.env.GAS_LIBRARY_WEBAPP_URL || DEFAULT_GAS_LIBRARY_URL;
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  try {
    const gasRes = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      redirect: "follow",
    });

    const text = await gasRes.text();
    try {
      const json = JSON.parse(text) as any;

      // 🌟 [핵심] sync_to_supabase 실행 완료 시, 백엔드에서 쌍둥이 데이터 자동 즉시 영구 삭제 실행
      if (gasRes.ok && json && json.success) {
        try {
          const reqJson = JSON.parse(body);
          if (reqJson.action === "sync_to_supabase") {
            const purged = await purgeTwinsFromSupabase();
            if (purged > 0) {
              json.message = (json.message || "동기화가 완료되었습니다.") + ` (쌍둥이 ${purged}건 자동 제외)`;
            }
          }
        } catch (purgeErr) {
          console.error("Post-sync purge error:", purgeErr);
        }
      }

      return NextResponse.json(json, { status: gasRes.ok ? 200 : gasRes.status });
    } catch {
      // GAS가 JSON 대신 구글 로그인 HTML이나 오류 HTML을 반환한 경우
      const titleMatch = text.match(/<title>(.*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1] : "구글 스크립트 실행 오류";
      
      let friendlyMessage = `구글 드라이브 응답 오류 (${pageTitle})`;
      if (text.includes("Google Accounts") || text.includes("Sign in")) {
        friendlyMessage = "구글 계정 권한 인증이 필요합니다. GAS 웹앱 배포 설정(Who has access: Anyone)을 확인해 주세요.";
      } else if (text.includes("Service invoked too many times") || text.includes("Rate Limit")) {
        friendlyMessage = "구글 드라이브 API 호출 한도가 초과되었습니다. 잠시 후 '빠른 증분 동기화'로 시도해 주세요.";
      } else if (text.includes("Exceeded maximum execution time") || text.includes("Timeout")) {
        friendlyMessage = "동기화 처리 시간이 6분을 초과했습니다. 학년별로 나누어 실행하거나 '빠른 증분 동기화'를 이용해 주세요.";
      }

      return NextResponse.json(
        { 
          success: false, 
          error: friendlyMessage, 
          rawSnippet: text.slice(0, 300) 
        }, 
        { status: 502 }
      );
    }
  } catch (netErr: any) {
    return NextResponse.json(
      { 
        success: false, 
        error: `서버 통신 실패 (타임아웃 또는 네트워크 지연): ${netErr?.message || netErr}` 
      }, 
      { status: 504 }
    );
  }
}
