import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDue } from '../lib/date'
import { buildTree, joinUrl } from '../lib/sitemap'
import type { TreeRow } from '../lib/sitemap'
import { ConfirmationMenu } from '../components/ConfirmationMenu'
import { PageDialog } from '../components/PageDialog'
import { StagingUrlDialog } from '../components/StagingUrlDialog'
import type {
  ConfirmationStatus,
  PageConfirmationStatus,
  PageOverview,
  Phase,
  Project,
} from '../types'

type Data = {
  project: Project
  pages: PageOverview[]
  phases: Phase[]
  statuses: PageConfirmationStatus[]
}

type Filter = 'all' | 'waiting' | 'ahead' | 'revising'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'waiting', label: '確認待ちあり' },
  { key: 'ahead', label: '▲先行着手' },
  { key: 'revising', label: '修正対応中' },
]

/** 案件のサイトマップ画面 */
export default function ProjectPage() {
  const { projectId = '' } = useParams()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0) // 増やすと読み直す
  const [savingId, setSavingId] = useState<string | null>(null) // 保存中のページ（その行の操作を止める）

  const [filter, setFilter] = useState<Filter>('all')
  const [phaseFilter, setPhaseFilter] = useState('')

  const [pageDialog, setPageDialog] = useState<{ open: boolean; page: TreeRow | null }>({
    open: false,
    page: null,
  })
  const [stagingOpen, setStagingOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    // 画面に要るものをまとめて読む。RLSにより、メンバーでない案件は project が見つからない。
    void Promise.all([
      supabase
        .from('projects')
        .select('id, name, client_name, due_date, staging_url')
        .eq('id', projectId)
        .maybeSingle(),
      supabase.from('page_overview').select('*').eq('project_id', projectId),
      supabase
        .from('phases')
        .select('id, name, position, stage')
        .eq('project_id', projectId)
        .order('position'),
      supabase.from('page_confirmation_status').select('*').eq('project_id', projectId),
    ]).then(([project, pages, phases, statuses]) => {
      if (cancelled) return
      const failed = project.error ?? pages.error ?? phases.error ?? statuses.error
      if (failed) {
        setError(failed.message)
        return
      }
      if (!project.data) {
        setError('案件が見つかりません。削除されたか、見る権限がありません。')
        return
      }
      setError(null)
      setData({
        project: project.data as Project,
        pages: pages.data as PageOverview[],
        phases: phases.data as Phase[],
        statuses: statuses.data as PageConfirmationStatus[],
      })
    })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey])

  const rows = useMemo(() => buildTree(data?.pages ?? []), [data])

  const statusesByPage = useMemo(() => {
    const map = new Map<string, PageConfirmationStatus[]>()
    for (const s of data?.statuses ?? []) {
      const list = map.get(s.page_id) ?? []
      list.push(s)
      map.set(s.page_id, list)
    }
    return map
  }, [data])

  // 絞り込み。ボタンとフェーズの選択は両方満たすものを出す（ツリーの順番と字下げはそのまま）
  const visibleRows = rows.filter((r) => {
    if (phaseFilter && r.phase_id !== phaseFilter) return false
    if (filter === 'waiting') return r.waiting_count > 0
    if (filter === 'ahead') return r.ahead_count > 0
    if (filter === 'revising') return r.revising_count > 0
    return true
  })

  /** 書き込み → 失敗したら表示、成功したら読み直す（先行着手などはビューで再計算されるため） */
  const save = async (pageId: string, write: () => PromiseLike<{ error: { message: string } | null }>) => {
    setSavingId(pageId)
    setActionError(null)
    const { error } = await write()
    setSavingId(null)
    if (error) {
      setActionError(`保存できませんでした: ${error.message}`)
      return
    }
    setReloadKey((k) => k + 1)
  }

  const changePhase = (page: TreeRow, phaseId: string) =>
    void save(page.id, () => supabase.from('pages').update({ phase_id: phaseId }).eq('id', page.id))

  const changeStatus = (page: TreeRow, pointId: string, status: ConfirmationStatus) =>
    void save(page.id, () =>
      // 行がまだ無い（未依頼）こともあるので upsert。依頼日・OK日はDBのトリガーが記録する。
      supabase.from('page_confirmations').upsert(
        { page_id: page.id, confirmation_point_id: pointId, project_id: projectId, status },
        { onConflict: 'page_id,confirmation_point_id' },
      ),
    )

  if (error) {
    return (
      <main className="page">
        <p className="breadcrumb">
          <Link to="/">案件</Link>
        </p>
        <p role="alert" className="error">
          読み込めませんでした: {error}
        </p>
      </main>
    )
  }
  if (!data) return <p className="status">読み込み中…</p>

  const { project, phases } = data
  const phaseTone = (phaseId: string) =>
    Math.min(Math.max(phases.findIndex((p) => p.id === phaseId), 0), 4)

  return (
    <main className="page">
      <p className="breadcrumb">
        <Link to="/">案件</Link> ／ {project.name}
      </p>

      <div className="title-row">
        <div>
          <h1>{project.name}</h1>
          <p className="muted small project-meta">
            <span>{project.client_name ?? 'クライアント未設定'}</span>
            <span>{formatDue(project.due_date)}</span>
            <span>全 {rows.length} ページ</span>
            <span>
              テスト環境:{' '}
              {project.staging_url ? (
                <a href={project.staging_url} target="_blank" rel="noreferrer">
                  {project.staging_url}
                </a>
              ) : (
                '未設定'
              )}{' '}
              <button className="link-button" onClick={() => setStagingOpen(true)}>
                {project.staging_url ? '変更' : '設定する'}
              </button>
            </span>
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setPageDialog({ open: true, page: null })}>
          ＋ ページを追加
        </button>
      </div>

      <div className="filters" role="group" aria-label="絞り込み">
        <span className="muted">絞り込み:</span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn ${filter === f.key ? 'btn-primary' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <select
          className="filter-select"
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
          aria-label="制作フェーズで絞り込む"
        >
          <option value="">制作フェーズ: すべて</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}

      <div className="table-wrap">
        <table className="sitemap">
          <thead>
            <tr>
              <th scope="col">ページ名</th>
              <th scope="col">URL</th>
              <th scope="col">① 制作フェーズ</th>
              <th scope="col">② 確認状況</th>
              <th scope="col">
                <span className="visually-hidden">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const href = joinUrl(project.staging_url, r.url_path)
              const busy = savingId === r.id
              return (
                <tr key={r.id} aria-busy={busy}>
                  <th scope="row" className="sitemap-name" style={{ paddingLeft: 16 + r.depth * 24 }}>
                    {r.depth > 0 && <span className="tree-mark" aria-hidden="true">└</span>}
                    <span className={r.depth === 0 ? 'strong' : undefined}>{r.name}</span>
                  </th>
                  <td className="sitemap-url">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        {r.url_path}
                      </a>
                    ) : (
                      (r.url_path ?? <span className="muted">—</span>)
                    )}
                  </td>
                  <td>
                    <select
                      className={`phase-select tone-${phaseTone(r.phase_id)}`}
                      value={r.phase_id}
                      disabled={busy}
                      onChange={(e) => changePhase(r, e.target.value)}
                      aria-label={`${r.name}の制作フェーズ`}
                    >
                      {phases.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ConfirmationMenu
                      pageName={r.name}
                      points={statusesByPage.get(r.id) ?? []}
                      disabled={busy}
                      onChange={(pointId, status) => changeStatus(r, pointId, status)}
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn-outline"
                      onClick={() => setPageDialog({ open: true, page: r })}
                      aria-label={`${r.name}を編集`}
                    >
                      編集
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted table-empty">まだページがありません。「＋ ページを追加」から始めましょう。</p>
        )}
        {rows.length > 0 && visibleRows.length === 0 && (
          <p className="muted table-empty">条件に合うページはありません。</p>
        )}
      </div>

      <p className="muted small sitemap-note">
        ①制作フェーズ（自分の作業）と②確認状況（クライアントの返事）は別々に動かせます。
        確認待ち・修正対応中のまま先のフェーズへ進んだページには「▲先行着手」が付きます。
      </p>

      <PageDialog
        open={pageDialog.open}
        page={pageDialog.page}
        projectId={projectId}
        rows={rows}
        onClose={() => setPageDialog({ open: false, page: null })}
        onSaved={() => {
          setPageDialog({ open: false, page: null })
          setReloadKey((k) => k + 1)
        }}
      />
      <StagingUrlDialog
        open={stagingOpen}
        projectId={projectId}
        current={project.staging_url}
        onClose={() => setStagingOpen(false)}
        onSaved={() => {
          setStagingOpen(false)
          setReloadKey((k) => k + 1)
        }}
      />
    </main>
  )
}
