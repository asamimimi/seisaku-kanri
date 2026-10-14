-- =============================================================================
-- v0.5 クライアント向け共有
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- 共有リンク（/share/<token>）を知っている人は、ログインなしで案件の一部を見て、コメントを送れる。
--
-- 守り方:
--   テーブルの RLS はそのまま（ログインしていない人＝anon は、どのテーブルも読めない）。
--   anon が呼べるのは下の2つの関数だけ。関数の中でトークンを確かめ、決めた項目だけを返す・書き込む。
--   見せるもの: 案件名・クライアント名・納期・テスト環境URL / ページのツリー / 制作フェーズ / 確認状況 / スケジュール
--   見せないもの: ▲先行着手、仕様メモ、Figmaリンク、素材、指摘・質問の一覧、メンバー
-- =============================================================================

-- ---------- 共有リンク（案件に1つ。消すとリンクが無効になる） ----------
create table public.project_shares (
  project_id uuid primary key references public.projects (id) on delete cascade,
  -- 推測できない長い文字列（uuid 2つ分の乱数）。URL にそのまま使える16進数
  token      text not null unique
             default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

-- 共有リンクを見られる・作れる・消せるのは owner / editor だけ（viewer などにはリンクを見せない）
alter table public.project_shares enable row level security;
create policy project_shares_select on public.project_shares for select to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy project_shares_insert on public.project_shares for insert to authenticated
  with check (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));
create policy project_shares_delete on public.project_shares for delete to authenticated
  using (public.has_project_role(project_id, array['owner','editor']::public.member_role[]));

-- ---------- 共有リンクから来たコメントの印 ----------
-- 空なら自分で登録したもの。入っていれば、共有リンクからクライアントが送ったもの（送った人の名前）
alter table public.issues
  add column author_name text check (length(author_name) <= 50);

-- ---------- 共有画面の中身を返す（anon も呼べる） ----------
-- トークンが無効なら null を返す。security definer なので RLS を通らずに読む。
-- そのぶん、ここで返す列を絞ることが守りになる（列を足すときは見せてよいか確かめる）
create or replace function public.get_shared_project(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  pid uuid;
begin
  select s.project_id into pid from public.project_shares s where s.token = p_token;
  if pid is null then
    return null;
  end if;

  return jsonb_build_object(
    'project', (
      select jsonb_build_object('name', p.name, 'client_name', p.client_name,
                                'due_date', p.due_date, 'staging_url', p.staging_url)
      from public.projects p where p.id = pid
    ),
    'phases', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'name', ph.name,
                                          'position', ph.position, 'stage', ph.stage) order by ph.position)
      from public.phases ph where ph.project_id = pid
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('id', pg.id, 'parent_id', pg.parent_id, 'name', pg.name,
                                          'url_path', pg.url_path, 'position', pg.position,
                                          'phase_id', pg.phase_id))
      from public.pages pg where pg.project_id = pid
    ), '[]'::jsonb),
    -- 確認状況（行がなければ未依頼）。is_ahead（先行着手）は自分用なので返さない
    'confirmations', coalesce((
      select jsonb_agg(jsonb_build_object('page_id', pg.id, 'point_name', cp.name,
                                          'point_position', cp.position,
                                          'status', coalesce(pc.status, 'not_requested'),
                                          'requested_at', pc.requested_at, 'resolved_at', pc.resolved_at))
      from public.pages pg
      join public.confirmation_points cp on cp.project_id = pg.project_id
      left join public.page_confirmations pc
        on pc.page_id = pg.id and pc.confirmation_point_id = cp.id
      where pg.project_id = pid
    ), '[]'::jsonb),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object('page_id', sc.page_id, 'stage', sc.stage,
                                          'start_date', sc.start_date, 'due_date', sc.due_date))
      from public.page_schedules sc where sc.project_id = pid
    ), '[]'::jsonb)
  );
end $$;

-- ---------- 共有画面からコメントを送る（anon も呼べる） ----------
-- 指摘・質問（issues）に入る。トークンが無効、ページが別の案件のもの、長すぎる入力は拒否する
create or replace function public.post_shared_comment(
  p_token text, p_page_id uuid, p_kind public.issue_kind, p_body text, p_author text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  pid uuid;
begin
  select s.project_id into pid from public.project_shares s where s.token = p_token;
  if pid is null then
    raise exception 'この共有リンクは無効です' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_author, ''))) = 0 or length(p_author) > 50 then
    raise exception 'お名前は1〜50文字で入れてください' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 or length(p_body) > 2000 then
    raise exception '内容は1〜2000文字で入れてください' using errcode = 'check_violation';
  end if;
  -- page_id が別の案件のページなら、issues の (page_id, project_id) の外部キーで拒否される
  insert into public.issues (project_id, page_id, kind, body, author_name)
  values (pid, p_page_id, p_kind, btrim(p_body), btrim(p_author));
end $$;

-- 関数は既定で誰でも呼べるので、いったん外してから必要な相手にだけ許可する
revoke all on function public.get_shared_project(text) from public;
revoke all on function public.post_shared_comment(text, uuid, public.issue_kind, text, text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
grant execute on function public.post_shared_comment(text, uuid, public.issue_kind, text, text) to anon, authenticated;
