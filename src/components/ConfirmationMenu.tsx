import { useEffect, useRef } from 'react'
import { STATUS_LABELS, summarizeConfirmations } from '../lib/sitemap'
import type { ConfirmationStatus, PageConfirmationStatus } from '../types'

type Props = {
  pageName: string
  points: PageConfirmationStatus[]
  disabled: boolean
  onChange: (pointId: string, status: ConfirmationStatus) => void
}

const STATUSES = Object.keys(STATUS_LABELS) as ConfirmationStatus[]

/** サイトマップの「② 確認状況」。1行のまとめを押すと、確認ポイントごとに状況を変えられる。 */
export function ConfirmationMenu({ pageName, points, disabled, onChange }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const summary = summarizeConfirmations(points)
  const sorted = [...points].sort((a, b) => a.point_position - b.point_position)

  // 外側をクリック、または Esc で閉じる
  useEffect(() => {
    const details = ref.current
    if (!details) return
    const onPointerDown = (e: PointerEvent) => {
      if (details.open && !details.contains(e.target as Node)) details.open = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && details.open) {
        details.open = false
        details.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    details.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      details.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <details ref={ref} className="confirm-menu">
      <summary
        className={`confirm-summary tone-${summary.tone}`}
        aria-label={`${pageName}の確認状況: ${summary.text}${summary.ahead ? '（先行着手）' : ''}`}
      >
        <span className="confirm-summary-text">{summary.text}</span>
        {summary.ahead && <span className="badge badge-ahead">▲先行着手</span>}
      </summary>
      <div className="confirm-panel">
        {sorted.length === 0 && <p className="muted small">確認ポイントがありません</p>}
        {sorted.map((p) => (
          <label key={p.confirmation_point_id} className="confirm-row">
            <span>
              {p.point_name}
              {p.is_ahead && <span className="badge badge-ahead">▲</span>}
            </span>
            <select
              value={p.status}
              disabled={disabled}
              onChange={(e) =>
                onChange(p.confirmation_point_id, e.target.value as ConfirmationStatus)
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  )
}
