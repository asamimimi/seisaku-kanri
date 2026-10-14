import type { MaterialStatus } from '../types'

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  temporary: '仮',
  purchased: '購入済み',
  replaced: '差し替え済み',
}
