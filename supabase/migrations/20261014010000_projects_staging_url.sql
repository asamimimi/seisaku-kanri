-- =============================================================================
-- テスト環境URL（案件に1つ持つ）
-- 実行方法: Supabase の SQL Editor に貼る、または supabase/migrations/ に置いて `supabase db push`
--
-- サイトマップ画面では、この URL と各ページの url_path をつなげてリンクにする。
--   例: https://stg.example.com + /about/ → https://stg.example.com/about/
-- 権限は projects の既存のRLS（編集は owner / editor）がそのまま効く。
-- =============================================================================

alter table public.projects
  add column staging_url text
  check (staging_url ~ '^https?://');   -- javascript: などのリンクを入れられないようにする
