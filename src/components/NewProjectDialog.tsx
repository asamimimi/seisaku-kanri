import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewProjectDialog({ open, onClose, onCreated }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setName('')
      setClient('')
      setDue('')
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // owner_id はDB側で自動的にログイン中のユーザーになる。
    // フェーズと確認ポイントの初期データも、DBのトリガーが作る。
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      client_name: client.trim() || null,
      due_date: due || null,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="new-project-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="new-project-title">案件を作成</h2>
        <label className="field">
          <span>案件名（必須）</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>クライアント名</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} />
        </label>
        <label className="field">
          <span>納期</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ''}>
            {busy ? '作成中…' : '作成'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
