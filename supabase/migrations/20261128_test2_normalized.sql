-- Eduest Test2 Normalized Tables (replaces 1.3MB + 3.3MB monolithic JSON blobs)
-- Safe, idempotent migration (leaves legacy exam_library JSON blobs intact as cold archive)

-- 1. Normalized exam papers (1 row per exam)
create table if not exists public.exam_papers (
  id text primary key,
  title text not null,
  grade text not null default '공통',
  duration_min integer not null default 50,
  assigned_student_ids jsonb not null default '[]'::jsonb,
  target_student_id text,
  parent_exam_id text,
  is_wrong_review boolean not null default false,
  is_special boolean not null default false,
  is_treasure_hunt boolean not null default false,
  question_count integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exam_papers_assigned_gin
  on public.exam_papers using gin (assigned_student_ids);
create index if not exists idx_exam_papers_target_student
  on public.exam_papers (target_student_id)
  where target_student_id is not null;
create index if not exists idx_exam_papers_parent_exam
  on public.exam_papers (parent_exam_id)
  where parent_exam_id is not null;
create index if not exists idx_exam_papers_created_at
  on public.exam_papers (created_at desc);

-- 2. Normalized student exam submissions (1 row per student_id + exam_id)
create table if not exists public.student_exam_submissions (
  id text primary key,
  student_id text not null,
  exam_id text not null,
  exam_title text not null default '',
  submitted_at timestamptz not null default now(),
  score numeric not null default 0,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  has_pending_review boolean not null default false,
  pending_count integer not null default 0,
  submitted_by text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_exam_submissions_student_id
  on public.student_exam_submissions (student_id, submitted_at desc);
create index if not exists idx_student_exam_submissions_exam_id
  on public.student_exam_submissions (exam_id, submitted_at desc);
create index if not exists idx_student_exam_submissions_pending
  on public.student_exam_submissions (has_pending_review, submitted_at desc)
  where has_pending_review = true;

-- 3. Lightweight summary view for teacher exammgr (strips heavy answers payloads -> -95% egress & <4.5MB Vercel limit)
create or replace view public.student_exam_submission_summaries as
select
  id,
  student_id,
  exam_id,
  exam_title,
  submitted_at,
  score,
  total_questions,
  correct_count,
  has_pending_review,
  pending_count,
  submitted_by,
  (payload->>'current_round')::integer as current_round,
  (payload->>'completed_rounds')::integer as completed_rounds,
  coalesce(
    (
      select jsonb_agg(rh - 'answers')
      from jsonb_array_elements(coalesce(payload->'round_history', '[]'::jsonb)) as rh
    ),
    '[]'::jsonb
  ) as round_history
from public.student_exam_submissions;

notify pgrst, 'reload schema';
