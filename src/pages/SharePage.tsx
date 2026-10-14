import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { APP_NAME } from '../lib/config'
import { formatDue } from '../lib/date'
import { ISSUE_KIND_LABELS } from '../lib/issues'
import { STATUS_LABELS, buildTree, joinUrl } from '../lib/sitemap'
import { ScheduleChart } from '../components/ScheduleChart'
import type { IssueKind, PageOverview, SharedProject } from '../types'

const NAME_KEY = 'share-author-name' // 次に送るときのために、名前だけブラウザに覚えておく

/**
 * クライアント向けの共有画面（/share/:token）。ログインなしで開ける。
 * データは get_shared_project 関数から受け取り、見せてよい項目しか届かない。
 */
export default function SharePage() {
  const { token = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('tab') === 'schedule' ? 'schedule' : 'sitemap'
  const [data, setData] = useState<SharedProject | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('get_shared_project', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return
      if (error) return setState('error')
      if (!data) return setState('invalid')
      setData(data as SharedProject)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  // ツリー表示やスケジュールの部品は PageOverview の形を使うので、足りない列を埋める
  const rows = useMemo(() => {
    if (!data) return []
    const pages: PageOverview[] = data.pages.map((p) => {
      const phase = data.phases.find((ph) => ph.id === p.phase_id)
      return {
        ...p,
        project_id: '',
        phase_name: phase?.name ?? '',
        phase_position: phase?.position ?? 0,
        stage: phase?.stage ?? 'design',
        waiting_count: 0,
        revising_count: 0,
        ahead_count: 0,
        materials_count: 0,
        materials_temporary_count: 0,
        open_issues_count: 0,
      }
    })
    return buildTree(pages)
  }, [data])

  useEffect(() => {
    if (data) document.title = `${data.project.name} ｜ ${APP_NAME}`
  }, [data])

  if (state === 'loading') return <p className="status">読み込み中…</p>
  if (state !== 'ready' || !data) {
    return (
      <main className="page">
        <h1>{APP_NAME}</h1>
        <p role="alert" className="error">
          {state === 'invalid'
            ? 'この共有リンクは無効です。リンクが新しくなっていないか、制作担当者に確認してください。'
            : '読み込めませんでした。時間をおいてもう一度開いてください。'}
        </p>
      </main>
    )
  }

  const { project, phases, confirmations } = data
  const phaseIndex = (id: string) =>
    Math.min(Math.max(phases.findIndex((p) => p.id === id), 0), 4)

  return (
    <>
      <header className="header">
        <strong className="header-title">{APP_NAME}</strong>
        <span className="header-spacer" />
        <span className="header-user">共有ページ（閲覧用）</span>
      </header>
      <main className="page">
        <div className="title-row">
          <div>
            <h1>{project.name}</h1>
            <p className="muted small project-meta">
              {project.client_name && <span>{project.client_name} 様</span>}
              <span>{formatDue(project.due_date)}</span>
              <span>全 {rows.length} ページ</span>
            </p>
          </div>
        </div>

        <nav className="tabs" aria-label="表示の切り替え">
          <a
            href="?"
            className="tab"
            aria-current={view === 'sitemap' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              setSearchParams({})
            }}
          >
            サイトマップ・確認状況
          </a>
          <a
            href="?tab=schedule"
            className="tab"
            aria-current={view === 'schedule' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              setSearchParams({ tab: 'schedule' })
            }}
          >
            スケジュール
          </a>
        </nav>

        {view === 'schedule' ? (
          <ScheduleChart
            projectId=""
            rows={rows}
            schedules={data.schedules}
            projectDue={project.due_date}
            readOnly
          />
        ) : (
          <div className="table-wrap">
            <table className="sitemap share-sitemap">
              <thead>
                <tr>
                  <th scope="col">ページ名</th>
                  <th scope="col">URL</th>
                  <th scope="col">制作の状況</th>
                  <th scope="col">ご確認の状況</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = joinUrl(project.staging_url, r.url_path)
                  const points = confirmations
                    .filter((c) => c.page_id === r.id)
                    .sort((a, b) => a.point_position - b.point_position)
                  return (
                    <tr key={r.id}>
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
                        <span className={`phase-chip tone-${phaseIndex(r.phase_id)}`}>{r.phase_name}</span>
                      </td>
                      <td>
                        <ul className="share-points">
                          {points.map((p) => (
                            <li key={p.point_name} className={`share-point status-${p.status}`}>
                              {p.point_name}：{p.status === 'ok' ? '✓ OK' : STATUS_LABELS[p.status]}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted table-empty">まだページがありません。</p>}
          </div>
        )}

        <CommentForm token={token} rows={rows} />
      </main>
    </>
  )
}

/** フォームの1件分（対象のページ・種類・内容） */
type Item = { key: number; pageId: string; kind: IssueKind; body: string; error?: string }

const MAX_ITEMS = 20 // 一度に送れる件数

let nextKey = 1
const newItem = (): Item => ({ key: nextKey++, pageId: '', kind: 'fix', body: '' })

/** クライアントからのコメント（修正のご依頼・ご質問）を送るフォーム。何件かまとめて送れる */
function CommentForm({ token, rows }: { token: string; rows: ReturnType<typeof buildTree> }) {
  const [author, setAuthor] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [items, setItems] = useState<Item[]>(() => [newItem()])
  const [busy, setBusy] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const update = (key: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch, error: undefined } : it)))

  const filled = items.filter((it) => it.body.trim())

  /** 上から1件ずつ送る。送れたものはフォームから消し、失敗したものだけを残す */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSentCount(0)
    let sent = 0
    const left: Item[] = []
    for (const it of items) {
      if (!it.body.trim()) continue // 空の欄は送らずに消す
      const { error } = await supabase.rpc('post_shared_comment', {
        p_token: token,
        p_page_id: it.pageId || null,
        p_kind: it.kind,
        p_body: it.body,
        p_author: author,
      })
      if (error) left.push({ ...it, error: error.message })
      else sent++
    }
    setBusy(false)
    setSentCount(sent)
    setItems(left.length ? left : [newItem()])
    if (left.length) setError(`${left.length}件を送信できませんでした。内容を確かめて、もう一度送信してください。`)
    if (sent > 0) {
      try {
        localStorage.setItem(NAME_KEY, author.trim())
      } catch {
        // 覚えられなくても送信はできているので何もしない
      }
    }
  }

  return (
    <section className="panel share-comment" aria-labelledby="comment-heading">
      <div className="panel-header">
        <h2 id="comment-heading" className="panel-title">
          ご意見・ご質問を送る
        </h2>
      </div>
      <form className="panel-body" onSubmit={(e) => void onSubmit(e)}>
        <label className="field share-author">
          <span>お名前（必須）</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={50} required />
        </label>

        <ol className="share-items">
          {items.map((it, index) => (
            <li key={it.key} className="share-item">
              <fieldset>
                <legend className="share-item-title">
                  {index + 1}件目
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="link-button share-item-remove"
                      onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                      disabled={busy}
                    >
                      この件を削除
                    </button>
                  )}
                </legend>
                <div className="share-comment-row">
                  <fieldset className="field kind-field">
                    <legend>種類</legend>
                    {(Object.keys(ISSUE_KIND_LABELS) as IssueKind[]).map((k) => (
                      <label key={k} className="kind-option">
                        <input
                          type="radio"
                          name={`share-kind-${it.key}`}
                          checked={it.kind === k}
                          onChange={() => update(it.key, { kind: k })}
                        />
                        {k === 'fix' ? '修正のご依頼' : 'ご質問'}
                      </label>
                    ))}
                  </fieldset>
                  <label className="field">
                    <span>対象のページ</span>
                    <select value={it.pageId} onChange={(e) => update(it.key, { pageId: e.target.value })}>
                      <option value="">サイト全体・その他</option>
                      {rows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {'　'.repeat(r.depth)}
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>内容</span>
                  <textarea
                    value={it.body}
                    onChange={(e) => update(it.key, { body: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    aria-invalid={it.error ? true : undefined}
                  />
                </label>
                {it.error && (
                  <p className="error small">送信できませんでした: {it.error}</p>
                )}
              </fieldset>
            </li>
          ))}
        </ol>

        {items.length < MAX_ITEMS && (
          <button
            type="button"
            className="btn btn-add"
            onClick={() => setItems((list) => [...list, newItem()])}
            disabled={busy}
          >
            ＋ もう1件追加
          </button>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {sentCount > 0 && (
          <p role="status" className="share-sent">
            {sentCount}件を送信しました。ありがとうございます。制作担当者が確認してご連絡します。
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !author.trim() || filled.length === 0}
          >
            {busy ? '送信中…' : filled.length > 1 ? `${filled.length}件をまとめて送信` : '送信する'}
          </button>
        </div>
      </form>
    </section>
  )
}
