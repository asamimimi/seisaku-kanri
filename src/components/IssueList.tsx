import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatMonthDay } from '../lib/date'
import { ISSUE_KIND_LABELS } from '../lib/issues'
import { IssueDialog } from './IssueDialog'
import type { TreeRow } from '../lib/sitemap'
import type { Issue } from '../types'

type Props = {
  projectId: string
  issues: Issue[]
  /** ページ詳細ではそのページのID。案件のタブでは undefined（ページ名を出し、追加時に選ばせる） */
  pageId?: string
  pages?: TreeRow[]
  onSaved: () => void
}

type Tab = 'open' | 'resolved'

/** 指摘・質問の一覧。未対応 / 対応済みを切り替え、チェックで対応済みにする */
export function IssueList({ projectId, issues, pageId, pages, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('open')
  const [dialog, setDialog] = useState<{ open: boolean; issue: Issue | null }>({
    open: false,
    issue: null,
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 未対応は古い順（先に来たものから片付ける）、対応済みは新しく片付けた順
  const open = issues
    .filter((i) => !i.resolved_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const resolved = issues
    .filter((i) => i.resolved_at)
    .sort((a, b) => b.resolved_at!.localeCompare(a.resolved_at!))
  const shown = tab === 'open' ? open : resolved
  const pageName = (id: string | null) =>
    id ? (pages?.find((p) => p.id === id)?.name ?? '（削除されたページ）') : '案件全体'

  const toggleResolved = async (issue: Issue, done: boolean) => {
    setSavingId(issue.id)
    setError(null)
    const { error } = await supabase
      .from('issues')
      .update({ resolved_at: done ? new Date().toISOString() : null })
      .eq('id', issue.id)
    setSavingId(null)
    if (error) {
      setError(`保存できませんでした: ${error.message}`)
      return
    }
    onSaved()
  }

  return (
    <section className="panel" aria-labelledby="issues-heading">
      <div className="panel-header">
        <h2 id="issues-heading" className="panel-title">
          指摘・質問
        </h2>
      </div>
      <div className="panel-body">
        <div className="issue-tabs" role="group" aria-label="表示する指摘・質問">
          <button
            type="button"
            className={`btn ${tab === 'open' ? 'btn-primary' : ''}`}
            aria-pressed={tab === 'open'}
            onClick={() => setTab('open')}
          >
            未対応 {open.length}
          </button>
          <button
            type="button"
            className={`btn ${tab === 'resolved' ? 'btn-primary' : ''}`}
            aria-pressed={tab === 'resolved'}
            onClick={() => setTab('resolved')}
          >
            対応済み {resolved.length}
          </button>
        </div>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {shown.length === 0 && (
          <p className="muted small">
            {tab === 'open' ? '未対応の指摘・質問はありません。' : '対応済みの指摘・質問はまだありません。'}
          </p>
        )}

        <ul className="issues">
          {shown.map((i) => (
            <li key={i.id} className={`issue${i.resolved_at ? ' is-resolved' : ''}`} aria-busy={savingId === i.id}>
              <label className="issue-check">
                <input
                  type="checkbox"
                  checked={!!i.resolved_at}
                  disabled={savingId === i.id}
                  onChange={(e) => void toggleResolved(i, e.target.checked)}
                />
                <span className="visually-hidden">
                  {i.resolved_at ? '未対応に戻す' : '対応済みにする'}: {i.body}
                </span>
              </label>
              <div className="issue-text">
                <div className="issue-line">
                  <span className={`badge badge-${i.kind}`}>{ISSUE_KIND_LABELS[i.kind]}</span>
                  <span className="issue-body">{i.body}</span>
                </div>
                <p className="issue-meta">
                  {pageId === undefined && (
                    <>
                      {i.page_id ? (
                        <Link to={`/projects/${projectId}/pages/${i.page_id}`}>{pageName(i.page_id)}</Link>
                      ) : (
                        pageName(null)
                      )}
                      {' ／ '}
                    </>
                  )}
                  {i.figma_comment_url && (
                    <>
                      <a href={i.figma_comment_url} target="_blank" rel="noreferrer">
                        Figmaコメント
                      </a>
                      {' ／ '}
                    </>
                  )}
                  登録 {formatMonthDay(i.created_at)}
                  {i.resolved_at && ` ／ 対応 ${formatMonthDay(i.resolved_at)}`}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => setDialog({ open: true, issue: i })}
                aria-label={`「${i.body}」を編集`}
              >
                編集
              </button>
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn-add" onClick={() => setDialog({ open: true, issue: null })}>
          ＋ 指摘・質問を追加
        </button>
      </div>

      <IssueDialog
        open={dialog.open}
        issue={dialog.issue}
        projectId={projectId}
        pageId={pageId}
        pages={pages}
        onClose={() => setDialog({ open: false, issue: null })}
        onSaved={() => {
          setDialog({ open: false, issue: null })
          onSaved()
        }}
      />
    </section>
  )
}
