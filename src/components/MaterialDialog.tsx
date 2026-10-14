import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { MATERIAL_STATUS_LABELS } from '../lib/materials'
import type { Material, MaterialStatus } from '../types'

/** 追加なら material は null、編集なら対象の素材 */
type Props = {
  open: boolean
  material: Material | null
  projectId: string
  pageId: string
  nextPosition: number
  onClose: () => void
  onSaved: () => void
}

const STATUSES = Object.keys(MATERIAL_STATUS_LABELS) as MaterialStatus[]

/** 素材の追加・編集・削除をするダイアログ */
export function MaterialDialog({ open, material, projectId, pageId, nextPosition, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [status, setStatus] = useState<MaterialStatus>('temporary')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setName(material?.name ?? '')
      setSourceUrl(material?.source_url ?? '')
      setStatus(material?.status ?? 'temporary')
      setConfirmDelete(false)
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, material])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const values = { name: name.trim(), source_url: sourceUrl.trim() || null, status }
    const { error } = material
      ? await supabase.from('materials').update(values).eq('id', material.id)
      : await supabase
          .from('materials')
          .insert({ ...values, project_id: projectId, page_id: pageId, position: nextPosition })
    setBusy(false)
    if (error) {
      setError(error.code === '23514' ? '購入元URLは http:// か https:// から始まるURLを入れてください' : error.message)
      return
    }
    onSaved()
  }

  const onDelete = async () => {
    if (!material) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('materials').delete().eq('id', material.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="material-dialog-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="material-dialog-title">{material ? '素材を編集' : '素材を追加'}</h2>
        <label className="field">
          <span>素材名（必須）</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="メインビジュアル"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>購入元URL</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://"
          />
        </label>
        <label className="field">
          <span>状態</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as MaterialStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {MATERIAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {confirmDelete ? (
          <div className="delete-confirm">
            <p>「{material?.name}」を削除します。元に戻せません。</p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                やめる
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onDelete()} disabled={busy}>
                削除する
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions">
            {material && (
              <button
                type="button"
                className="btn btn-danger-outline dialog-actions-start"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                削除
              </button>
            )}
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {material ? '保存' : '追加'}
            </button>
          </div>
        )}
      </form>
    </dialog>
  )
}
