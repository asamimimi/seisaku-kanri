import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  open: boolean
  projectId: string
  current: string | null
  onClose: () => void
  onSaved: () => void
}

/** 案件のテスト環境URLを設定するダイアログ。空にすると未設定に戻る。 */
export function StagingUrlDialog({ open, projectId, current, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setUrl(current ?? '')
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, current])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('projects')
      .update({ staging_url: url.trim() || null })
      .eq('id', projectId)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="staging-url-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="staging-url-title">テスト環境URL</h2>
        <label className="field">
          <span>URL（https:// から）</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://stg.example.com"
            pattern="https?://.*"
            autoFocus
          />
        </label>
        <p className="muted small">各ページのURL（/about/ など）とつなげてリンクにします。</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
