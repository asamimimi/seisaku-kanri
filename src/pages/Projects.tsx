import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { daysUntil } from '../lib/date'
import { ProjectCard } from '../components/ProjectCard'
import { NewProjectDialog } from '../components/NewProjectDialog'
import type { ProjectOverview } from '../types'

export default function Projects() {
  const [projects, setProjects] = useState<ProjectOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [reloadKey, setReloadKey] = useState(0) // 増やすと一覧を読み直す

  useEffect(() => {
    let cancelled = false
    // project_overview は案件ごとの集計ビュー。RLSにより自分が見られる案件だけが返る。
    supabase
      .from('project_overview')
      .select('*')
      .is('archived_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          return
        }
        setError(null)
        setProjects(data as ProjectOverview[])
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const list = projects ?? []
  const waiting = list.reduce((n, p) => n + p.waiting_pages, 0)
  const ahead = list.reduce((n, p) => n + p.ahead_pages, 0)
  const soon = list.filter((p) => {
    const d = daysUntil(p.due_date)
    return d !== null && d <= 7
  }).length

  return (
    <main className="page">
      <div className="title-row">
        <h1>案件</h1>
        <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
          ＋ 案件を作成
        </button>
      </div>

      <section className="summary" aria-label="未対応のまとめ">
        <div className="summary-card">
          <div className="muted small">クライアント確認待ち</div>
          <div className="summary-value">{waiting}ページ</div>
        </div>
        <div className="summary-card">
          <div className="muted small">▲ OK前に実装へ進んだページ</div>
          <div className="summary-value">{ahead}ページ</div>
        </div>
        <div className="summary-card">
          <div className="muted small">納期が7日以内の案件</div>
          <div className="summary-value">{soon}件</div>
        </div>
      </section>

      <h2>進行中の案件</h2>

      {error && (
        <p role="alert" className="error">
          案件を読み込めませんでした: {error}
        </p>
      )}
      {projects === null && !error && <p className="status">読み込み中…</p>}
      {projects !== null && list.length === 0 && (
        <p className="muted">まだ案件がありません。「＋ 案件を作成」から始めましょう。</p>
      )}

      <section className="cards" aria-label="案件一覧">
        {list.map((p) => (
          <ProjectCard key={p.project_id} p={p} />
        ))}
      </section>

      <p className="legend" aria-label="進捗バーの色">
        <span>進捗バーの色:</span>
        <span className="legend-item">
          <i className="swatch swatch-done" />完了
        </span>
        <span className="legend-item">
          <i className="swatch swatch-build" />実装（実装中〜実装完了）
        </span>
        <span className="legend-item">
          <i className="swatch swatch-design" />設計（ワイヤー・デザイン）
        </span>
      </p>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false)
          setReloadKey((k) => k + 1)
        }}
      />
    </main>
  )
}
