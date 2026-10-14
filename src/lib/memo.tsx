import type { ReactNode } from 'react'

/**
 * 仕様メモ（pages.spec_memo）の書き方。Markdown のうち次の4つだけを使う。
 *   見出し: 行頭に「## 」 / 箇条書き: 行頭に「- 」 / 太字: **文字** / リンク: [文字](https://…)
 * HTML は使わず React の要素に組み立てるので、メモに <script> などを書いても動かない。
 */

/** テキスト欄の中身と選択範囲 */
export type Edit = { value: string; start: number; end: number }

/** 選択範囲を含む行の、行頭と行末の位置 */
function lineRange(value: string, start: number, end: number) {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const nl = value.indexOf('\n', end)
  return { from, to: nl === -1 ? value.length : nl }
}

/** 選択中の各行の頭に記号を付ける。全部の行に付いていれば外す（もう一度押すと戻る） */
function toggleLinePrefix({ value, start, end }: Edit, prefix: string): Edit {
  const { from, to } = lineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const remove = lines.every((l) => l.startsWith(prefix))
  const next = lines.map((l) => (remove ? l.slice(prefix.length) : l.startsWith(prefix) ? l : prefix + l))
  const block = next.join('\n')
  return { value: value.slice(0, from) + block + value.slice(to), start: from, end: from + block.length }
}

export const toggleHeading = (e: Edit) => toggleLinePrefix(e, '## ')
export const toggleBullet = (e: Edit) => toggleLinePrefix(e, '- ')

/** 選択した文字を ** で囲む。何も選んでいなければ「太字」と入れて選択する */
export function toggleBold({ value, start, end }: Edit): Edit {
  const selected = value.slice(start, end)
  if (value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return { value: value.slice(0, start - 2) + selected + value.slice(end + 2), start: start - 2, end: end - 2 }
  }
  const text = selected || '太字'
  return {
    value: `${value.slice(0, start)}**${text}**${value.slice(end)}`,
    start: start + 2,
    end: start + 2 + text.length,
  }
}

/** 選択した文字をリンクにする。URLの部分を選択して、そのまま貼り付けられるようにする */
export function insertLink({ value, start, end }: Edit): Edit {
  const text = value.slice(start, end) || 'リンク'
  const url = 'https://'
  const before = `${value.slice(0, start)}[${text}](`
  return {
    value: `${before}${url})${value.slice(end)}`,
    start: before.length,
    end: before.length + url.length,
  }
}

/** 行の中の **太字** と [文字](URL) を要素にする。URL は http(s) だけリンクにする */
function renderInline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${key}-${i++}`}>{renderInline(m[1], `${key}-${i}`)}</strong>)
    } else if (/^https?:\/\//.test(m[3])) {
      nodes.push(
        <a key={`${key}-${i++}`} href={m[3]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      )
    } else {
      nodes.push(m[0])
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** 仕様メモを表示用の要素にする。空行で段落を分け、続く「- 」の行は1つの箇条書きにまとめる */
export function renderMemo(memo: string): ReactNode[] {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  let paragraph: string[] = []

  const flush = () => {
    const key = `b${blocks.length}`
    if (bullets.length) {
      blocks.push(
        <ul key={key}>
          {bullets.map((b, i) => (
            <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
    if (paragraph.length) {
      const k = `p${blocks.length}`
      blocks.push(
        <p key={k}>
          {paragraph.flatMap((line, i) => [
            ...(i > 0 ? [<br key={`${k}-br${i}`} />] : []),
            ...renderInline(line, `${k}-${i}`),
          ])}
        </p>,
      )
      paragraph = []
    }
  }

  for (const line of memo.split('\n')) {
    if (line.startsWith('## ')) {
      flush()
      blocks.push(<h3 key={`h${blocks.length}`}>{renderInline(line.slice(3), `h${blocks.length}`)}</h3>)
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush()
      bullets.push(line.slice(2))
    } else if (line.trim() === '') {
      flush()
    } else {
      if (bullets.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
