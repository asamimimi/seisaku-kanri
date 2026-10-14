-- =============================================================================
-- v0.2 仕様メモ・Figmaリンク・素材リスト
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- 仕様メモとFigmaリンクはページに1つずつなので pages の列にする。
-- 素材はページに複数あるので materials テーブルを作る。
-- =============================================================================

-- ---------- 仕様メモ・Figmaリンク ----------
alter table public.pages
  add column spec_memo text not null default '',            -- 見出し・箇条書き・太字・リンクを Markdown の記法で書く
  add column figma_url text check (figma_url ~ '^https://'); -- javascript: などのリンクを入れられないようにする

-- ---------- 素材リスト ----------
create type public.material_status as enum (
  'temporary',  -- 仮
  'purchased',  -- 購入済み
  'replaced'    -- 差し替え済み
);

create table public.materials (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  page_id    uuid not null,
  name       text not null check (length(btrim(name)) > 0),
  source_url text check (source_url ~ '^https?://'),   -- 購入元
  status     public.material_status not null default 'temporary',
  position   double precision not null default 0,     -- ページ内の並び順
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 他の案件のページに付けられないよう (id, project_id) の組で参照する
  foreign key (page_id, project_id) references public.pages (id, project_id) on delete cascade
);
create index materials_page_idx on public.materials (page_id, position);
create index materials_project_idx on public.materials (project_id);
create trigger materials_touch before update on public.materials
  for each row execute function public.touch_updated_at();

-- 閲覧は全メンバー、編集は owner / editor（v01_core の中身のテーブルと同じ）
alter table public.materials enable row level security;
create policy materials_select on public.materials for select to authenticated
  using (public.has_project_role(project_id, array['owner','editor','commenter','viewer']::public.member_role[]));
create policy materials_insert on public.materials for insert to authenticated
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy materials_update on public.materials for update to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]))
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy materials_delete on public.materials for delete to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));

-- ---------- サイトマップの「素材」列 ----------
-- page_overview の最後に素材の件数を足す（create or replace view は列を後ろに足すことだけできる）。
-- 確認状況と join すると行が増えて数がずれるので、素材は副問い合わせで数える。
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
  (select count(*) from public.materials m where m.page_id = p.id and m.status = 'temporary') as materials_temporary_count  -- うち「仮」の数
from public.pages p
join public.phases ph on ph.id = p.phase_id
left join public.page_confirmation_status s on s.page_id = p.id
group by p.id, ph.id;
