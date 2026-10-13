import { Link, useParams } from 'react-router-dom'

/** 案件の詳細（サイトマップ）画面。次のリリースで作る。 */
export default function ProjectPage() {
  const { projectId } = useParams()
  return (
    <main className="page">
      <p className="breadcrumb">
        <Link to="/">案件</Link> ／ {projectId}
      </p>
      <h1>サイトマップ</h1>
      <p className="muted">この画面は次のステップで作ります（ページの追加・フェーズ・確認状況）。</p>
    </main>
  )
}
