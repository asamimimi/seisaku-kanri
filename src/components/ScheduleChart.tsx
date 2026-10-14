import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ScheduleDialog } from './ScheduleDialog'
import {
  STAGES,
  SOON_DAYS,
  assignLanes,
  collectDeadlines,
  formatDay,
  fromDay,
  isStageDone,
  toDay,
  today,
} from '../lib/schedule'
import type { Deadline } from '../lib/schedule'
import type { TreeRow } from '../lib/sitemap'
import type { PageSchedule } from '../types'

type Props = {
  projectId: string
  rows: TreeRow[]
  schedules: PageSchedule[]
  projectDue: string | null
  onSaved: () => void
}

const DAY = 28 // 1日の幅(px)
const LABEL = 240 // 左のページ名の列の幅(px)
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** バーのドラッグ: move は期間ごと動かす、start / end は左端・右端をつかんで開始日・期限だけ動かす */
type DragMode = 'move' | 'start' | 'end'
type Drag = {
  pageId: string
  stage: PageSchedule['stage']
  mode: DragMode
  originX: number
  delta: number // 何日ずらしたか
}

/** ドラッグ中のずれを当てはめた開始日・期限（開始日が期限を越えないようにする） */
function applyDrag(start: number, end: number, drag: Drag) {
  if (drag.mode === 'move') return { start: start + drag.delta, end: end + drag.delta }
  if (drag.mode === 'start') return { start: Math.min(start + drag.delta, end), end }
  return { start, end: Math.max(end + drag.delta, start) }
}

