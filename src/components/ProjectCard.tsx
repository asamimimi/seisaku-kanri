import { Link } from 'react-router-dom'
import { formatDue } from '../lib/date'
import type { ProjectOverview } from '../types'

export function ProjectCard({ p }: { p: ProjectOverview }) {
  const total = p.pages_total
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <Link className="card" to={`/projects/${p.project_id}`}>
      <div className="card-top">
        <div>
          <div className="card-name">{p.name}</div>
          <div className="muted small">{p.client_name ?? 'クライアント未設定'}</div>
        </div>
        <div className="muted small nowrap">{formatDue(p.due_date)}</div>
      </div>

      <div
        className="bar"
        role="img"
        aria-label={`完了 ${p.done_count}、実装 ${p.build_count}、設計 ${p.design_count}（全${total}ページ）`}
      >
        <span className="bar-done" style={{ width: `${pct(p.done_count)}%` }} />
        <span className="bar-build" style={{ width: `${pct(p.build_count)}%` }} />
        <span className="bar-design" style={{ width: `${pct(p.design_count)}%` }} />
      </div>

      <div className="muted small counts">
        <span>完了 {p.done_count}</span>
        <span>実装 {p.build_count}</span>
        <span>設計 {p.design_count}</span>
      </div>

      <div className="card-footer small">
        <span className="muted">全 {total} ページ</span>
        <span className="badges">
          <span className="badge badge-waiting">確認待ち {p.waiting_pages}</span>
          <span className="badge badge-ahead">▲先行着手 {p.ahead_pages}</span>
        </span>
      </div>
    </Link>
  )
}
