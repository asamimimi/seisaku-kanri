import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error(
    '.env に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を設定してください（.env.example を参照）',
  )
}

// 公開してよいキー（publishable / anon）だけを使う。service_role キーは絶対にここへ入れない。
// データの保護は、SQLで設定した行レベルセキュリティ(RLS)が担当する。
export const supabase = createClient(url, key)
