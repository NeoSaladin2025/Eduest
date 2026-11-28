import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

const CONFIG_KEY = 'default';

function normalizeIds(val: any): string[] {
  if (!Array.isArray(val)) return [];
  return Array.from(new Set(val.map((id) => String(id || '').trim()).filter(Boolean)));
}

async function fetchTargetsRow(supabase: ReturnType<typeof getSupabase>) {
  const { data, error } = await supabase
    .from('monitoring_targets')
    .select('daily_student_ids, proctor_student_ids, updated_at')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const dailyStudentIds = normalizeIds(data?.daily_student_ids);
  const proctorStudentIds = normalizeIds(data?.proctor_student_ids);
  const allTargetIds = Array.from(new Set([...dailyStudentIds, ...proctorStudentIds]));

  return {
    dailyStudentIds,
    proctorStudentIds,
    allTargetIds,
    updatedAt: data?.updated_at || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    const res = await fetchTargetsRow(supabase);

    return NextResponse.json({
      success: true,
      ...res,
      ...(studentId ? { isMonitored: res.allTargetIds.includes(studentId) } : {}),
    });
  } catch (err: any) {
    console.error('Failed to load monitoring targets:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        dailyStudentIds: [],
        proctorStudentIds: [],
        allTargetIds: [],
        isMonitored: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scope = 'daily', studentIds, seedIfEmpty = false } = body;

    if (!['daily', 'proctor', 'both'].includes(scope)) {
      return NextResponse.json({ success: false, error: 'Invalid scope' }, { status: 400 });
    }

    const supabase = getSupabase();
    const current = await fetchTargetsRow(supabase);
    const normalizedIncoming = normalizeIds(studentIds);

    let nextDaily = current.dailyStudentIds;
    let nextProctor = current.proctorStudentIds;

    if (scope === 'daily') {
      if (seedIfEmpty && current.dailyStudentIds.length > 0) {
        return NextResponse.json({ success: true, ...current, skippedSeed: true });
      }
      nextDaily = normalizedIncoming;
    } else if (scope === 'proctor') {
      if (seedIfEmpty && current.proctorStudentIds.length > 0) {
        return NextResponse.json({ success: true, ...current, skippedSeed: true });
      }
      nextProctor = normalizedIncoming;
    } else if (scope === 'both') {
      nextDaily = normalizeIds(body.dailyStudentIds ?? studentIds);
      nextProctor = normalizeIds(body.proctorStudentIds ?? studentIds);
    }

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase.from('monitoring_targets').upsert(
      {
        config_key: CONFIG_KEY,
        daily_student_ids: nextDaily,
        proctor_student_ids: nextProctor,
        updated_at: nowIso,
      },
      { onConflict: 'config_key' }
    );

    if (upsertErr) {
      throw upsertErr;
    }

    const allTargetIds = Array.from(new Set([...nextDaily, ...nextProctor]));
    return NextResponse.json({
      success: true,
      dailyStudentIds: nextDaily,
      proctorStudentIds: nextProctor,
      allTargetIds,
      updatedAt: nowIso,
    });
  } catch (err: any) {
    console.error('Failed to save monitoring targets:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
