import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { collectDescendantIds } from '../lib/sitemap'
import type { TreeRow } from '../lib/sitemap'

/** 追加なら page は null、編集なら対象のページ */
type Props = {
  open: boolean
  page: TreeRow | null
  projectId: string
  rows: TreeRow[]
  onClose: () => void
  onSaved: () => void
}

/** ページの追加・編集・削除をするダイアログ */
export function PageDialog({ open, page, projectId, rows, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [urlPath, setUrlPath] = useState('')
  const [parentId, setParentId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setName(page?.name ?? '')
      setUrlPath(page?.url_path ?? '')
      setParentId(page?.parent_id ?? '')
      setConfirmDelete(false)
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, page])

  // 編集中のページとその子孫は、親に選べない（親子が輪になるため。DB側でもトリガーで拒否する）
  const descendants = page ? collectDescendantIds(rows, page.id) : new Set<string>()
  const parentOptions = rows.filter((r) => !descendants.has(r.id))
  const childCount = descendants.size > 0 ? descendants.size - 1 : 0

  /** 新しい親の子の中で一番後ろに置くための position */
  const nextPosition = (parent: string | null) => {
    const siblings = rows.filter((r) => r.parent_id === parent && r.id !== page?.id)
    return siblings.reduce((max, r) => Math.max(max, r.position), 0) + 1
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const parent = parentId || null
    const values = { name: name.trim(), url_path: urlPath.trim() || null, parent_id: parent }
    // 制作フェーズは送らない。追加時はDBのトリガーが最初のフェーズにする。
    const { error } = page
      ? await supabase
          .from('pages')
          .update(
            parent === page.parent_id ? values : { ...values, position: nextPosition(parent) },
          )
          .eq('id', page.id)
      : await supabase
          .from('pages')
          .insert({ ...values, project_id: projectId, position: nextPosition(parent) })
    setBusy(false)
    if (error) {
      setError(
        error.code === '23514' && page && parent !== page.parent_id
          ? 'ページを自分の子孫の下には移動できません'
          : error.message,
      )
      return
    }
    onSaved()
  }

  const onDelete = async () => {
    if (!page) return
    setBusy(true)
    setError(null)
    // 子ページは外部キーの on delete cascade で一緒に消える
    const { error } = await supabase.from('pages').delete().eq('id', page.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="page-dialog-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="page-dialog-title">{page ? 'ページを編集' : 'ページを追加'}</h2>
        <label className="field">
          <span>ページ名（必須）</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>URL</span>
          <input
            value={urlPath}
            onChange={(e) => setUrlPath(e.target.value)}
            placeholder="/about/"
          />
        </label>
        <label className="field">
          <span>親ページ</span>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">なし（一番上）</option>
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {'　'.repeat(r.depth)}
                {r.name}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {page && confirmDelete ? (
          <div className="delete-confirm" role="group" aria-label="削除の確認">
            <p>
              「{page.name}」を削除します。
              {childCount > 0 && <strong>子ページ{childCount}件も一緒に消えます。</strong>}
              元に戻せません。
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                やめる
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                {busy ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions">
            {page && (
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
            <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ''}>
              {busy ? '保存中…' : page ? '保存' : '追加'}
            </button>
          </div>
        )}
      </form>
    </dialog>
  )
}
