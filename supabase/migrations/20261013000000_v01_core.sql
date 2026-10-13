-- =============================================================================
-- v0.1 コア: 案件 / サイトマップ / 制作フェーズ / 確認状況
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- 設計の考え方
--   ① 制作フェーズ（自分の作業）と ② 確認状況（クライアントの返事）は別々に持つ。
--   これにより「OK待ちのまま実装へ進む」ことを表せる。
--   「先行着手」は保存せず、ビューで毎回計算する（保存すると食い違うため）。
--   共有（v0.5）に備え、最初から project_members と行レベルセキュリティ(RLS)で権限を管理する。
-- =============================================================================

-- ---------- 型 ----------
create type public.member_role as enum ('owner', 'editor', 'commenter', 'viewer');
create type public.phase_stage as enum ('design', 'build', 'done');  -- 案件一覧の進捗バー用（設計 / 実装 / 完了）
create type public.confirmation_status as enum (
  'not_requested',  -- 未依頼
  'waiting',        -- 確認待ち
  'revising',       -- 修正対応中
  'ok',             -- OK
  'not_required'    -- 確認不要
);

-- ---------- 共通: updated_at を自動更新 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================================
-- テーブル
-- =============================================================================

-- 案件
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  client_name text,
  due_date    date,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- 案件のメンバー（v0.5の共有で使う。v0.1では本人=owner の1行だけ）
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- 制作フェーズ（案件ごとに持つ。名前・順序は後から変えられる）
create table public.phases (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  position   int  not null,
  stage      public.phase_stage not null,
  unique (id, project_id),                                          -- 他テーブルが「同じ案件のフェーズ」だけを参照できるようにする
  unique (project_id, position) deferrable initially deferred       -- 並び替え中の一時的な重複を許す
);

-- 確認ポイント（ワイヤー確認 / デザイン確認 / 最終確認 など。案件ごと）
-- gate_phase_id: 「このフェーズに入る前にOKが必要」というフェーズ。
--   確認を依頼済み（確認待ち・修正対応中）のまま、ページがこのフェーズ以降へ進むと「先行着手」になる。
create table public.confirmation_points (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text not null,
  position      int  not null,
  gate_phase_id uuid not null,
  unique (id, project_id),
  unique (project_id, position) deferrable initially deferred,
  foreign key (gate_phase_id, project_id) references public.phases (id, project_id)
);

-- ページ（サイトマップ。parent_id で親子のツリー）
create table public.pages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id  uuid,
  name       text not null check (length(btrim(name)) > 0),
  url_path   text,
  position   double precision not null default 0,   -- 兄弟の並び順。間に挿入するときは前後の中間値にする
  phase_id   uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  check (parent_id is distinct from id),
  foreign key (parent_id, project_id) references public.pages (id, project_id) on delete cascade,
  foreign key (phase_id, project_id)  references public.phases (id, project_id)
);
create index pages_tree_idx on public.pages (project_id, parent_id, position);
create trigger pages_touch before update on public.pages
  for each row execute function public.touch_updated_at();

-- ページ × 確認ポイントごとの状況。行がなければ「未依頼」として扱う（ビュー側で補う）
create table public.page_confirmations (
  page_id               uuid not null,
  confirmation_point_id uuid not null,
  project_id            uuid not null,
  status                public.confirmation_status not null default 'not_requested',
  requested_at          timestamptz,   -- 確認待ちにした日時（「経過○日」の元）
  resolved_at           timestamptz,   -- OKになった日時
  note                  text,
  updated_at            timestamptz not null default now(),
  primary key (page_id, confirmation_point_id),
  foreign key (page_id, project_id)               references public.pages (id, project_id) on delete cascade,
  foreign key (confirmation_point_id, project_id) references public.confirmation_points (id, project_id) on delete cascade
);
create index page_confirmations_status_idx on public.page_confirmations (project_id, status);

-- =============================================================================
-- トリガー
-- =============================================================================

-- 案件を作ったら、本人をownerにし、初期のフェーズと確認ポイントを入れる
create or replace function public.on_project_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ph_design uuid; ph_build uuid; ph_done uuid;
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.phases (project_id, name, position, stage) values (new.id, 'ワイヤーフレーム作成', 1, 'design');
  insert into public.phases (project_id, name, position, stage) values (new.id, 'デザイン',             2, 'design') returning id into ph_design;
  insert into public.phases (project_id, name, position, stage) values (new.id, '実装中',               3, 'build')  returning id into ph_build;
  insert into public.phases (project_id, name, position, stage) values (new.id, '実装完了',             4, 'build');
  insert into public.phases (project_id, name, position, stage) values (new.id, '完了',                 5, 'done')   returning id into ph_done;

  insert into public.confirmation_points (project_id, name, position, gate_phase_id) values
    (new.id, 'ワイヤー確認',           1, ph_design),  -- デザインに入る前にOK
    (new.id, 'デザイン確認',           2, ph_build),   -- 実装に入る前にOK
    (new.id, '最終確認（テスト環境）', 3, ph_done);    -- 完了にする前にOK
  return new;
end $$;
create trigger projects_after_insert after insert on public.projects
  for each row execute function public.on_project_created();

-- ページを作るとき、フェーズ未指定なら最初のフェーズにする
create or replace function public.pages_default_phase()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.phase_id is null then
    select id into new.phase_id from public.phases
    where project_id = new.project_id order by position limit 1;
  end if;
  return new;
end $$;
create trigger pages_default_phase_trg before insert on public.pages
  for each row execute function public.pages_default_phase();

