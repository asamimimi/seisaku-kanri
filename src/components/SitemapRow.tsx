import { Link } from 'react-router-dom'
import { useDraggable, useDroppable } from '@dnd-kit/react'
import { ConfirmationMenu } from './ConfirmationMenu'
import type { DropZone, TreeRow } from '../lib/sitemap'
import type { ConfirmationStatus, PageConfirmationStatus, Phase } from '../types'

type Props = {
  row: TreeRow
  href: string | null
  phases: Phase[]
  phaseTone: number
  points: PageConfirmationStatus[]
  busy: boolean
  /** 絞り込み中・保存中などで、つかめないとき */
  dragDisabled: boolean
  /** ドラッグ中のページ自身とその子孫（そこへは落とせない） */
  dropDisabled: boolean
  /** このページの上にドラッグしているときの落とす位置 */
  dropZone: DropZone | null
  /** ドラッグ中のページ自身 */
  isSource: boolean
  onChangePhase: (phaseId: string) => void
  onChangeStatus: (pointId: string, status: ConfirmationStatus) => void
  onEdit: () => void
}

/** サイトマップの1行。左端のつまみでドラッグでき、行の上が落とし先になる */
export function SitemapRow({
  row,
  href,
  phases,
  phaseTone,
  points,
  busy,
  dragDisabled,
  dropDisabled,
  dropZone,
  isSource,
  onChangePhase,
  onChangeStatus,
  onEdit,
}: Props) {
  const { ref: dragRef } = useDraggable({ id: row.id, disabled: dragDisabled })
  const { ref: dropRef } = useDroppable({ id: row.id, disabled: dropDisabled })

  const className = [isSource && 'is-drag-source', dropZone && `drop-${dropZone}`]
    .filter(Boolean)
    .join(' ')

  return (
    <tr ref={dropRef} aria-busy={busy} className={className || undefined}>
      <td className="sitemap-handle">
        <button
          ref={dragRef}
          type="button"
          className="drag-handle"
          disabled={dragDisabled}
          aria-label={`${row.name}を移動（スペースキーでつかみ、矢印キーで動かし、Enterで置く）`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      </td>
      <th scope="row" className="sitemap-name" style={{ paddingLeft: 16 + row.depth * 24 }}>
        {row.depth > 0 && <span className="tree-mark" aria-hidden="true">└</span>}
        <Link
          to={`/projects/${row.project_id}/pages/${row.id}`}
          className={row.depth === 0 ? 'strong' : undefined}
        >
          {row.name}
        </Link>
      </th>
      <td className="sitemap-url">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {row.url_path}
          </a>
        ) : (
          (row.url_path ?? <span className="muted">—</span>)
        )}
      </td>
      <td>
        <select
          className={`phase-select tone-${phaseTone}`}
          value={row.phase_id}
          disabled={busy}
          onChange={(e) => onChangePhase(e.target.value)}
          aria-label={`${row.name}の制作フェーズ`}
        >
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <ConfirmationMenu
          pageName={row.name}
          points={points}
          disabled={busy}
          onChange={onChangeStatus}
        />
      </td>
      <td className="sitemap-materials">
        {row.materials_count > 0 ? (
          <>
            {row.materials_count}
            {row.materials_temporary_count > 0 && (
              <span className="muted small">（仮 {row.materials_temporary_count}）</span>
            )}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="sitemap-issues">
        {row.open_issues_count > 0 ? (
          <Link
            to={`/projects/${row.project_id}/pages/${row.id}`}
            aria-label={`${row.name}の未対応の指摘・質問 ${row.open_issues_count}件`}
          >
            {row.open_issues_count}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <button className="btn btn-outline" onClick={onEdit} aria-label={`${row.name}を編集`}>
          編集
        </button>
      </td>
    </tr>
  )
}
