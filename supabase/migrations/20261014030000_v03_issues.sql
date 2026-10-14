-- =============================================================================
-- v0.3 指摘・質問
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- クライアントからの指摘（修正依頼）と質問を記録し、未対応 / 対応済みで管理する。
-- ページに付けるのが基本だが、案件全体への指摘もあるので page_id は空でもよい。
-- =============================================================================

create type public.issue_kind as enum (
  'fix',      -- 指摘
  'question'  -- 質問
);

create table public.issues (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  page_id           uuid,                     -- 空なら案件全体への指摘・質問
  kind              public.issue_kind not null default 'fix',
  body              text not null check (length(btrim(body)) > 0),
  figma_comment_url text check (figma_comment_url ~ '^https://'),  -- javascript: などのリンクを入れられないようにする
  resolved_at       timestamptz,              -- 対応済みにした日時。空なら未対応
  created_at        timestamptz not null default now(),  -- 登録日
  updated_at        timestamptz not null default now(),
  -- 他の案件のページに付けられないよう (id, project_id) の組で参照する（page_id が空ならチェックされない）
  foreign key (page_id, project_id) references public.pages (id, project_id) on delete cascade
);
create index issues_project_idx on public.issues (project_id, resolved_at);
create index issues_page_idx on public.issues (page_id);
create trigger issues_touch before update on public.issues
  for each row execute function public.touch_updated_at();

-- 閲覧は全メンバー、編集は owner / editor（v01_core の中身のテーブルと同じ）
-- v0.5 で commenter がコメントできるようにするときは、ここに insert のポリシーを足す
alter table public.issues enable row level security;
create policy issues_select on public.issues for select to authenticated
  using (public.has_project_role(project_id, array['owner','editor','commenter','viewer']::public.member_role[]));
create policy issues_insert on public.issues for insert to authenticated
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy issues_update on public.issues for update to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy issues_delete on public.issues for delete to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));

-- ---------- サイトマップの「指摘」列 ----------
-- page_overview の最後に未対応の件数を足す（v02 までの列はそのまま）
create or replace view public.page_overview with (security_invoker = true) as
select
  p.id, p.project_id, p.parent_id, p.name, p.url_path, p.position, p.phase_id,
  ph.name  as phase_name,
  ph.position as phase_position,
  ph.stage as stage,
  count(s.*) filter (where s.status = 'waiting')  as waiting_count,   -- 確認待ちの数
  count(s.*) filter (where s.status = 'revising') as revising_count,  -- 修正対応中の数
  count(s.*) filter (where s.is_ahead)            as ahead_count,     -- 先行着手の数（>0 なら「▲先行着手」）
  (select count(*) from public.materials m where m.page_id = p.id)                            as materials_count,           -- 素材の数
  (select count(*) from public.materials m where m.page_id = p.id and m.status = 'temporary') as materials_temporary_count, -- うち「仮」の数
  (select count(*) from public.issues i where i.page_id = p.id and i.resolved_at is null)     as open_issues_count          -- 未対応の指摘・質問の数
from public.pages p
join public.phases ph on ph.id = p.phase_id
left join public.page_confirmation_status s on s.page_id = p.id
group by p.id, ph.id;