-- 確認状況が変わったら、日時を自動で記録する
create or replace function public.page_confirmations_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.status = 'waiting' and (tg_op = 'INSERT' or old.status is distinct from 'waiting') then
    new.requested_at = now();
    new.resolved_at  = null;
  elsif new.status = 'ok' and (tg_op = 'INSERT' or old.status is distinct from 'ok') then
    new.resolved_at = now();
  elsif new.status in ('revising', 'not_requested') then
    new.resolved_at = null;
  end if;
  return new;
end $$;
create trigger page_confirmations_stamp_trg before insert or update on public.page_confirmations
  for each row execute function public.page_confirmations_stamp();

-- =============================================================================
-- 権限（行レベルセキュリティ）
--   owner     : すべて可（メンバー管理・案件の削除を含む）
--   editor    : 中身の編集が可
--   commenter / viewer : 閲覧のみ（v0.5でコメント機能を足す）
-- =============================================================================
create or replace function public.has_project_role(p_project uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;
revoke all on function public.has_project_role(uuid, public.member_role[]) from public;
grant execute on function public.has_project_role(uuid, public.member_role[]) to authenticated;

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;

-- 案件: 作成直後の insert ... returning でも見えるよう、owner_id 本人なら閲覧可
create policy projects_select on public.projects for select to authenticated
  using (owner_id = (select auth.uid())
         or public.has_project_role(id, array['owner','editor','commenter','viewer']::public.member_role[]));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (public.has_project_role(id, array['owner','editor']::public.member_role[]))
  with check (public.has_project_role(id, array['owner','editor']::public.member_role[]));
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_project_role(id, array['owner']::public.member_role[]));

-- メンバー: 見られるのはメンバー全員、変更できるのはowner
create policy project_members_select on public.project_members for select to authenticated
  using (public.has_project_role(project_id, array['owner','editor','commenter','viewer']::public.member_role[]));
create policy project_members_write on public.project_members for all to authenticated
  using (public.has_project_role(project_id, array['owner']::public.member_role[]))
  with check (public.has_project_role(project_id, array['owner']::public.member_role[]));

-- 中身のテーブル: 閲覧は全メンバー、編集は owner / editor
do $$
declare t text;
begin
  foreach t in array array['phases', 'confirmation_points', 'pages', 'page_confirmations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %1$I on public.%2$I for select to authenticated
      using (public.has_project_role(project_id, array['owner','editor','commenter','viewer']::public.member_role[]))$p$,
      t || '_select', t);
    execute format($p$create policy %1$I on public.%2$I for insert to authenticated
      with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))$p$,
      t || '_insert', t);
    execute format($p$create policy %1$I on public.%2$I for update to authenticated
      using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))
      with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))$p$,
      t || '_update', t);
    execute format($p$create policy %1$I on public.%2$I for delete to authenticated
      using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))$p$,
      t || '_delete', t);
  end loop;
end $$;

-- =============================================================================
-- 画面用ビュー（security_invoker: 呼んだ人の権限で動くので、上のRLSがそのまま効く）
-- =============================================================================

-- ページ × 確認ポイントの状況（行がなければ「未依頼」）。
-- is_ahead = 先行着手: 確認を依頼済み（確認待ち・修正対応中）なのに、ゲートのフェーズ以降へ進んでいる。
--   未依頼のまま進んだ場合は含めない（依頼していないので「待ち」ではない）。
create view public.page_confirmation_status with (security_invoker = true) as
select
  p.id  as page_id,
  p.project_id,
  cp.id as confirmation_point_id,
  cp.name as point_name,
  cp.position as point_position,
  coalesce(pc.status, 'not_requested'::public.confirmation_status) as status,
  pc.requested_at,
  pc.resolved_at,
  pc.note,
  coalesce(ph.position >= gate.position and pc.status in ('waiting', 'revising'), false) as is_ahead
from public.pages p
join public.confirmation_points cp on cp.project_id = p.project_id
join public.phases ph   on ph.id   = p.phase_id
join public.phases gate on gate.id = cp.gate_phase_id
left join public.page_confirmations pc
  on pc.page_id = p.id and pc.confirmation_point_id = cp.id;

-- サイトマップ画面用: ページ1行にフェーズと確認状況の集計を付ける
create view public.page_overview with (security_invoker = true) as
select
  p.id, p.project_id, p.parent_id, p.name, p.url_path, p.position, p.phase_id,
  ph.name  as phase_name,
  ph.position as phase_position,
  ph.stage as stage,
  count(s.*) filter (where s.status = 'waiting')  as waiting_count,   -- 確認待ちの数
  count(s.*) filter (where s.status = 'revising') as revising_count,  -- 修正対応中の数
  count(s.*) filter (where s.is_ahead)            as ahead_count      -- 先行着手の数（>0 なら「▲先行着手」）
from public.pages p
join public.phases ph on ph.id = p.phase_id
left join public.page_confirmation_status s on s.page_id = p.id
group by p.id, ph.id;

-- 案件一覧画面用: 案件ごとの集計
create view public.project_overview with (security_invoker = true) as
select
  pr.id as project_id, pr.name, pr.client_name, pr.due_date, pr.archived_at,
  count(po.id)                                           as pages_total,
  count(po.id) filter (where po.stage = 'done')          as done_count,
  count(po.id) filter (where po.stage = 'build')         as build_count,
  count(po.id) filter (where po.stage = 'design')        as design_count,
  count(po.id) filter (where po.waiting_count > 0)       as waiting_pages,
  count(po.id) filter (where po.ahead_count > 0)         as ahead_pages
from public.projects pr
left join public.page_overview po on po.project_id = pr.id
group by pr.id;
