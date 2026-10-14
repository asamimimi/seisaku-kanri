import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Header } from './components/Header'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectPage from './pages/ProjectPage'
import PageDetail from './pages/PageDetail'

/** ログインしていない人を /login へ送る。ログイン済みなら共通ヘッダー付きで中身を出す。 */
function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <p className="status">読み込み中…</p>
  if (!session) return <Navigate to="/login" replace />
  return (
    <>
      <Header />
      <Outlet />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/projects/:projectId/pages/:pageId" element={<PageDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
