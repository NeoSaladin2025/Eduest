import { NextRequest, NextResponse } from "next/server";

/** 시험 라이브러리용 GAS 배포 URL — Vercel에서는 `GAS_LIBRARY_WEBAPP_URL` 환경 변수로 덮어쓸 수 있음 */
const DEFAULT_GAS_LIBRARY_URL =
  "https://script.google.com/macros/s/AKfycbwkwjuyV5qS0jhuKVJG1jqqNCDURmsWCXveAiSB5mJKksMZ9Td5ijzx4c4JJEvDsRwVTA/exec";

export async function POST(req: NextRequest) {
  const target = process.env.GAS_LIBRARY_WEBAPP_URL || DEFAULT_GAS_LIBRARY_URL;
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

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
    return new NextResponse(text, {
      status: gasRes.status,
      headers: {
        "Content-Type": gasRes.headers.get("content-type") || "text/plain; charset=utf-8",
      },
    });
  }
}
