import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('student_proctor_states')
      .select('*');

    if (error) {
      console.error('Failed to get proctor states:', error);
      return NextResponse.json({ success: false, states: {} }, { status: 500 });
    }

    const states: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      if (row?.student_id) {
        states[row.student_id] = row;
      }
    });

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

    if (action === 'clear' || state?.test_status === 'FINISHED' || state?.test_status === 'IDLE' || state?.test_status === 'PAUSED') {
      const { error: delErr } = await supabase
        .from('student_proctor_states')
        .delete()
        .eq('student_id', studentId);

      if (delErr) {
        console.error('Failed to delete proctor state:', delErr);
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'update' && state) {
      const row = {
        student_id: studentId,
        student_name: state.student_name ?? null,
        student_grade: state.student_grade ?? null,
        exam_id: state.exam_id ?? null,
        exam_title: state.exam_title ?? null,
        bundle_id: state.bundle_id ?? null,
        bundle_title: state.bundle_title ?? null,
        round: typeof state.round === 'number' ? state.round : null,
        question_idx: typeof state.question_idx === 'number' ? state.question_idx : null,
        total_questions: typeof state.total_questions === 'number' ? state.total_questions : null,
        current_question_number: typeof state.current_question_number === 'number' ? state.current_question_number : null,
        is_installment: Boolean(state.is_installment),
        set_index: typeof state.set_index === 'number' ? state.set_index : null,
        total_sets: typeof state.total_sets === 'number' ? state.total_sets : null,
        set_round: typeof state.set_round === 'number' ? state.set_round : null,
        set_total_rounds: typeof state.set_total_rounds === 'number' ? state.set_total_rounds : null,
        is_recall_question: Boolean(state.is_recall_question),
        recall_origin_set: typeof state.recall_origin_set === 'number' ? state.recall_origin_set : null,
        test_status: state.test_status ?? 'TESTING',
        test_remaining_sec: typeof state.test_remaining_sec === 'number' ? Math.round(state.test_remaining_sec) : null,
        duration_min: typeof state.duration_min === 'number' ? Math.round(state.duration_min) : null,
        test_duration_min: typeof state.test_duration_min === 'number' ? Math.round(state.test_duration_min) : null,
        enable_lockdown: Boolean(state.enable_lockdown),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('student_proctor_states')
        .upsert(row, { onConflict: 'student_id' });

      if (upsertErr) {
        console.error('Failed to upsert proctor state:', upsertErr);
        return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, state: row });
    }

    return NextResponse.json({ success: false, error: 'Invalid action or missing state' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
