import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  arrayParam,
  enumParam,
  numberParam,
  objectInputSchema,
  stringParam
} from './schema-builders'
import { validateJsonValue } from './schema'
import { defineTool } from './define-tool'

describe('schema builders', () => {
  it('creates strict object schemas with required properties', () => {
    const schema = objectInputSchema(
      {
        ids: arrayParam(stringParam({ description: 'Stable item IDs.' })),
        status: enumParam(['draft', 'paid'] as const, 'Invoice status.'),
        amount: numberParam({ minimum: 0.01 })
      },
      {
        required: ['ids', 'status']
      }
    )

    expect(schema).toEqual({
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Stable item IDs.'
          }
        },
        status: {
          type: 'string',
          enum: ['draft', 'paid'],
          description: 'Invoice status.'
        },
        amount: {
          type: 'number',
          minimum: 0.01
        }
      },
      required: ['ids', 'status'],
      additionalProperties: false
    })

    expect(
      validateJsonValue(
        {
          amount: 10,
          extra: true,
          status: 'paid'
        },
        schema
      )
    ).toEqual(['/ids is required.', '/extra is not allowed.'])
  })

  it('retains property, enum and required-key types through builders', () => {
    defineTool({
      name: 'read_items',
      description: 'Read items with the requested status.',
      inputSchema: objectInputSchema(
        {
          status: enumParam(['draft', 'paid']),
          ids: arrayParam(stringParam()),
          limit: numberParam()
        },
        { required: ['status', 'ids'] }
      ),
      execute(input) {
        expectTypeOf(input.status).toEqualTypeOf<'draft' | 'paid'>()
        expectTypeOf(input.ids).toEqualTypeOf<string[]>()
        expectTypeOf(input.limit).toEqualTypeOf<number | undefined>()
        return input
      }
    })
  })

  it('requires enum values and omits type for mixed enums', () => {
    expect(function createEmptyEnum() {
      enumParam([])
    }).toThrow('enumParam() requires at least one value.')

    expect(enumParam(['draft', 1])).toEqual({
      enum: ['draft', 1]
    })
  })

  it('does not claim optional required options guarantee a property', () => {
    const options: { required?: readonly ['count'] } = {}
    const schema = objectInputSchema({ count: numberParam() }, options)
    expect(validateJsonValue({}, schema)).toEqual([])
    defineTool({
      name: 'read_count',
      description: 'Read an optional count.',
      inputSchema: schema,
      execute(input) {
        expectTypeOf(input.count).toEqualTypeOf<number | undefined>()
        return input
      }
    })
  })

  it('uses number type for numeric enums with decimal values', () => {
    expect(enumParam([1, 2.5])).toEqual({
      type: 'number',
      enum: [1, 2.5]
    })
  })
})
