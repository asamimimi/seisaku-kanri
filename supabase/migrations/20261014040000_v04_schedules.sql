-- =============================================================================
-- v0.4 スケジュール
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- ページごとに、4つの期間（WF / デザイン / 実装 / 最終確認・調整）の開始日と期限を持つ。
-- 制作フェーズ（phases）とは別に持つ。フェーズは「今どこにいるか」、ここは「いつやる予定か」。
-- 期限切れかどうかは保存せず、画面で今日の日付と制作フェーズから毎回計算する（先行着手と同じ考え方）。
-- =============================================================================

create type public.schedule_stage as enum (
  'wireframe',  -- WF
  'design',     -- デザイン
  'build',      -- 実装
  'final'       -- 最終確認・調整
);

create table public.page_schedules (
  page_id    uuid not null,
  project_id uuid not null,
  stage      public.schedule_stage not null,
  start_date date not null,
  due_date   date not null,
  updated_at timestamptz not null default now(),
  primary key (page_id, stage),
  check (start_date <= due_date),
  -- 他の案件のページに付けられないよう (id, project_id) の組で参照する
  foreign key (page_id, project_id) references public.pages (id, project_id) on delete cascade
);
create index page_schedules_project_idx on public.page_schedules (project_id);
create trigger page_schedules_touch before update on public.page_schedules
  for each row execute function public.touch_updated_at();

-- 閲覧は全メンバー、編集は owner / editor（v01_core の中身のテーブルと同じ）
alter table public.page_schedules enable row level security;
create policy page_schedules_select on public.page_schedules for select to authenticated
  using (public.has_project_role(project_id, array['owner','editor','commenter','viewer']::public.member_role[]));
create policy page_schedules_insert on public.page_schedules for insert to authenticated
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy page_schedules_update on public.page_schedules for update to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy page_schedules_delete on public.page_schedules for delete to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
