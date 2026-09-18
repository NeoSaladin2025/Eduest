import { NextRequest, NextResponse } from "next/server";

/** 시험 라이브러리용 GAS 배포 URL — Vercel에서는 `GAS_LIBRARY_WEBAPP_URL` 환경 변수로 덮어쓸 수 있음 */
const DEFAULT_GAS_LIBRARY_URL =
  "https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
      const json = JSON.parse(text) as unknown;
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
