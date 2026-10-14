import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { STAGES } from '../lib/schedule'
import type { TreeRow } from '../lib/sitemap'
import type { PageSchedule, ScheduleStage } from '../types'

type Props = {
  open: boolean
  page: TreeRow | null
  projectId: string
  schedules: PageSchedule[] // このページの予定
  onClose: () => void
  onSaved: () => void
}

type Draft = Record<ScheduleStage, { start: string; due: string }>

const emptyDraft = (): Draft => ({
  wireframe: { start: '', due: '' },
  design: { start: '', due: '' },
  build: { start: '', due: '' },
  final: { start: '', due: '' },
})

/** 1ページの4つの期間（開始日・期限）をまとめて編集するダイアログ。両方空にするとその期間を消す */
export function ScheduleDialog({ open, page, projectId, schedules, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      const next = emptyDraft()
      for (const s of schedules) next[s.stage] = { start: s.start_date, due: s.due_date }
      setDraft(next)
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, schedules])

  const set = (stage: ScheduleStage, key: 'start' | 'due', value: string) =>
    setDraft((d) => {
      const next = { ...d, [stage]: { ...d[stage], [key]: value } }
      // 開始日だけ入れたら、期限も同じ日にしておく（あとで伸ばせばよい）
      if (key === 'start' && value && !d[stage].due) next[stage].due = value
      return next
    })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!page) return
    for (const s of STAGES) {
      const { start, due } = draft[s.key]
      if (!!start !== !!due) return setError(`${s.label}: 開始日と期限は両方入れるか、両方空にしてください`)
      if (start && start > due) return setError(`${s.label}: 期限が開始日より前になっています`)
    }
    setBusy(true)
    setError(null)
    const filled = STAGES.filter((s) => draft[s.key].start)
    const cleared = STAGES.filter((s) => !draft[s.key].start).map((s) => s.key)
    const [upserted, deleted] = await Promise.all([
      filled.length
        ? supabase.from('page_schedules').upsert(
            filled.map((s) => ({
              page_id: page.id,
              project_id: projectId,
              stage: s.key,
              start_date: draft[s.key].start,
              due_date: draft[s.key].due,
            })),
            { onConflict: 'page_id,stage' },
          )
        : { error: null },
      cleared.length
        ? supabase.from('page_schedules').delete().eq('page_id', page.id).in('stage', cleared)
        : { error: null },
    ])
    setBusy(false)
    const failed = upserted.error ?? deleted.error
    if (failed) {
      setError(failed.message)
      return
    }
    onSaved()
  }

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="schedule-dialog-title">
      <form onSubmit={(e) => void onSubmit(e)}>
        <h2 id="schedule-dialog-title">「{page?.name}」の日程</h2>
        <table className="schedule-form">
          <thead>
            <tr>
              <th scope="col">期間</th>
              <th scope="col">開始日</th>
              <th scope="col">期限</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.key}>
                <th scope="row">
                  <span className={`stage-swatch stage-${s.key}`} aria-hidden="true" />
                  {s.label}
                </th>
                <td>
                  <input
                    type="date"
                    value={draft[s.key].start}
                    onChange={(e) => set(s.key, 'start', e.target.value)}
                    aria-label={`${s.label}の開始日`}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={draft[s.key].due}
                    min={draft[s.key].start || undefined}
                    onChange={(e) => set(s.key, 'due', e.target.value)}
                    aria-label={`${s.label}の期限`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">開始日と期限を両方空にすると、その期間の予定を消します。</p>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
