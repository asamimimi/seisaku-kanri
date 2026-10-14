import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { daysUntil, formatMonthDay } from '../lib/date'
import { ProjectCard } from '../components/ProjectCard'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { DeleteProjectDialog } from '../components/DeleteProjectDialog'
import type { ProjectOverview } from '../types'

type SortKey = 'due' | 'waiting' | 'ahead' | 'name'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'due', label: '納期が近い順' },
  { key: 'waiting', label: '確認待ちが多い順' },
  { key: 'ahead', label: '▲先行着手が多い順' },
  { key: 'name', label: '案件名順' },
]

/** 納期が近い順（納期なしは最後）。同じなら案件名順 */
const byDue = (a: ProjectOverview, b: ProjectOverview) => {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  return a.name.localeCompare(b.name, 'ja')
}

const COMPARE: Record<SortKey, (a: ProjectOverview, b: ProjectOverview) => number> = {
  due: byDue,
  waiting: (a, b) => b.waiting_pages - a.waiting_pages || byDue(a, b),
  ahead: (a, b) => b.ahead_pages - a.ahead_pages || byDue(a, b),
  name: (a, b) => a.name.localeCompare(b.name, 'ja'),
}

export default function Projects() {
  const [projects, setProjects] = useState<ProjectOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('due')
  const [showArchived, setShowArchived] = useState(false)
  const [deleting, setDeleting] = useState<ProjectOverview | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0) // 増やすと一覧を読み直す

  useEffect(() => {
    let cancelled = false
    // project_overview は案件ごとの集計ビュー。RLSにより自分が見られる案件だけが返る。
    // アーカイブ済みも一緒に読み、画面で分ける（件数を切り替えボタンに出すため）
    supabase
      .from('project_overview')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          return
        }
        setError(null)
        setProjects(data as ProjectOverview[])
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // 上のまとめと「進行中の案件」は、アーカイブしていない案件だけで数える
  const list = (projects ?? []).filter((p) => !p.archived_at)
  const archived = (projects ?? [])
    .filter((p) => p.archived_at)
    .sort((a, b) => b.archived_at!.localeCompare(a.archived_at!))
  const sorted = [...list].sort(COMPARE[sort])

  /** アーカイブを外して、進行中に戻す */
  const restore = async (p: ProjectOverview) => {
    setRestoringId(p.project_id)
    setActionError(null)
    const { data, error } = await supabase
      .from('projects')
      .update({ archived_at: null })
      .eq('id', p.project_id)
      .select('id')
    setRestoringId(null)
    if (error || !data?.length) {
      setActionError(`元に戻せませんでした${error ? `: ${error.message}` : '（編集する権限がありません）'}`)
      return
    }
    setReloadKey((k) => k + 1)
  }
  const waiting = list.reduce((n, p) => n + p.waiting_pages, 0)
  const ahead = list.reduce((n, p) => n + p.ahead_pages, 0)
  const soon = list.filter((p) => {
    const d = daysUntil(p.due_date)
    return d !== null && d <= 7
  }).length

  return (
    <main className="page">
      <div className="title-row">
        <h1>案件</h1>
        <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
          ＋ 案件を作成
        </button>
      </div>

      <section className="summary" aria-label="未対応のまとめ">
        <div className="summary-card">
          <div className="muted small">クライアント確認待ち</div>
          <div className="summary-value">{waiting}ページ</div>
        </div>
        <div className="summary-card">
          <div className="muted small">▲ OK前に実装へ進んだページ</div>
          <div className="summary-value">{ahead}ページ</div>
        </div>
        <div className="summary-card">
          <div className="muted small">納期が7日以内の案件</div>
          <div className="summary-value">{soon}件</div>
        </div>
      </section>

      <div className="section-header">
        <h2 className="visually-hidden">{showArchived ? 'アーカイブ済みの案件' : '進行中の案件'}</h2>
        <div className="section-switch" role="group" aria-label="表示する案件">
          <button
            type="button"
            className={`btn ${showArchived ? '' : 'btn-primary'}`}
            aria-pressed={!showArchived}
            onClick={() => setShowArchived(false)}
          >
            進行中 {list.length}
          </button>
          <button
            type="button"
            className={`btn ${showArchived ? 'btn-primary' : ''}`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
          >
            アーカイブ済み {archived.length}
          </button>
        </div>
        {!showArchived && (
          <label className="sort-control">
            <span className="muted">並び替え</span>
            <select
              className="filter-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="error">
          案件を読み込めませんでした: {error}
        </p>
      )}
      {projects === null && !error && <p className="status">読み込み中…</p>}

      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}

      {projects !== null && showArchived && (
        <section className="archived" aria-label="アーカイブ済みの案件">
          {archived.length === 0 ? (
            <p className="muted">
              アーカイブ済みの案件はありません。終わった案件は、案件の画面の「アーカイブ」から移せます。
            </p>
          ) : (
            <ul className="archived-list">
              {archived.map((p) => (
                <li key={p.project_id} className="archived-item">
                  <div className="archived-info">
                    <Link to={`/projects/${p.project_id}`} className="strong">
                      {p.name}
                    </Link>
                    <span className="muted small">
                      {p.client_name ?? 'クライアント未設定'} ／ 全 {p.pages_total} ページ ／ アーカイブ{' '}
                      {formatMonthDay(p.archived_at!)}
                    </span>
                  </div>
                  <div className="archived-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void restore(p)}
                      disabled={restoringId === p.project_id}
                    >
                      進行中に戻す
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-danger-outline"
                      onClick={() => setDeleting(p)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {projects !== null && !showArchived && (
        <section className="cards" aria-label="案件一覧">
          {sorted.map((p) => (
            <ProjectCard key={p.project_id} p={p} />
          ))}
          <button type="button" className="card-new" onClick={() => setDialogOpen(true)}>
            ＋ 新しい案件を作成
          </button>
        </section>
      )}

      <p className="legend" aria-label="進捗バーの色">
        <span>進捗バーの色:</span>
        <span className="legend-item">
          <i className="swatch swatch-done" />完了
        </span>
        <span className="legend-item">
          <i className="swatch swatch-build" />実装（実装中〜実装完了）
        </span>
        <span className="legend-item">
          <i className="swatch swatch-design" />設計（ワイヤー・デザイン）
        </span>
      </p>

      <DeleteProjectDialog
        project={deleting && { id: deleting.project_id, name: deleting.name }}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null)
          setReloadKey((k) => k + 1)
        }}
      />
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false)
          setReloadKey((k) => k + 1)
        }}
      />
    </main>
  )
}
