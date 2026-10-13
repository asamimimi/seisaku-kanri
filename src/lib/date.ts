/** 'YYYY-MM-DD' を「納期 10/20」の形にする。タイムゾーンのずれを避けるため文字列のまま扱う。 */
export function formatDue(due: string | null): string {
  if (!due) return '納期 未設定'
  return `納期 ${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}`
}

/** 今日から納期までの日数。過ぎていれば負の数。未設定なら null。 */
export function daysUntil(due: string | null): number | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(y, m - 1, d)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}