/** 案件のスケジュール（横スクロールのガントチャート）と、期限切れ・期限が近い作業の一覧 */
export function ScheduleChart({ projectId, rows, schedules, projectDue, onSaved }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState<TreeRow | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const justDragged = useRef(false) // ドラッグの直後に来る click でダイアログを開かないため
  // 保存中の値。読み直しで schedules が新しくなったら、base が変わるので自然に使われなくなる
  const [pending, setPending] = useState<{ base: PageSchedule[]; item: PageSchedule } | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const now = today()

  const shown = useMemo(
    () =>
      pending && pending.base === schedules
        ? schedules.map((s) =>
            s.page_id === pending.item.page_id && s.stage === pending.item.stage ? pending.item : s,
          )
        : schedules,
    [schedules, pending],
  )

  const { overdue, soon } = useMemo(
    () => collectDeadlines(rows, shown, now),
    [rows, shown, now],
  )

  // 表示する期間: 予定・今日・納期を含み、前後に1週間ずつ余白を取る。月曜始まりにそろえる
  const range = useMemo(() => {
    const days = schedules.flatMap((s) => [toDay(s.start_date), toDay(s.due_date)])
    days.push(now, now + 35)
    if (projectDue) days.push(toDay(projectDue))
    let start = Math.min(...days) - 7
    start -= (new Date(start * 86_400_000).getUTCDay() + 6) % 7
    const end = Math.max(...days) + 7
    return { start, count: end - start + 1 }
  }, [schedules, projectDue, now])

  // 開いたときは今日が左から少し入ったところに来るようにスクロールする
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max((now - range.start - 3) * DAY, 0)
  }, [now, range.start])

  const x = (day: number) => (day - range.start) * DAY
  const days = Array.from({ length: range.count }, (_, i) => range.start + i)
  const width = LABEL + range.count * DAY
  const schedulesOf = (pageId: string) => shown.filter((s) => s.page_id === pageId)

  const onBarPointerDown = (e: PointerEvent<HTMLButtonElement>, s: PageSchedule) => {
    if (e.button !== 0) return
    justDragged.current = false
    const edge = (e.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      pageId: s.page_id,
      stage: s.stage,
      mode: edge === 'start' || edge === 'end' ? edge : 'move',
      originX: e.clientX,
      delta: 0,
    })
  }

  const onBarPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const delta = Math.round((e.clientX - drag.originX) / DAY)
    if (delta !== drag.delta) setDrag({ ...drag, delta })
  }

  const onBarPointerUp = async (s: PageSchedule) => {
    const d = drag
    setDrag(null)
    if (!d || d.delta === 0) return // 動かしていなければ、続く click でダイアログを開く
    justDragged.current = true
    const next = applyDrag(toDay(s.start_date), toDay(s.due_date), d)
    const item = { ...s, start_date: fromDay(next.start), due_date: fromDay(next.end) }
    setPending({ base: schedules, item })
    setDragError(null)
    const { error } = await supabase
      .from('page_schedules')
      .update({ start_date: item.start_date, due_date: item.due_date })
      .eq('page_id', s.page_id)
      .eq('stage', s.stage)
    if (error) {
      setPending(null)
      setDragError(`日程を保存できませんでした: ${error.message}`)
      return
    }
    onSaved()
  }

  return (
    <div className="schedule">
      <DeadlineList projectId={projectId} title="期限切れ" items={overdue} tone="overdue" onOpen={setEditing} />
      <DeadlineList
        projectId={projectId}
        title={`期限が近い（${SOON_DAYS}日以内）`}
        items={soon}
        tone="soon"
        onOpen={setEditing}
      />

      <div className="schedule-legend muted small" aria-label="バーの色">
        {STAGES.map((s) => (
          <span key={s.key} className="legend-item">
            <span className={`stage-swatch stage-${s.key}`} aria-hidden="true" />
            {s.label}
          </span>
        ))}
        <span className="legend-item">
          <span className="stage-swatch is-done" aria-hidden="true" />
          済み
        </span>
        <span className="legend-item">
          <span className="stage-swatch is-overdue" aria-hidden="true" />
          期限切れ
        </span>
      </div>

      {dragError && (
        <p role="alert" className="error">
          {dragError}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="muted">まだページがありません。サイトマップでページを追加すると、ここに日程を入れられます。</p>
      ) : (
        <div className="gantt" ref={scrollRef} tabIndex={0} aria-label="スケジュール（横にスクロールできます）">
          <div className="gantt-inner" style={{ width }}>
            <div className="gantt-head" role="presentation">
              <div className="gantt-label gantt-corner">ページ</div>
              {days.map((d) => {
                const date = fromDay(d)
                const weekday = new Date(d * 86_400_000).getUTCDay()
                const first = d === range.start || date.endsWith('-01')
                return (
                  <div
                    key={d}
                    className={`gantt-day${weekday === 0 || weekday === 6 ? ' is-weekend' : ''}${d === now ? ' is-today' : ''}`}
                    style={{ width: DAY }}
                  >
                    <span className="gantt-month">{first ? `${Number(date.slice(5, 7))}月` : ''}</span>
                    <span>{Number(date.slice(8, 10))}</span>
                    <span className="gantt-weekday">{WEEKDAYS[weekday]}</span>
                  </div>
                )
              })}
            </div>

            <div className="gantt-body">
              {/* 土日の帯・今日の線・納期の線（行の後ろに敷く） */}
              <div className="gantt-overlay" style={{ left: LABEL }} aria-hidden="true">
                {days
                  .filter((d) => [0, 6].includes(new Date(d * 86_400_000).getUTCDay()))
                  .map((d) => (
                    <span key={d} className="gantt-weekend" style={{ left: x(d), width: DAY }} />
                  ))}
                {projectDue && (
                  <span className="gantt-line gantt-due" style={{ left: x(toDay(projectDue)) + DAY }}>
                    <span className="gantt-line-label">納期</span>
                  </span>
                )}
                <span className="gantt-line gantt-today" style={{ left: x(now) + DAY / 2 }}>
                  <span className="gantt-line-label">今日</span>
                </span>
              </div>

              {rows.map((r) => {
                const bars = schedulesOf(r.id).map((s) => {
                  const start = toDay(s.start_date)
                  const end = toDay(s.due_date)
                  const dragging = drag?.pageId === s.page_id && drag.stage === s.stage
                  return { ...s, dragging, ...(dragging ? applyDrag(start, end, drag) : { start, end }) }
                })
                const { placed, laneCount } = assignLanes(bars)
                return (
                  <div key={r.id} className="gantt-row">
                    <div className="gantt-label" style={{ paddingLeft: 12 + r.depth * 16 }}>
                      {r.depth > 0 && <span className="tree-mark" aria-hidden="true">└</span>}
                      <button
                        type="button"
                        className="link-button gantt-page"
                        onClick={() => setEditing(r)}
                        aria-label={`${r.name}の日程を編集`}
                      >
                        {r.name}
                      </button>
                    </div>
                    <div className="gantt-track">
                      {placed.map((b) => {
                        const stage = STAGES.find((s) => s.key === b.stage)!
                        const done = isStageDone(b.stage, r.phase_position)
                        const late = !done && b.end < now
                        return (
                          <button
                            key={b.stage}
                            type="button"
                            className={`gantt-bar stage-${b.stage}${done ? ' is-done' : ''}${late ? ' is-overdue' : ''}${b.dragging ? ' is-dragging' : ''}`}
                            style={{
                              left: x(b.start),
                              width: (b.end - b.start + 1) * DAY,
                              top: `calc(6px + ${b.lane} * (100% - 12px) / ${laneCount})`,
                              height: `calc((100% - 12px) / ${laneCount} - 2px)`,
                            }}
                            onPointerDown={(e) => onBarPointerDown(e, b)}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={() => void onBarPointerUp(b)}
                            onPointerCancel={() => setDrag(null)}
                            onClick={() => {
                              if (justDragged.current) {
                                justDragged.current = false
                                return
                              }
                              setEditing(r)
                            }}
                            title={`${stage.label} ${formatDay(b.start_date)}〜${formatDay(b.due_date)}（ドラッグで移動、両端で開始日・期限を変更）`}
                            aria-label={`${r.name} ${stage.label} ${formatDay(b.start_date)}〜${formatDay(b.due_date)}${done ? '（済み）' : late ? '（期限切れ）' : ''}。日程を編集`}
                          >
                            <span className="gantt-handle gantt-handle-start" data-edge="start" aria-hidden="true" />
                            <span className="gantt-bar-label">
                              {b.dragging
                                ? `${formatDay(fromDay(b.start))}〜${formatDay(fromDay(b.end))}`
                                : `${done ? '✓ ' : ''}${stage.short}`}
                            </span>
                            <span className="gantt-handle gantt-handle-end" data-edge="end" aria-hidden="true" />
                          </button>
                        )
                      })}
                      {placed.length === 0 && (
                        <button
                          type="button"
                          className="gantt-empty"
                          style={{ left: x(now) + 8 }}
                          onClick={() => setEditing(r)}
                        >
                          ＋ 日程を入れる
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      <p className="muted small">
        バーはドラッグで期間ごと動かせ、左端・右端をドラッグすると開始日・期限だけ変えられます。ページ名かバーを押すと日程を入力できます。制作フェーズが次へ進んだ期間は「済み」になり、期限を過ぎても期限切れにはなりません。
      </p>

      <ScheduleDialog
        open={editing !== null}
        page={editing}
        projectId={projectId}
        schedules={editing ? schedulesOf(editing.id) : []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          onSaved()
        }}
      />
    </div>
  )
}

/** 期限切れ・期限が近い作業の一覧。ページ名はページ詳細へのリンク、日付を押すと日程の編集 */
function DeadlineList({
  projectId,
  title,
  items,
  tone,
  onOpen,
}: {
  projectId: string
  title: string
  items: Deadline[]
  tone: 'overdue' | 'soon'
  onOpen: (row: TreeRow) => void
}) {
  if (items.length === 0) return null
  return (
    <section className={`deadlines deadlines-${tone}`} aria-label={title}>
      <h3 className="deadlines-title">
        {title} {items.length}件
      </h3>
      <ul>
        {items.map((d) => {
          const stage = STAGES.find((s) => s.key === d.schedule.stage)!
          return (
            <li key={`${d.row.id}-${d.schedule.stage}`}>
              <Link to={`/projects/${projectId}/pages/${d.row.id}`}>{d.row.name}</Link>
              <span>{stage.label}</span>
              <button type="button" className="link-button" onClick={() => onOpen(d.row)}>
                期限 {formatDay(d.schedule.due_date)}
              </button>
              <span className="strong">
                {d.daysLeft < 0 ? `${-d.daysLeft}日過ぎ` : d.daysLeft === 0 ? '今日まで' : `あと${d.daysLeft}日`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
