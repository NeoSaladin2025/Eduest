-- Eduest Monitoring & Analytics Phase 3 Normalized Tables
-- Safe, idempotent migration (run once in Supabase Dashboard -> SQL Editor)
-- Leaves legacy exam_library JSON blobs intact until backfill + verification completes.

-- 1. Global monitoring targets (syncs monitored student lists across devices & students)
create table if not exists public.monitoring_targets (
  config_key text primary key,
  daily_student_ids jsonb not null default '[]'::jsonb,
  proctor_student_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.monitoring_targets (config_key, daily_student_ids, proctor_student_ids)
values ('default', '[]'::jsonb, '[]'::jsonb)
on conflict (config_key) do nothing;

-- 2. Live exam proctoring states (1 row per active monitored test-taker)
create table if not exists public.student_proctor_states (
  student_id text primary key,
  student_name text,
  student_grade text,
  exam_id text,
  exam_title text,
  bundle_id text,
  bundle_title text,
  round integer,
  question_idx integer,
  total_questions integer,
  current_question_number integer,
  is_installment boolean not null default false,
  set_index integer,
  total_sets integer,
  set_round integer,
  set_total_rounds integer,
  is_recall_question boolean not null default false,
  recall_origin_set integer,
  test_status text,
  test_remaining_sec integer,
  duration_min integer,
  test_duration_min integer,
  enable_lockdown boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_proctor_states_updated_at
  on public.student_proctor_states (updated_at desc);

-- 3. TEST temporary in-progress state (1 row per exam_id + student_id, prevents overwrite races)
create table if not exists public.student_temp_progress (
  id text primary key,
  exam_id text not null,
  student_id text not null,
  student_name text,
  answers jsonb not null default '{}'::jsonb,
  unknown_questions jsonb not null default '[]'::jsonb,
  current_question_idx integer not null default 0,
  total_questions integer not null default 0,
  answered_count integer not null default 0,
  time_left integer,
  installment_set_index integer,
  installment_set_round integer,
  updated_by text default 'student',
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_temp_progress_exam_id
  on public.student_temp_progress (exam_id);
create index if not exists idx_student_temp_progress_student_id
  on public.student_temp_progress (student_id);

-- 4. Away / focus-loss logs (1 row per event, eliminates 300KB JSON rewrite)
create table if not exists public.student_away_logs (
  id text primary key,
  student_id text not null,
  student_name text,
  student_grade text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec integer not null default 1,
  context text not null default 'idle',
  location_title text not null default '',
  exam_title text not null default '',
  question_idx integer,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_away_logs_student_started
  on public.student_away_logs (student_id, started_at desc);
create index if not exists idx_student_away_logs_started_at
  on public.student_away_logs (started_at desc);

-- 5. Daily home study sessions (1 row per student_id + date, eliminates 547KB JSON rewrite)
create table if not exists public.student_home_study_daily (
  id text primary key,
  student_id text not null,
  student_name text,
  student_grade text,
  date text not null,
  total_duration_sec integer not null default 0,
  first_access_at timestamptz,
  last_access_at timestamptz,
  sessions jsonb not null default '[]'::jsonb,
  activities_summary jsonb not null default '{"library_sec":0,"review_sec":0,"test_sec":0,"video_sec":0,"homework_sec":0,"other_sec":0}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_home_study_daily_date
  on public.student_home_study_daily (date desc, total_duration_sec desc);
create index if not exists idx_student_home_study_daily_student_date
  on public.student_home_study_daily (student_id, date desc);

-- 6. Daily library analytics sessions (1 row per student_id + date, eliminates 752KB JSON rewrite)
create table if not exists public.student_library_daily (
  id text primary key,
  student_id text not null,
  student_name text,
  student_grade text,
  date text not null,
  total_duration_sec integer not null default 0,
  first_access_at timestamptz,
  last_access_at timestamptz,
  sessions jsonb not null default '[]'::jsonb,
  items_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_library_daily_date
  on public.student_library_daily (date desc, total_duration_sec desc);
create index if not exists idx_student_library_daily_student_date
  on public.student_library_daily (student_id, date desc);

-- Keep access consistent with existing internal tables (students / exam_library)
-- and ensure PostgREST picks up new schema immediately
notify pgrst, 'reload schema';
