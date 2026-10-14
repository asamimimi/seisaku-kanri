import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MATERIAL_STATUS_LABELS } from '../lib/materials'
import { MaterialDialog } from './MaterialDialog'
import type { Material, MaterialStatus } from '../types'

type Props = {
  projectId: string
  pageId: string
  materials: Material[]
  onSaved: () => void
}

const STATUSES = Object.keys(MATERIAL_STATUS_LABELS) as MaterialStatus[]

/** ページ詳細の「素材リスト」。状態はその場のプルダウンで、名前とURLはダイアログで変える */
export function MaterialList({ projectId, pageId, materials, onSaved }: Props) {
  const [dialog, setDialog] = useState<{ open: boolean; material: Material | null }>({
    open: false,
    material: null,
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const changeStatus = async (m: Material, status: MaterialStatus) => {
    setSavingId(m.id)
    setError(null)
    const { error } = await supabase.from('materials').update({ status }).eq('id', m.id)
    setSavingId(null)
    if (error) {
      setError(`保存できませんでした: ${error.message}`)
      return
    }
    onSaved()
  }

  const temporary = materials.filter((m) => m.status === 'temporary').length

  return (
    <section className="panel" aria-labelledby="materials-heading">
      <div className="panel-header">
        <h2 id="materials-heading" className="panel-title">
          素材リスト
        </h2>
        {materials.length > 0 && (
          <span className="muted small">
            {materials.length}件{temporary > 0 && `（仮 ${temporary}）`}
          </span>
        )}
      </div>
      <div className="panel-body">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {materials.length === 0 && <p className="muted small">まだ素材がありません。</p>}
        <ul className="materials">
          {materials.map((m) => (
            <li key={m.id} className="material" aria-busy={savingId === m.id}>
              <div className="material-info">
                <button
                  type="button"
                  className="link-button material-name"
                  onClick={() => setDialog({ open: true, material: m })}
                  aria-label={`${m.name}を編集`}
                >
                  {m.name}
                </button>
                {m.source_url ? (
                  <a className="material-url" href={m.source_url} target="_blank" rel="noreferrer">
                    {m.source_url}
                  </a>
                ) : (
                  <span className="material-url muted">購入元URL 未設定</span>
                )}
              </div>
              <select
                className={`material-status material-${m.status}`}
                value={m.status}
                disabled={savingId === m.id}
                onChange={(e) => void changeStatus(m, e.target.value as MaterialStatus)}
                aria-label={`${m.name}の状態`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MATERIAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-add"
          onClick={() => setDialog({ open: true, material: null })}
        >
          ＋ 素材を追加
        </button>
      </div>

      <MaterialDialog
        open={dialog.open}
        material={dialog.material}
        projectId={projectId}
        pageId={pageId}
        nextPosition={materials.reduce((max, m) => Math.max(max, m.position), 0) + 1}
        onClose={() => setDialog({ open: false, material: null })}
        onSaved={() => {
          setDialog({ open: false, material: null })
          onSaved()
        }}
      />
    </section>
  )
}
