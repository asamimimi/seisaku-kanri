import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  project: { id: string; name: string } | null
  onClose: () => void
  onDeleted: () => void
}

/**
 * 案件を削除するダイアログ。元に戻せないので、案件名を入れたときだけ削除できる。
 * ページ・確認状況・素材・指摘・スケジュール・共有リンクも、外部キーの on delete cascade で一緒に消える。
 */
export function DeleteProjectDialog({ project, onClose, onDeleted }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (project && !dialog.open) {
      setTyped('')
      setError(null)
      dialog.showModal()
    }
    if (!project && dialog.open) dialog.close()
  }, [project])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!project || typed !== project.name) return
    setBusy(true)
    setError(null)
    // RLS で削除できない（owner でない）ときはエラーにならず0件になるので、消えた行を受け取って確かめる
    const { data, error } = await supabase.from('projects').delete().eq('id', project.id).select('id')
    setBusy(false)
    if (error) return setError(error.message)
    if (!data || data.length === 0) {
      return setError('削除できませんでした。案件を削除できるのは、案件を作った人（owner）だけです。')
    }
    onDeleted()
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="delete-project-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="delete-project-title">案件を削除</h2>
        <div className="delete-confirm">
          <p>
            「<strong>{project?.name}</strong>」を削除します。
            ページ・確認状況・仕様メモ・素材・指摘・スケジュール・共有リンクもすべて消え、
            <strong>元に戻せません。</strong>
          </p>
        </div>
        <label className="field">
          <span>確認のため、案件名を入力してください</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={project?.name}
            autoComplete="off"
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            やめる
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy || typed !== project?.name}>
            {busy ? '削除中…' : '削除する'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
