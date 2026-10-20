import { expect, it } from 'vitest'
import { getToolWarnings } from './quality'

it('matches words rather than fragments and respects read-only metadata', () => {
  const tool = {
    name: 'read_document',
    description: 'Read the document details from the active workspace.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      'x-webmcp-source': 'form',
      properties: {
        classname: { type: 'string', description: 'The selected classname.', minLength: 1 }
      }
    },
    execute() {
      return {}
    }
  }
  expect(getToolWarnings(tool)).toEqual([])
  expect(
    getToolWarnings({
      ...tool,
      name: 'send_email',
      description: 'Read the queued email before the user sends it.'
    })
  ).toEqual([])
  expect(getToolWarnings({ ...tool, annotations: {}, name: 'send_email' })).toContain(
    'Sensitive action likely needs explicit confirmation metadata.'
  )
})
