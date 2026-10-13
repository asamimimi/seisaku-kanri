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
