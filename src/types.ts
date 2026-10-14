/** project_overview ビュー（案件一覧用）の1行 */
export type ProjectOverview = {
  project_id: string
  name: string
  client_name: string | null
  due_date: string | null
  archived_at: string | null
  pages_total: number
  done_count: number
  build_count: number
  design_count: number
  waiting_pages: number
  ahead_pages: number
}

/** projects テーブル（サイトマップ画面の見出しに使う列だけ） */
export type Project = {
  id: string
  name: string
  client_name: string | null
  due_date: string | null
  staging_url: string | null
}

export type PhaseStage = 'design' | 'build' | 'done'

/** phases テーブルの1行（制作フェーズ） */
export type Phase = {
  id: string
  name: string
  position: number
  stage: PhaseStage
}

/** page_overview ビュー（サイトマップ用）の1行 */
export type PageOverview = {
  id: string
  project_id: string
  parent_id: string | null
  name: string
  url_path: string | null
  position: number
  phase_id: string
  phase_name: string
  phase_position: number
  stage: PhaseStage
  waiting_count: number
  revising_count: number
  ahead_count: number
  materials_count: number
  materials_temporary_count: number
}

export type ConfirmationStatus = 'not_requested' | 'waiting' | 'revising' | 'ok' | 'not_required'

/** page_confirmation_status ビューの1行（ページ × 確認ポイント） */
export type PageConfirmationStatus = {
  page_id: string
  confirmation_point_id: string
  point_name: string
  point_position: number
  status: ConfirmationStatus
  requested_at: string | null
  resolved_at: string | null
  is_ahead: boolean
}

export type MaterialStatus = 'temporary' | 'purchased' | 'replaced'

/** materials テーブルの1行（ページの素材） */
export type Material = {
  id: string
  page_id: string
  name: string
  source_url: string | null
  status: MaterialStatus
  position: number
}
