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

it('recognizes inflected and documented mutation verbs', () => {
  function tool(name: string, description: string) {
    return {
      name,
      description,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        return {}
      }
    }
  }
  for (const [name, description] of [
    ['trash_note', 'Moves the selected note to the trash and deletes its share links.'],
    ['checkout_cart', 'Checks out the current cart with the saved payment method.'],
    ['create_payment', 'Starts a new payment for the selected invoice in the ledger.'],
    ['transfer_funds', 'Moves money between two accounts that the user owns today.'],
    ['notify_team', 'Sends a message to every member of the current project team.']
  ]) {
    expect(getToolWarnings(tool(name, description))).toContain(
      'Sensitive action likely needs explicit confirmation metadata.'
    )
  }
  expect(
    getToolWarnings(tool('list_items', 'List the visible items in their current sort position.'))
  ).toEqual([])
})

it('warns about patterns without a maxLength', () => {
  const tool = {
    name: 'read_code',
    description: 'Read the selected code sample from the current document.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[a-z]+$' } }
    },
    execute() {
      return {}
    }
  }

  expect(getToolWarnings(tool)).toContain(
    'inputSchema.properties.code uses a pattern without maxLength; add maxLength to bound regular-expression work.'
  )
  expect(
    getToolWarnings({
      ...tool,
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string', pattern: '^[a-z]+$', maxLength: 20 } }
      }
    })
  ).toEqual([])
})

it('warns about patterns nested in every supported schema keyword', () => {
  const tool = {
    name: 'read_config',
    description: 'Read the configuration for the current workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          additionalProperties: { type: 'string', pattern: '^[a-z]+$' },
          propertyNames: { type: 'string', pattern: '^[a-z]+$' }
        },
        blocked: { not: { type: 'string', pattern: '^x+$' } }
      }
    },
    execute() {
      return {}
    }
  }

  const warnings = getToolWarnings(tool)
  expect(warnings).toContain(
    'inputSchema.properties.config.additionalProperties uses a pattern without maxLength; add maxLength to bound regular-expression work.'
  )
  expect(warnings).toContain(
    'inputSchema.properties.config.propertyNames uses a pattern without maxLength; add maxLength to bound regular-expression work.'
  )
  expect(warnings).toContain(
    'inputSchema.properties.blocked.not uses a pattern without maxLength; add maxLength to bound regular-expression work.'
  )
})

it('warns about string formats the validator does not check', () => {
  expect(
    getToolWarnings({
      name: 'read_session',
      description: 'Read the session details for the signed-in user right now.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', format: 'jwt' },
          id: { type: 'string', format: 'uuid' }
        }
      },
      execute() {
        return {}
      }
    })
  ).toEqual([
    'inputSchema.properties.token uses format "jwt", which is not checked; add a pattern or validate in parseInput().'
  ])
})
