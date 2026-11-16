import { describe, expect, it } from 'vitest'
import { extractReleaseNotes } from './release-notes.ts'

describe('release notes extraction', function releaseNotes() {
  it.each([
    '## 1.2.3',
    '##\t1.2.3',
    '##   1.2.3',
    '## 1.2.3 — 2026-11-16',
    '##\t1.2.3\t—\t2026-11-16\t'
  ])('accepts %s', function accepted(heading) {
    expect(extractReleaseNotes(`${heading}\n\n- Changed.\n`, '1.2.3')).toEqual({
      notes: '- Changed.'
    })
  })

  it('stops at the next level-two heading and keeps subheadings', function boundary() {
    const changelog = [
      '## 1.2.3',
      '',
      '### Core',
      '',
      '- Changed.',
      '',
      '## 1.2.4',
      '',
      '- Later.'
    ].join('\n')
    expect(extractReleaseNotes(changelog, '1.2.3')).toEqual({
      notes: '### Core\n\n- Changed.'
    })
  })

  it('handles CRLF line endings', function crlf() {
    expect(extractReleaseNotes('## 1.2.3\r\n\r\n- Changed.\r\n', '1.2.3')).toEqual({
      notes: '- Changed.'
    })
  })

  it.each([
    ['missing', '## 1.2.4\n\n- Later.\n'],
    ['empty', '## 1.2.3\n\n'],
    ['whitespace-only', '## 1.2.3\n\n \t\n'],
    ['prefix-only version', '## 1.2.30\n\n- Later.\n'],
    ['trailing heading text', '## 1.2.3 notes\n\n- Later.\n']
  ])('rejects a %s section', function rejected(_label, changelog) {
    expect(extractReleaseNotes(changelog, '1.2.3')).toHaveProperty('error')
  })

  it('requires a version', function version() {
    expect(extractReleaseNotes('## 1.2.3\n\n- Changed.\n', ' ')).toHaveProperty('error')
  })
})
