import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const RECORD_DRIVE_ID = 'active_proctor_states';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RECORD_DRIVE_ID)
      .maybeSingle();

    if (error) {
      console.error('Failed to get proctor states:', error);
      return NextResponse.json({ success: false, states: {} });
    }

    let states = {};
    if (data?.file_data) {
      try {
        states = JSON.parse(data.file_data);
      } catch (e) {
        states = {};
      }
    }

    return NextResponse.json({ success: true, states });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, states: {} }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, studentId, state } = body;

    if (!studentId) {
      return NextResponse.json({ success: false, error: 'studentId is required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RECORD_DRIVE_ID)
      .maybeSingle();

    let states: Record<string, any> = {};
    if (data?.file_data) {
      try {
        states = JSON.parse(data.file_data);
      } catch (e) {}
    }

    if (action === 'clear' || state?.test_status === 'FINISHED' || state?.test_status === 'IDLE') {
      delete states[studentId];
    } else if (action === 'update' && state) {
      states[studentId] = {
        ...state,
        updated_at: new Date().toISOString(),
      };
    }

    const { error: upsertErr } = await supabase.from('exam_library').upsert({
      drive_id: RECORD_DRIVE_ID,
      name: RECORD_DRIVE_ID,
      type: 'file',
      file_data: JSON.stringify(states),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'drive_id' });

    if (upsertErr) {
      console.error('Failed to upsert proctor state:', upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, states });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
