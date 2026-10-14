import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import { supabase } from '../lib/supabase'
import { formatDue } from '../lib/date'
import { buildTree, collectDescendantIds, joinUrl, planMove } from '../lib/sitemap'
import type { DropZone, MovePlan, TreeRow } from '../lib/sitemap'
import { IssueList } from '../components/IssueList'
import { ScheduleChart } from '../components/ScheduleChart'
import { ShareDialog } from '../components/ShareDialog'
import { collectDeadlines, today } from '../lib/schedule'
import { PageDialog } from '../components/PageDialog'
import { SitemapRow } from '../components/SitemapRow'
import { StagingUrlDialog } from '../components/StagingUrlDialog'
import type {
  Issue,
  PageSchedule,
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
  issues: Issue[]
  schedules: PageSchedule[]
}

type DropState = { targetId: string; zone: DropZone; plan: MovePlan | null }

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
  // タブ（サイトマップ / 指摘・質問）は URL の ?tab= で持つ（再読み込みやリンクでも同じタブが開く）
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const view = tabParam === 'issues' || tabParam === 'schedule' ? tabParam : 'sitemap'
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
  const [shareOpen, setShareOpen] = useState(false)

  // ドラッグ中のページと、いま落とすとどうなるか
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDropState] = useState<DropState | null>(null)
  const dropRef = useRef<DropState | null>(null) // ドラッグのイベントの中で最新の値を読むため
  const setDrop = (next: DropState | null) => {
    dropRef.current = next
    setDropState(next)
  }

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
      supabase
        .from('issues')
        .select('id, page_id, kind, body, figma_comment_url, resolved_at, created_at, author_name')
        .eq('project_id', projectId),
      supabase
        .from('page_schedules')
        .select('page_id, stage, start_date, due_date')
        .eq('project_id', projectId),
    ]).then(([project, pages, phases, statuses, issues, schedules]) => {
      if (cancelled) return
      const failed = project.error ?? pages.error ?? phases.error ?? statuses.error ?? issues.error ?? schedules.error
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
        issues: issues.data as Issue[],
        schedules: schedules.data as PageSchedule[],
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

  // 絞り込み中は親や兄弟が隠れていて置き場所が分かりにくいので、並び替えは「すべて」のときだけ
  const canReorder = filter === 'all' && !phaseFilter && savingId === null
  const dragSubtree = useMemo(
    () => (dragId ? collectDescendantIds(rows, dragId) : new Set<string>()),
    [rows, dragId],
  )

  /** ポインタの高さから、対象の行の上側1/4は「前」、下側1/4は「後ろ」、真ん中は「子」にする */
  const updateDrop = (target: { id: string | number; element?: Element } | null, y: number) => {
    const rect = target?.element?.getBoundingClientRect()
    if (!dragId || !target || !rect) {
      if (dropRef.current) setDrop(null)
      return
    }
    const ratio = (y - rect.top) / rect.height
    const zone: DropZone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
    const targetId = String(target.id)
    if (dropRef.current?.targetId === targetId && dropRef.current.zone === zone) return
    setDrop({ targetId, zone, plan: planMove(rows, dragId, targetId, zone) })
  }

  /** 並び替え・階層の変更を保存する。先に画面へ反映し、失敗したら読み直して元に戻す */
  const move = async (dragged: string, plan: MovePlan) => {
    setData((d) =>
      d && {
        ...d,
        pages: d.pages.map((p) => {
          const u = plan.updates.find((x) => x.id === p.id)
          return u ? { ...p, parent_id: u.parent_id, position: u.position } : p
        }),
      },
    )
    setSavingId(dragged)
    setActionError(null)
    const results = await Promise.all(
      plan.updates.map((u) =>
        supabase.from('pages').update({ parent_id: u.parent_id, position: u.position }).eq('id', u.id),
      ),
    )
    setSavingId(null)
    const failed = results.find((r) => r.error)?.error
    if (failed) {
      setActionError(
        failed.code === '23514'
          ? '移動できません: ページを自分の子孫の下には移動できません'
          : `移動できませんでした: ${failed.message}`,
      )
    }
    setReloadKey((k) => k + 1)
  }

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
  const openIssues = data.issues.filter((i) => !i.resolved_at).length
  const overdueCount = collectDeadlines(rows, data.schedules, today()).overdue.length
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
        <div className="title-actions">
          <button className="btn btn-outline" onClick={() => setShareOpen(true)}>
            共有リンク
          </button>
          <button className="btn btn-primary" onClick={() => setPageDialog({ open: true, page: null })}>
            ＋ ページを追加
          </button>
        </div>
      </div>

      <nav className="tabs" aria-label="案件の表示">
        <Link
          to={`/projects/${projectId}`}
          className="tab"
          aria-current={view === 'sitemap' ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault()
            setSearchParams({})
          }}
        >
          サイトマップ
        </Link>
        <Link
          to={`/projects/${projectId}?tab=issues`}
          className="tab"
          aria-current={view === 'issues' ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault()
            setSearchParams({ tab: 'issues' })
          }}
        >
          指摘・質問
          {openIssues > 0 && <span className="tab-count">{openIssues}</span>}
        </Link>
        <Link
          to={`/projects/${projectId}?tab=schedule`}
          className="tab"
          aria-current={view === 'schedule' ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault()
            setSearchParams({ tab: 'schedule' })
          }}
        >
          スケジュール
          {overdueCount > 0 && (
            <span className="tab-count tab-count-danger" aria-label={`期限切れ ${overdueCount}件`}>
              {overdueCount}
            </span>
          )}
        </Link>
      </nav>

      {view === 'schedule' ? (
        <ScheduleChart
          projectId={projectId}
          rows={rows}
          schedules={data.schedules}
          projectDue={project.due_date}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      ) : view === 'issues' ? (
        <IssueList
          projectId={projectId}
          issues={data.issues}
          pages={rows}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <>
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

        <p className="visually-hidden" aria-live="polite">
          {dragId ? (drop?.plan?.label ?? 'ここには置けません') : ''}
        </p>
        {(filter !== 'all' || phaseFilter) && (
          <p className="muted small">
            絞り込み中は並び替えできません。「すべて」に戻すと、左端のつまみでドラッグできます。
          </p>
        )}

        <DragDropProvider
          onDragStart={(event) => {
            setDragId(String(event.operation.source?.id))
            setDrop(null)
          }}
          onDragOver={(event) => {
            updateDrop(event.operation.target, event.operation.position.current.y)
          }}
          onDragMove={(event) => {
            // move イベントの時点では position はまだ前の値なので、これから動く先で計算する
            const { position, target } = event.operation
            const y = event.to?.y ?? position.current.y + (event.by?.y ?? 0)
            updateDrop(target, y)
          }}
          onDragEnd={(event) => {
            const dragged = event.operation.source?.id
            const plan = dropRef.current?.plan
            setDragId(null)
            setDrop(null)
            if (event.canceled || !dragged || !plan) return
            void move(String(dragged), plan)
          }}
        >
          <div className="table-wrap">
            <table className="sitemap">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">並び替え</span>
                  </th>
                  <th scope="col">ページ名</th>
                  <th scope="col">URL</th>
                  <th scope="col">① 制作フェーズ</th>
                  <th scope="col">② 確認状況</th>
                  <th scope="col">素材</th>
                  <th scope="col">指摘</th>
                  <th scope="col">
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <SitemapRow
                    key={r.id}
                    row={r}
                    href={joinUrl(project.staging_url, r.url_path)}
                    phases={phases}
                    phaseTone={phaseTone(r.phase_id)}
                    points={statusesByPage.get(r.id) ?? []}
                    busy={savingId === r.id}
                    dragDisabled={!canReorder}
                    dropDisabled={dragSubtree.has(r.id)}
                    dropZone={drop?.targetId === r.id && drop.plan ? drop.zone : null}
                    isSource={dragId === r.id}
                    onChangePhase={(phaseId) => changePhase(r, phaseId)}
                    onChangeStatus={(pointId, status) => changeStatus(r, pointId, status)}
                    onEdit={() => setPageDialog({ open: true, page: r })}
                  />
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="muted table-empty">まだページがありません。「＋ ページを追加」から始めましょう。</p>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <p className="muted table-empty">条件に合うページはありません。</p>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {(source) => (
              <div className="drag-overlay">
                {rows.find((r) => r.id === source.id)?.name}
                {drop?.plan && <span className="drag-overlay-hint">{drop.plan.label}</span>}
              </div>
            )}
          </DragOverlay>
        </DragDropProvider>

        <p className="muted small sitemap-note">
          ①制作フェーズ（自分の作業）と②確認状況（クライアントの返事）は別々に動かせます。
          確認待ち・修正対応中のまま先のフェーズへ進んだページには「▲先行着手」が付きます。
        </p>
        </>
      )}

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
      <ShareDialog open={shareOpen} projectId={projectId} onClose={() => setShareOpen(false)} />
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
