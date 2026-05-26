import type { JsonSchema } from './interfaces/tool'

export interface ObjectInputSchemaOptions {
  additionalProperties?: boolean | JsonSchema
  required?: string[]
}

export interface StringParamOptions {
  description?: string
  maxLength?: number
  minLength?: number
  pattern?: string
}

export interface NumberParamOptions {
  description?: string
  maximum?: number
  minimum?: number
}

export interface ArrayParamOptions {
  description?: string
  maxItems?: number
  minItems?: number
}

export function objectInputSchema(
  properties: Record<string, JsonSchema>,
  options: ObjectInputSchemaOptions = {}
): JsonSchema {
  return {
    type: 'object',
    properties,
    required: options.required ?? [],
    additionalProperties: options.additionalProperties ?? false
  }
}

export function stringParam(options: StringParamOptions = {}): JsonSchema {
  return {
    type: 'string',
    ...options
  }
}

export function numberParam(options: NumberParamOptions = {}): JsonSchema {
  return {
    type: 'number',
    ...options
  }
}

export function integerParam(options: NumberParamOptions = {}): JsonSchema {
  return {
    type: 'integer',
    ...options
  }
}

export function booleanParam(description?: string): JsonSchema {
  return {
    type: 'boolean',
    ...(description ? { description } : {})
  }
}

export function arrayParam(items: JsonSchema, options: ArrayParamOptions = {}): JsonSchema {
  return {
    type: 'array',
    items,
    ...options
  }
}

export function enumParam<TValue extends string | number | boolean>(
  values: readonly TValue[],
  description?: string
): JsonSchema {
  if (values.length === 0) {
    throw new Error('enumParam() requires at least one value.')
  }

  const type = getEnumType(values)
  return {
    ...(type ? { type } : {}),
    enum: [...values],
    ...(description ? { description } : {})
  }
}

function getEnumType(values: readonly unknown[]): JsonSchema['type'] | undefined {
  const firstValue = values[0]
  if (
    !values.every(function hasSameType(value) {
      return typeof value === typeof firstValue
    })
  ) {
    return undefined
  }

  if (typeof firstValue === 'number') {
    return values.every(function isIntegerEnumValue(value) {
      return Number.isInteger(value)
    })
      ? 'integer'
      : 'number'
  }
  if (typeof firstValue === 'boolean') return 'boolean'
  return 'string'
}
