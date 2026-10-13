import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { APP_NAME } from '../lib/config'

export function Header() {
  const { session, signOut } = useAuth()
  return (
    <header className="header">
      <strong className="header-title">{APP_NAME}</strong>
      <nav className="header-nav">
        <Link to="/" aria-current="page">
          案件
        </Link>
      </nav>
      <span className="header-spacer" />
      <span className="header-user">{session?.user.email}</span>
      <button className="btn btn-outline" onClick={() => void signOut()}>
        ログアウト
      </button>
    </header>
  )
}
