-- =============================================================================
-- ページの親子が輪にならないようにする（docs/PLAN.md 5章）
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- 自分自身を親にすることは pages の check で防げている。
-- ここでは「会社概要 → 代表挨拶 → 会社概要」のような、2段以上離れた輪を防ぐ。
-- 新しく作るページにはまだ子がいないので、チェックは親を変える UPDATE だけでよい。
-- =============================================================================

-- 新しい親から上へたどり、途中に自分が出てきたら拒否する
create or replace function public.pages_prevent_cycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  -- 同じ案件で同時に2人が移動すると、どちらのチェックも通って輪ができることがある。
  -- 案件ごとに順番待ちさせて防ぐ（ロックはトランザクションの終わりで自動的に外れる）
  perform pg_advisory_xact_lock(hashtext(new.project_id::text));

  if exists (
    with recursive ancestors as (
      select id, parent_id from public.pages where id = new.parent_id
      union   -- union all ではなく union にして、万一すでに輪があっても無限ループにしない
      select p.id, p.parent_id
      from public.pages p
      join ancestors a on p.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'ページを自分の子孫の下には移動できません'
      using errcode = 'check_violation';  -- supabase-js では error.code = '23514'
  end if;

  return new;
end $$;

create trigger pages_prevent_cycle_trg
  before update of parent_id on public.pages
  for each row
  when (new.parent_id is distinct from old.parent_id)
  execute function public.pages_prevent_cycle();
