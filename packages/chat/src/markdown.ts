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

    if (
      (char === '*' || char === '_') &&
      text.startsWith(char + char, index) &&
      canOpenDelimiter(text, index, char, 2)
    ) {
      const end = findClosingDelimiter(text, index + 2, char, 2)
      if (end > index + 2) {
        flush()
        const strong = document.createElement('strong')
        appendInline(document, strong, text.slice(index + 2, end))
        parent.append(strong)
        index = end + 1
        continue
      }
    }

    if ((char === '*' || char === '_') && canOpenDelimiter(text, index, char, 1)) {
      const end = findClosingDelimiter(text, index + 1, char, 1)
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

function canOpenDelimiter(text: string, index: number, marker: '*' | '_', length: 1 | 2): boolean {
  const next = text[index + length]
  if (next === undefined || /\s/u.test(next)) return false
  // CommonMark keeps underscores inside words literal; asterisks may emphasize intraword text.
  if (marker === '_' && index > 0 && isWordCharacter(text[index - 1]!)) return false
  return true
}

function canCloseDelimiter(text: string, index: number, marker: '*' | '_', length: 1 | 2): boolean {
  const previous = text[index - 1]
  if (previous === undefined || /\s/u.test(previous)) return false
  if (marker === '_' && index + length < text.length && isWordCharacter(text[index + length]!))
    return false
  return true
}

function findClosingDelimiter(
  text: string,
  from: number,
  marker: '*' | '_',
  length: 1 | 2
): number {
  const delimiter = marker.repeat(length)
  for (let index = from; index <= text.length - length; index++) {
    if (text.startsWith(delimiter, index) && canCloseDelimiter(text, index, marker, length))
      return index
  }
  return -1
}

function isWordCharacter(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char)
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
