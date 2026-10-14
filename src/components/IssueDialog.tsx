import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ISSUE_KIND_LABELS } from '../lib/issues'
import type { TreeRow } from '../lib/sitemap'
import type { Issue, IssueKind } from '../types'

/** 追加なら issue は null、編集なら対象の指摘・質問 */
type Props = {
  open: boolean
  issue: Issue | null
  projectId: string
  /** ページ詳細から開くときのページ。案件のタブから開くときは undefined にして、pages から選ばせる */
  pageId?: string
  pages?: TreeRow[]
  onClose: () => void
  onSaved: () => void
}

const KINDS = Object.keys(ISSUE_KIND_LABELS) as IssueKind[]

/** 指摘・質問の追加・編集・削除をするダイアログ */
export function IssueDialog({ open, issue, projectId, pageId, pages, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState<IssueKind>('fix')
  const [body, setBody] = useState('')
  const [figmaUrl, setFigmaUrl] = useState('')
  const [targetPage, setTargetPage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setKind(issue?.kind ?? 'fix')
      setBody(issue?.body ?? '')
      setFigmaUrl(issue?.figma_comment_url ?? '')
      setTargetPage(issue?.page_id ?? '')
      setConfirmDelete(false)
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, issue])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const values = {
      kind,
      body: body.trim(),
      figma_comment_url: figmaUrl.trim() || null,
      // ページ詳細からはそのページに固定。案件のタブからは選んだページ（空なら案件全体）
      page_id: pageId ?? (targetPage || null),
    }
    const { error } = issue
      ? await supabase.from('issues').update(values).eq('id', issue.id)
      : await supabase.from('issues').insert({ ...values, project_id: projectId })
    setBusy(false)
    if (error) {
      setError(
        error.code === '23514'
          ? 'Figmaコメントのリンクは https:// から始まるURLを入れてください'
          : error.message,
      )
      return
    }
    onSaved()
  }

  const onDelete = async () => {
    if (!issue) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('issues').delete().eq('id', issue.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="issue-dialog-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="issue-dialog-title">{issue ? '指摘・質問を編集' : '指摘・質問を追加'}</h2>
        <fieldset className="field kind-field">
          <legend>種類</legend>
          {KINDS.map((k) => (
            <label key={k} className="kind-option">
              <input
                type="radio"
                name="issue-kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {ISSUE_KIND_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>内容（必須）</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            autoFocus
            placeholder="メインビジュアルの文字をもう少し大きく"
          />
        </label>
        <label className="field">
          <span>Figmaコメントのリンク</span>
          <input
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/…"
            pattern="https://.*"
          />
        </label>
        {pageId === undefined && pages && (
          <label className="field">
            <span>ページ</span>
            <select value={targetPage} onChange={(e) => setTargetPage(e.target.value)}>
              <option value="">案件全体</option>
              {pages.map((r) => (
                <option key={r.id} value={r.id}>
                  {'　'.repeat(r.depth)}
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {issue && confirmDelete ? (
          <div className="delete-confirm" role="group" aria-label="削除の確認">
            <p>この{ISSUE_KIND_LABELS[issue.kind]}を削除します。元に戻せません。</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
                やめる
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onDelete()} disabled={busy}>
                {busy ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions">
            {issue && (
              <button
                type="button"
                className="btn btn-outline btn-danger-outline dialog-actions-start"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                削除
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || body.trim() === ''}>
              {busy ? '保存中…' : issue ? '保存' : '追加'}
            </button>
          </div>
        )}
      </form>
    </dialog>
  )
}
