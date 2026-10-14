import type { PageSchedule, ScheduleStage } from '../types'
import type { TreeRow } from './sitemap'

/**
 * スケジュールの4つの期間。
 * donePhase: ページの制作フェーズの順番（phases.position）がこの値以上なら、その期間は済んだとみなす。
 *   フェーズは固定（1 ワイヤーフレーム作成 / 2 デザイン / 3 実装中 / 4 実装完了 / 5 完了）なので順番で判断する。
 */
export const STAGES: { key: ScheduleStage; label: string; short: string; donePhase: number }[] = [
  { key: 'wireframe', label: 'WF', short: 'WF', donePhase: 2 },
  { key: 'design', label: 'デザイン', short: 'デザイン', donePhase: 3 },
  { key: 'build', label: '実装', short: '実装', donePhase: 4 },
  { key: 'final', label: '最終確認・調整', short: '確認・調整', donePhase: 5 },
]

/** 期限が「近い」とみなす日数（今日を含めて、期限まであと何日以内か） */
export const SOON_DAYS = 3

/**
 * 'YYYY-MM-DD' を通し番号の日（1970-01-01 が 0）にする。
 * 日付の差を数えるだけなので UTC で計算し、夏時間などのずれを避ける。
 */
export function toDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** 通し番号の日を 'YYYY-MM-DD' に戻す */
export function fromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

/** 今日（ブラウザの時刻での日付）の通し番号 */
export function today(): number {
  const now = new Date()
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
}

/** 'YYYY-MM-DD' を「10/20」の形にする */
export function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

export function isStageDone(stage: ScheduleStage, phasePosition: number): boolean {
  return phasePosition >= STAGES.find((s) => s.key === stage)!.donePhase
}

export type Deadline = {
  row: TreeRow
  schedule: PageSchedule
  /** 期限まであと何日か。過ぎていれば負の数 */
  daysLeft: number
}

/** まだ済んでいない期間のうち、期限切れのものと、期限が近いものを集める（期限の早い順） */
export function collectDeadlines(rows: TreeRow[], schedules: PageSchedule[], now: number) {
  const overdue: Deadline[] = []
  const soon: Deadline[] = []
  for (const s of schedules) {
    const row = rows.find((r) => r.id === s.page_id)
    if (!row || isStageDone(s.stage, row.phase_position)) continue
    const daysLeft = toDay(s.due_date) - now
    if (daysLeft < 0) overdue.push({ row, schedule: s, daysLeft })
    else if (daysLeft < SOON_DAYS) soon.push({ row, schedule: s, daysLeft })
  }
  const byDue = (a: Deadline, b: Deadline) => a.daysLeft - b.daysLeft
  return { overdue: overdue.sort(byDue), soon: soon.sort(byDue) }
}

/**
 * 1行の中でバーが重なるときに、段（上から何番目か）を割り振る。
 * 重ならなければ全部 0 段目なので、1本の太いバーとして並ぶ。
 */
export function assignLanes<T extends { start: number; end: number }>(bars: T[]) {
  const sorted = [...bars].sort((a, b) => a.start - b.start)
  const laneEnds: number[] = []
  const placed = sorted.map((bar) => {
    let lane = laneEnds.findIndex((end) => end < bar.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = bar.end
    return { ...bar, lane }
  })
  return { placed, laneCount: Math.max(laneEnds.length, 1) }
}
