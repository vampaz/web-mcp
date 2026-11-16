import { expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

function render(markdown: string) {
  const target = document.createElement('div')
  renderMarkdown(markdown, target)
  return target
}

it('renders paragraphs, line breaks, emphasis, code, and lists', function blocks() {
  const target = render(
    [
      'A **bold** and *italic* line with `inline` code.',
      'Second line.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second'
    ].join('\n')
  )
  expect(target.querySelectorAll('p')).toHaveLength(1)
  expect(target.querySelector('p br')).not.toBeNull()
  expect(target.querySelector('strong')!.textContent).toBe('bold')
  expect(target.querySelector('em')!.textContent).toBe('italic')
  expect(target.querySelector('p code')!.textContent).toBe('inline')
  expect(Array.from(target.querySelectorAll('ul li'), (li) => li.textContent)).toEqual([
    'one',
    'two'
  ])
  expect(Array.from(target.querySelectorAll('ol li'), (li) => li.textContent)).toEqual([
    'first',
    'second'
  ])
})

it('allows only http, https, and mailto links', function links() {
  const target = render(
    [
      '[web](https://example.com/docs)',
      '[mail](mailto:person@example.com)',
      '[bad](javascript:alert(1))',
      '[relative](/docs)'
    ].join('\n\n')
  )
  const anchors = Array.from(target.querySelectorAll('a'))
  expect(anchors).toHaveLength(2)
  expect(anchors[0]).toMatchObject({ href: 'https://example.com/docs', target: '_blank' })
  expect(anchors[0]!.rel).toBe('noopener noreferrer')
  expect(anchors[1]!.getAttribute('href')).toBe('mailto:person@example.com')
  expect(target.textContent).toContain('javascript:alert(1)')
  expect(target.textContent).toContain('/docs')
})

it('keeps raw HTML and injection text inert', function injection() {
  const target = render('<img src=x onerror=alert(1)> <script>alert(2)</script> **safe**')
  expect(target.querySelector('img')).toBeNull()
  expect(target.querySelector('script')).toBeNull()
  expect(target.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(target.textContent).toContain('<script>alert(2)</script>')
  expect(target.querySelector('strong')!.textContent).toBe('safe')
})

it('renders fenced code verbatim including nested shorter fences', function fences() {
  const target = render(
    ['````text', '```', '<b>not markup</b>', '```', '````', '', 'after'].join('\n')
  )
  const pre = target.querySelector('pre')!
  expect(pre.textContent).toBe('```\n<b>not markup</b>\n```')
  expect(pre.querySelector('b')).toBeNull()
  expect(target.querySelector('p')!.textContent).toBe('after')
})

it('supports mixed italic-before-bold and nested emphasis', function mixed() {
  for (const [input, expected] of [
    ['*one* **two**', 'one two'],
    ['_one_ __two__', 'one two']
  ] as const) {
    const target = render(input)
    expect(target.querySelectorAll('em')).toHaveLength(1)
    expect(target.querySelectorAll('strong')).toHaveLength(1)
    expect(target.querySelector('em')!.textContent).toBe('one')
    expect(target.querySelector('strong')!.textContent).toBe('two')
    expect(target.textContent).toBe(expected)
  }

  const nested = render('**bold *italic* bold**')
  expect(nested.querySelector('strong')!.textContent).toBe('bold italic bold')
  expect(nested.querySelector('strong em')!.textContent).toBe('italic')
})

it('handles large unmatched bracket input without rescanning', function brackets() {
  const input = `${'['.repeat(50_000)}x`
  const started = performance.now()
  const target = render(input)
  expect(performance.now() - started).toBeLessThan(1000)
  expect(target.textContent).toBe(input)

  const oneClosing = `${'['.repeat(30_000)}]`
  const startedClosing = performance.now()
  expect(render(oneClosing).textContent).toBe(oneClosing)
  expect(performance.now() - startedClosing).toBeLessThan(1000)
})

it('leaves malformed markers as text', function malformed() {
  const target = render('**unclosed and [missing] (url) `code')
  expect(target.querySelector('strong')).toBeNull()
  expect(target.querySelector('a')).toBeNull()
  expect(target.textContent).toContain('**unclosed')
})

it('keeps intraword underscores and spaced asterisks literal', function delimiters() {
  const target = render('set_counter_value and 2 * 3 * 4, foo__bar__baz, 2 ** 3 ** 4')
  expect(target.querySelector('em')).toBeNull()
  expect(target.querySelector('strong')).toBeNull()
  expect(target.textContent).toBe('set_counter_value and 2 * 3 * 4, foo__bar__baz, 2 ** 3 ** 4')
})

it('keeps delimiter boundaries around punctuation and ordinary emphasis', function boundaries() {
  const target = render('a_b_c _one_ (*two*) a*b*c')
  expect(Array.from(target.querySelectorAll('em'), (element) => element.textContent)).toEqual([
    'one',
    'two',
    'b'
  ])
  expect(target.textContent).toBe('a_b_c one (two) abc')
})
