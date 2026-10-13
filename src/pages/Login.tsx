import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { APP_NAME } from '../lib/config'

export default function Login() {
  const { session, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  const onClick = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle() // 成功するとGoogleの画面へ移動する
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました')
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <h1>{APP_NAME}</h1>
      <p className="muted">サイトマップ・制作フェーズ・クライアント確認を、1か所で管理します。</p>
      <button className="btn btn-primary btn-large" onClick={() => void onClick()} disabled={busy}>
        {busy ? 'Googleへ移動中…' : 'Googleでログイン'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  )
}
