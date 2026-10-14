import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { insertLink, renderMemo, toggleBold, toggleBullet, toggleHeading } from '../lib/memo'
import type { Edit } from '../lib/memo'

type Props = {
  pageId: string
  memo: string
  figmaUrl: string | null
  onSaved: () => void
}

const TOOLS: { label: string; apply: (e: Edit) => Edit }[] = [
  { label: '見出し', apply: toggleHeading },
  { label: '箇条書き', apply: toggleBullet },
  { label: '太字', apply: toggleBold },
  { label: 'リンク', apply: insertLink },
]

/** ページ詳細の「仕様メモ」。見るときは整えて表示し、「編集」でテキスト欄に切り替える */
export function SpecMemo({ pageId, memo, figmaUrl, onSaved }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<string | null>(null) // null のときは表示モード
  const [figma, setFigma] = useState(figmaUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** ツールバーのボタン: 選択範囲に記号を付け、選択し直してテキスト欄に戻る */
  const applyTool = (apply: (e: Edit) => Edit) => {
    const el = textRef.current
    if (!el || draft === null) return
    const next = apply({ value: draft, start: el.selectionStart, end: el.selectionEnd })
    setDraft(next.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }

  const save = async (values: { spec_memo?: string; figma_url?: string | null }) => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('pages').update(values).eq('id', pageId)
    setBusy(false)
    if (error) {
      setError(
        error.code === '23514' ? 'Figmaリンクは https:// から始まるURLを入れてください' : error.message,
      )
      return false
    }
    onSaved()
    return true
  }

  const saveMemo = async () => {
    if (draft !== null && (await save({ spec_memo: draft }))) setDraft(null)
  }

  const saveFigma = (e: FormEvent) => {
    e.preventDefault()
    void save({ figma_url: figma.trim() || null })
  }

  const blocks = renderMemo(memo)
  const figmaDirty = figma.trim() !== (figmaUrl ?? '')

  return (
    <section className="panel" aria-labelledby="memo-heading">
      <div className="panel-header">
        <h2 id="memo-heading" className="panel-title">
          仕様メモ
        </h2>
        {draft === null && (
          <button className="btn btn-outline" onClick={() => setDraft(memo)}>
            編集
          </button>
        )}
      </div>
      <div className="panel-body">
        {draft === null ? (
          blocks.length > 0 ? (
            <div className="memo">{blocks}</div>
          ) : (
            <p className="muted">まだメモがありません。「編集」から、表示条件や動き、注意点などを書けます。</p>
          )
        ) : (
          <div className="memo-editor">
            <div className="memo-toolbar" role="toolbar" aria-label="書式">
              {TOOLS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="btn btn-outline btn-small"
                  onMouseDown={(e) => e.preventDefault()} // テキスト欄の選択を外さない
                  onClick={() => applyTool(t.apply)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textRef}
              className="memo-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="仕様メモ"
              autoFocus
              rows={14}
              placeholder={'## 表示条件\n- ログイン中だけ表示する\n\n## 動き\nスクロールで **ふわっと** 表示する'}
            />
            <p className="muted small">
              「## 」で見出し、「- 」で箇条書き、**文字** で太字、[文字](https://…) でリンクになります。
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>
                キャンセル
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveMemo()} disabled={busy}>
                保存
              </button>
            </div>
          </div>
        )}

        <form className="figma-link" onSubmit={saveFigma}>
          <label htmlFor="figma-url" className="muted">
            Figma
          </label>
          <input
            id="figma-url"
            type="url"
            value={figma}
            onChange={(e) => setFigma(e.target.value)}
            placeholder="このページのFigmaリンク（https://www.figma.com/…）"
            pattern="https://.*"
          />
          {figmaDirty ? (
            <button className="btn btn-primary" disabled={busy}>
              保存
            </button>
          ) : (
            figmaUrl && (
              <a className="btn btn-outline figma-open" href={figmaUrl} target="_blank" rel="noreferrer">
                開く
              </a>
            )
          )}
        </form>
        {error && (
          <p role="alert" className="error">
            保存できませんでした: {error}
          </p>
        )}
      </div>
    </section>
  )
}
