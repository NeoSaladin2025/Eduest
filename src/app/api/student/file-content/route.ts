import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  const type = searchParams.get("type") || "html";
  const raw = searchParams.get("raw") !== "false"; // 기본 raw=true

  if (!fileId) {
    return NextResponse.json({ success: false, error: "fileId is required" }, { status: 400 });
  }

  const url = new URL("/api/drive/library/file", req.url);
  url.searchParams.set("fileId", fileId);
  url.searchParams.set("type", type);
  if (raw) {
    url.searchParams.set("raw", "true");
  }

  return NextResponse.redirect(url);
}
