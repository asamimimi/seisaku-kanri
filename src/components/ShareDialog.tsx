import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  open: boolean
  projectId: string
  onClose: () => void
}

/** 共有リンクの作成・コピー・作り直し・無効化をするダイアログ */
export function ShareDialog({ open, projectId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  // 無効にする・作り直すの確認中か（どちらも今のリンクが開けなくなる）
  const [confirm, setConfirm] = useState<'revoke' | 'recreate' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setLoaded(false)
      setCopied(false)
      setConfirm(null)
      setError(null)
      dialog.showModal()
      void supabase
        .from('project_shares')
        .select('token')
        .eq('project_id', projectId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) setError(error.message)
          setToken(data?.token ?? null)
          setLoaded(true)
        })
    }
    if (!open && dialog.open) dialog.close()
  }, [open, projectId])

  const url = token ? `${window.location.origin}/share/${token}` : null

  const create = async () => {
    setBusy(true)
    setError(null)
    // トークンはDBが乱数で作る
    const { data, error } = await supabase
      .from('project_shares')
      .insert({ project_id: projectId })
      .select('token')
      .single()
    setBusy(false)
    if (error) return setError(error.message)
    setToken(data.token)
    setCopied(false)
  }

  /** 無効にする（作り直すときは、無効にしてから新しく作る。古いリンクはもう開けない） */
  const revoke = async (recreate: boolean) => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('project_shares').delete().eq('project_id', projectId)
    setBusy(false)
    if (error) return setError(error.message)
    setToken(null)
    setConfirm(null)
    if (recreate) await create()
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('コピーできませんでした。URLを選んでコピーしてください。')
    }
  }

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="share-dialog-title">
      <h2 id="share-dialog-title">クライアントへの共有リンク</h2>
      <p className="muted small">
        リンクを知っている人は、ログインなしでサイトマップ・確認状況・スケジュールを見て、コメントを送れます。
        仕様メモ・素材・指摘の一覧・▲先行着手は見えません。
      </p>

      {!loaded ? (
        <p className="muted">読み込み中…</p>
      ) : url ? (
        <div className="share-url">
          <input
            readOnly
            value={url}
            aria-label="共有リンク"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn btn-primary" onClick={() => void copy()}>
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        </div>
      ) : (
        <p>まだ共有リンクはありません。</p>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {url && confirm ? (
        <div className="delete-confirm" role="group" aria-label="共有リンクの変更の確認">
          <p>
            {confirm === 'recreate' ? '新しいリンクを作り、' : ''}
            今のリンクを無効にします。今のリンクを知っている人は見られなくなります。
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={busy}>
              やめる
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void revoke(confirm === 'recreate')}
              disabled={busy}
            >
              {confirm === 'recreate' ? '作り直す' : '無効にする'}
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-actions">
          {url && (
            <>
              <button
                type="button"
                className="btn btn-outline btn-danger-outline dialog-actions-start"
                onClick={() => setConfirm('revoke')}
                disabled={busy}
              >
                無効にする
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setConfirm('recreate')} disabled={busy}>
                作り直す
              </button>
            </>
          )}
          {loaded && !url && (
            <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={busy}>
              共有リンクを作る
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            閉じる
          </button>
        </div>
      )}
    </dialog>
  )
}
