import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { daysSince, formatMonthDay } from '../lib/date'
import { STATUS_LABELS, joinUrl } from '../lib/sitemap'
import { IssueList } from '../components/IssueList'
import { MaterialList } from '../components/MaterialList'
import { SpecMemo } from '../components/SpecMemo'
import type {
  ConfirmationStatus,
  Issue,
  Material,
  PageConfirmationStatus,
  PageOverview,
  Phase,
  Project,
} from '../types'

type Data = {
  project: Project
  pages: PageOverview[] // パンくず・親ページ名に使う（案件のページ全部）
  phases: Phase[]
  points: PageConfirmationStatus[]
  gates: Map<string, string> // 確認ポイントID → ゲートのフェーズID
  spec: { spec_memo: string; figma_url: string | null } | null // ビューに無い列（仕様メモ・Figmaリンク）
  materials: Material[]
  issues: Issue[]
}

const STATUSES = Object.keys(STATUS_LABELS) as ConfirmationStatus[]

/** ページ詳細画面（①制作フェーズと②確認状況） */
export default function PageDetail() {
  const { projectId = '', pageId = '' } = useParams()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0) // 増やすと読み直す
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
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
      supabase.from('page_confirmation_status').select('*').eq('page_id', pageId),
      supabase.from('confirmation_points').select('id, gate_phase_id').eq('project_id', projectId),
      supabase.from('pages').select('spec_memo, figma_url').eq('id', pageId).maybeSingle(),
      supabase
        .from('materials')
        .select('id, page_id, name, source_url, status, position')
        .eq('page_id', pageId)
        .order('position'),
      supabase
        .from('issues')
        .select('id, page_id, kind, body, figma_comment_url, resolved_at, created_at, author_name')
        .eq('page_id', pageId),
    ]).then(([project, pages, phases, points, gates, spec, materials, issues]) => {
      if (cancelled) return
      const failed =
        project.error ??
        pages.error ??
        phases.error ??
        points.error ??
        gates.error ??
        spec.error ??
        materials.error ??
        issues.error
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
        points: (points.data as PageConfirmationStatus[]).sort(
          (a, b) => a.point_position - b.point_position,
        ),
        gates: new Map(
          (gates.data as { id: string; gate_phase_id: string }[]).map((g) => [g.id, g.gate_phase_id]),
        ),
        spec: spec.data,
        materials: materials.data as Material[],
        issues: issues.data as Issue[],
      })
    })
    return () => {
      cancelled = true
    }
  }, [projectId, pageId, reloadKey])

  /** 書き込み → 失敗したら表示、成功したら読み直す（先行着手はビューで再計算されるため） */
  const save = async (write: () => PromiseLike<{ error: { message: string } | null }>) => {
    setSaving(true)
    setActionError(null)
    const { error } = await write()
    setSaving(false)
    if (error) {
      setActionError(`保存できませんでした: ${error.message}`)
      return
    }
    setReloadKey((k) => k + 1)
  }

  const changePhase = (phaseId: string) =>
    void save(() => supabase.from('pages').update({ phase_id: phaseId }).eq('id', pageId))

  const changeStatus = (pointId: string, status: ConfirmationStatus) =>
    void save(() =>
      // 行がまだ無い（未依頼）こともあるので upsert。依頼日・OK日はDBのトリガーが記録する。
      supabase.from('page_confirmations').upsert(
        { page_id: pageId, confirmation_point_id: pointId, project_id: projectId, status },
        { onConflict: 'page_id,confirmation_point_id' },
      ),
    )

  const page = data?.pages.find((p) => p.id === pageId)

  if (error || (data && !page)) {
    return (
      <main className="page">
        <p className="breadcrumb">
          <Link to="/">案件</Link>
          {data && (
            <>
              {' ／ '}
              <Link to={`/projects/${projectId}`}>{data.project.name}</Link>
            </>
          )}
        </p>
        <p role="alert" className="error">
          {error
            ? `読み込めませんでした: ${error}`
            : 'ページが見つかりません。削除された可能性があります。'}
        </p>
      </main>
    )
  }
  if (!data || !page) return <p className="status">読み込み中…</p>

  const { project, pages, phases, points, gates, spec, materials, issues } = data
  const reload = () => setReloadKey((k) => k + 1)
  const phaseIndex = phases.findIndex((p) => p.id === page.phase_id)
  const nextPhase = phases[phaseIndex + 1]
  const phaseName = (id: string | undefined) => phases.find((p) => p.id === id)?.name ?? ''

  // 親をたどってパンくずを作る（万一輪になっていても止まるよう、訪問済みを記録する）
  const ancestors: PageOverview[] = []
  const seen = new Set([page.id])
  for (let p = pages.find((x) => x.id === page.parent_id); p && !seen.has(p.id); ) {
    seen.add(p.id)
    ancestors.unshift(p)
    p = pages.find((x) => x.id === p!.parent_id)
  }
  const parent = ancestors[ancestors.length - 1]
  const aheadPoints = points.filter((p) => p.is_ahead)
  const lastPointId = points[points.length - 1]?.confirmation_point_id
  const stagingHref = joinUrl(project.staging_url, page.url_path)

  return (
    <main className="page">
      <p className="breadcrumb">
        <Link to="/">案件</Link> ／ <Link to={`/projects/${projectId}`}>{project.name}</Link>
        {ancestors.map((a) => ` ／ ${a.name}`).join('')} ／ {page.name}
      </p>

      <div className="title-row detail-title-row">
        <div>
          <h1>{page.name}</h1>
          <p className="muted small detail-meta">
            {page.url_path ?? 'URL未設定'} ／ 親: {parent?.name ?? 'なし（一番上）'}
          </p>
        </div>
        <div className="phase-control">
          <label htmlFor="detail-phase" className="muted">
            制作フェーズ
          </label>
          <select
            id="detail-phase"
            className={`phase-select tone-${Math.min(Math.max(phaseIndex, 0), 4)}`}
            value={page.phase_id}
            disabled={saving}
            onChange={(e) => changePhase(e.target.value)}
          >
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {nextPhase && (
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={() => changePhase(nextPhase.id)}
            >
              次へ：{nextPhase.name} ▸
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}

      {aheadPoints.length > 0 && (
        <div className="ahead-banner" role="status">
          <strong className="ahead-banner-title">▲ 先行着手</strong>
          <ul className="ahead-banner-list">
            {aheadPoints.map((p) => (
              <li key={p.confirmation_point_id}>
                {p.status === 'waiting'
                  ? `${p.point_name}がOK前に、「${phaseName(gates.get(p.confirmation_point_id))}」へ進んでいます。OKが出たら印が消えます。修正が出たら、確認状況を「修正対応中」にします。`
                  : `${p.point_name}の修正対応中に、「${phaseName(gates.get(p.confirmation_point_id))}」へ進んでいます。修正を出して再確認を依頼したら「確認待ち」に、OKが出たら「OK」にします。`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="detail-section" aria-labelledby="phase-heading">
        <h2 id="phase-heading" className="detail-section-title">
          ① 制作フェーズ（自分の作業）
        </h2>
        <ol className="phase-steps">
          {phases.map((p, i) => {
            const state = i < phaseIndex ? 'done' : i === phaseIndex ? 'current' : 'todo'
            return (
              <li key={p.id} className={`phase-step phase-step-${state}`}>
                <span aria-current={state === 'current' ? 'step' : undefined}>
                  {state === 'done' && '✓ '}
                  {p.name}
                  {state === 'current' && '（現在）'}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="detail-section" aria-labelledby="confirm-heading">
        <h2 id="confirm-heading" className="detail-section-title">
          ② 確認状況（クライアント）
        </h2>
        {points.length === 0 && <p className="muted small">確認ポイントがありません。</p>}
        <div className="checkpoints">
          {points.map((p) => (
            <div key={p.confirmation_point_id} className={`checkpoint checkpoint-${p.status}`}>
              <label className="checkpoint-name" htmlFor={`point-${p.confirmation_point_id}`}>
                {p.point_name}
                {p.is_ahead && <span className="badge badge-ahead">▲先行着手</span>}
              </label>
              <select
                id={`point-${p.confirmation_point_id}`}
                className={`status-select status-${p.status}`}
                value={p.status}
                disabled={saving}
                onChange={(e) =>
                  changeStatus(p.confirmation_point_id, e.target.value as ConfirmationStatus)
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'ok' ? '✓ OK' : STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <CheckpointDates point={p} />
              {/* 最後の確認ポイント（最終確認）はテスト環境で見てもらうので、URLを出す */}
              {p.confirmation_point_id === lastPointId && (
                <p className="checkpoint-meta">
                  テスト環境URL:{' '}
                  {stagingHref ? (
                    <a href={stagingHref} target="_blank" rel="noreferrer">
                      {stagingHref}
                    </a>
                  ) : project.staging_url ? (
                    'このページのURLが未設定です'
                  ) : (
                    <>
                      未設定（<Link to={`/projects/${projectId}`}>サイトマップ</Link>で設定できます）
                    </>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="detail-columns">
        <SpecMemo
          key={page.id}
          pageId={page.id}
          memo={spec?.spec_memo ?? ''}
          figmaUrl={spec?.figma_url ?? null}
          onSaved={reload}
        />
        <div className="detail-side">
          <MaterialList
            projectId={projectId}
            pageId={page.id}
            materials={materials}
            onSaved={reload}
          />
          <IssueList projectId={projectId} pageId={page.id} issues={issues} onSaved={reload} />
        </div>
      </div>
    </main>
  )
}

/** 確認カードの日付。確認待ち・修正対応中は経過日数、OKはOK日を出す */
function CheckpointDates({ point }: { point: PageConfirmationStatus }) {
  const parts: string[] = []
  const open = point.status === 'waiting' || point.status === 'revising'
  // 未依頼・確認不要に戻しても requested_at は残るので、依頼中とOKのときだけ出す
  if (point.requested_at && (open || point.status === 'ok')) {
    parts.push(`依頼日 ${formatMonthDay(point.requested_at)}`)
  }
  if (open && point.requested_at) parts.push(`経過 ${daysSince(point.requested_at)}日`)
  if (point.status === 'ok' && point.resolved_at) {
    parts.push(`OK日 ${formatMonthDay(point.resolved_at)}`)
  }
  if (parts.length === 0) return null
  return <p className="checkpoint-meta">{parts.join(' ／ ')}</p>
}
