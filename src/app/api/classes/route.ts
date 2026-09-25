import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET_NAME = 'class_management';
const FILE_PATH = 'classes.json';

// Helper to ensure bucket exists
async function ensureBucket() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    }
  } catch (e) {
    console.error('Bucket check error:', e);
  }
}

// GET: 수업 목록 전체 가져오기
export async function GET() {
  try {
    await ensureBucket();
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(FILE_PATH);

    if (error || !data) {
      return NextResponse.json({ classes: [] });
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    return NextResponse.json({ 
      classes: parsed.classes || [],
      custom_reasons: parsed.custom_reasons || null,
      custom_actions: parsed.custom_actions || null
    });
  } catch (error: any) {
    console.error('Classes GET error:', error);
    return NextResponse.json({ classes: [] });
  }
}

// POST: 수업 목록 및 사유/조치 저장 / 업데이트
export async function POST(req: Request) {
  try {
    await ensureBucket();
    const body = await req.json();
    const classes = body.classes || [];
    const custom_reasons = body.custom_reasons;
    const custom_actions = body.custom_actions;

    const jsonString = JSON.stringify({ 
      classes, 
      custom_reasons,
      custom_actions,
      updated_at: new Date().toISOString() 
    }, null, 2);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(FILE_PATH, jsonString, {
        upsert: true,
        contentType: 'application/json',
      });

    if (error) {
      console.error('Classes save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: classes.length });
  } catch (error: any) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
