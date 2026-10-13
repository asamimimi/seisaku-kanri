import type { ConfirmationStatus, PageConfirmationStatus, PageOverview } from '../types'

/** ツリー表示用の1行。depth は字下げの段数。 */
export type TreeRow = PageOverview & { depth: number }

/**
 * page_overview を親子順（親のすぐ下に子）に並べ、深さを付ける。
 * 万一データに輪があっても止まらないよう訪問済みを記録し、たどれなかったページは最後に一番上として出す。
 */
export function buildTree(pages: PageOverview[]): TreeRow[] {
  const ids = new Set(pages.map((p) => p.id))
  const childrenByParent = new Map<string | null, PageOverview[]>()
  for (const p of pages) {
    const key = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null
    const list = childrenByParent.get(key) ?? []
    list.push(p)
    childrenByParent.set(key, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ja'))
  }

  const rows: TreeRow[] = []
  const visited = new Set<string>()
  const walk = (parentId: string | null, depth: number) => {
    for (const p of childrenByParent.get(parentId) ?? []) {
      if (visited.has(p.id)) continue
      visited.add(p.id)
      rows.push({ ...p, depth })
      walk(p.id, depth + 1)
    }
  }
  walk(null, 0)
  for (const p of pages) {
    if (!visited.has(p.id)) rows.push({ ...p, depth: 0 })
  }
  return rows
}

/** 指定したページとその子孫のIDを集める（親の候補から外す・削除時の件数に使う） */
export function collectDescendantIds(
  pages: { id: string; parent_id: string | null }[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const p of pages) {
    if (!p.parent_id) continue
    const list = childrenByParent.get(p.parent_id) ?? []
    list.push(p.id)
    childrenByParent.set(p.parent_id, list)
  }
  const result = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    for (const child of childrenByParent.get(id) ?? []) {
      if (!result.has(child)) {
        result.add(child)
        stack.push(child)
      }
    }
  }
  return result
}

export const STATUS_LABELS: Record<ConfirmationStatus, string> = {
  not_requested: '未依頼',
  waiting: '確認待ち',
  revising: '修正対応中',
  ok: 'OK',
  not_required: '確認不要',
}

export type ConfirmationSummary = {
  text: string
  tone: 'waiting' | 'revising' | 'ok' | 'none'
  ahead: boolean
}

/**
 * サイトマップの「② 確認状況」に出す1行（PLAN.md 6章）。
 * 確認待ち・修正対応中（先行着手のものを優先）→ ✓すべてOK → 一番後ろのOK → 確認不要 → 未依頼、の順に決める。
 */
export function summarizeConfirmations(points: PageConfirmationStatus[]): ConfirmationSummary {
  if (points.length === 0) return { text: '確認ポイントなし', tone: 'none', ahead: false }
  const sorted = [...points].sort((a, b) => a.point_position - b.point_position)

  const open = sorted.filter((p) => p.status === 'waiting' || p.status === 'revising')
  if (open.length > 0) {
    const pick = open.find((p) => p.is_ahead) ?? open[0]
    const more = open.length > 1 ? ` 他${open.length - 1}件` : ''
    return {
      text: `${pick.point_name}：${STATUS_LABELS[pick.status]}${more}`,
      tone: pick.status === 'waiting' ? 'waiting' : 'revising',
      ahead: pick.is_ahead,
    }
  }

  const oks = sorted.filter((p) => p.status === 'ok')
  if (oks.length > 0 && sorted.every((p) => p.status === 'ok' || p.status === 'not_required')) {
    return { text: '✓すべてOK', tone: 'ok', ahead: false }
  }
  if (oks.length > 0) {
    return { text: `✓${oks[oks.length - 1].point_name}：OK`, tone: 'ok', ahead: false }
  }
  if (sorted.every((p) => p.status === 'not_required')) {
    return { text: '確認不要', tone: 'none', ahead: false }
  }
  return { text: '未依頼', tone: 'none', ahead: false }
}

/** テスト環境URLとページのURLをつなげる。どちらかが無ければ null。 */
export function joinUrl(base: string | null, path: string | null): string | null {
  if (!base || !path) return null
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}
