/** Safe, dependency-free Markdown for `renderMessage`. Inserts DOM nodes and text only. */
export function renderMarkdown(text: string, target: HTMLElement): void {
  const document = target.ownerDocument
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const nodes: Node[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!
    if (!line.trim()) {
      index++
      continue
    }

    const fence = /^(`{3,})(.*)$/.exec(line)
    if (fence) {
      const marker = fence[1]!
      const body: string[] = []
      index++
      while (index < lines.length) {
        const closing = /^(`{3,})\s*$/.exec(lines[index]!)
        if (closing && closing[1]!.length >= marker.length) {
          index++
          break
        }
        body.push(lines[index]!)
        index++
      }
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = body.join('\n')
      pre.append(code)
      nodes.push(pre)
      continue
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      const list = document.createElement('ul')
      while (index < lines.length) {
        const item = /^[-*+]\s+(.*)$/.exec(lines[index]!)
        if (!item) break
        const li = document.createElement('li')
        appendInline(document, li, item[1]!)
        list.append(li)
        index++
      }
      nodes.push(list)
      continue
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      const list = document.createElement('ol')
      while (index < lines.length) {
        const item = /^\d+[.)]\s+(.*)$/.exec(lines[index]!)
        if (!item) break
        const li = document.createElement('li')
        appendInline(document, li, item[1]!)
        list.append(li)
        index++
      }
      nodes.push(list)
      continue
    }

    const paragraph: string[] = [line]
    index++
    while (index < lines.length && lines[index]!.trim()) {
      const next = lines[index]!
      if (/^`{3,}/.test(next) || /^[-*+]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break
      paragraph.push(next)
      index++
    }
    const p = document.createElement('p')
    appendInline(document, p, paragraph.join('\n'))
    nodes.push(p)
  }

  target.replaceChildren(...nodes)
}

function appendInline(document: Document, parent: HTMLElement, text: string): void {
  let buffer = ''
  const brackets = delimiterPairs(text, '[', ']')
  const parentheses = delimiterPairs(text, '(', ')')
  function flush() {
    if (!buffer) return
    parent.append(document.createTextNode(buffer))
    buffer = ''
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!

    if (char === '\n') {
      flush()
      parent.append(document.createElement('br'))
      continue
    }

    if (char === '`') {
      const end = text.indexOf('`', index + 1)
      if (end > index + 1) {
        flush()
        const code = document.createElement('code')
        code.textContent = text.slice(index + 1, end)
        parent.append(code)
        index = end
        continue
      }
    }

    if (char === '[') {
      const labelEnd = brackets.get(index)
      if (labelEnd !== undefined && text[labelEnd + 1] === '(') {
        const urlEnd = parentheses.get(labelEnd + 1)
        if (urlEnd !== undefined) {
          const url = text.slice(labelEnd + 2, urlEnd)
          if (url && !/\s/.test(url) && isSafeLink(url)) {
            flush()
            const link = document.createElement('a')
            link.href = url
            link.rel = 'noopener noreferrer'
            link.target = '_blank'
            appendInline(document, link, text.slice(index + 1, labelEnd))
            parent.append(link)
            index = urlEnd
            continue
          }
        }
      }
    }

    const pair = char === '*' || char === '_' ? char + char : ''
    if (pair && text.startsWith(pair, index)) {
      const end = text.indexOf(pair, index + 2)
      if (end > index + 1) {
        flush()
        const strong = document.createElement('strong')
        appendInline(document, strong, text.slice(index + 2, end))
        parent.append(strong)
        index = end + 1
        continue
      }
    }

    if (char === '*' || char === '_') {
      const end = text.indexOf(char, index + 1)
      if (end > index + 1) {
        flush()
        const emphasis = document.createElement('em')
        appendInline(document, emphasis, text.slice(index + 1, end))
        parent.append(emphasis)
        index = end
        continue
      }
    }

    buffer += char
  }

  flush()
}

function delimiterPairs(text: string, open: string, close: string): Map<number, number> {
  const pairs = new Map<number, number>()
  const stack: number[] = []
  for (let index = 0; index < text.length; index++) {
    if (text[index] === open) stack.push(index)
    else if (text[index] === close) {
      const opening = stack.pop()
      if (opening !== undefined) pairs.set(opening, index)
    }
  }
  return pairs
}

function isSafeLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
    )
  } catch {
    return false
  }
}
