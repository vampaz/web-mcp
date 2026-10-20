import type { JsonSchema } from './interfaces/tool'

export interface ObjectInputSchemaOptions<TRequired extends readonly string[] = readonly string[]> {
  additionalProperties?: boolean | JsonSchema
  required?: TRequired
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

export function objectInputSchema<
  const TProperties extends Record<string, JsonSchema>,
  const TRequired extends readonly (keyof TProperties & string)[]
>(
  properties: TProperties,
  options: ObjectInputSchemaOptions<TRequired> & { required: TRequired }
): {
  type: 'object'
  properties: TProperties
  required: TRequired
  additionalProperties: boolean | JsonSchema
}
export function objectInputSchema<const TProperties extends Record<string, JsonSchema>>(
  properties: TProperties,
  options?: ObjectInputSchemaOptions<readonly (keyof TProperties & string)[]>
): {
  type: 'object'
  properties: TProperties
  required?: readonly (keyof TProperties & string)[]
  additionalProperties: boolean | JsonSchema
}
export function objectInputSchema(
  properties: Record<string, JsonSchema>,
  options: ObjectInputSchemaOptions = {}
) {
  return {
    type: 'object' as const,
    properties,
    required: options.required ?? [],
    additionalProperties: options.additionalProperties ?? false
  }
}

export function stringParam(options: StringParamOptions = {}) {
  return {
    type: 'string' as const,
    ...options
  }
}

export function numberParam(options: NumberParamOptions = {}) {
  return {
    type: 'number' as const,
    ...options
  }
}

export function integerParam(options: NumberParamOptions = {}) {
  return {
    type: 'integer' as const,
    ...options
  }
}

export function booleanParam(description?: string) {
  return {
    type: 'boolean' as const,
    ...(description ? { description } : {})
  }
}

export function arrayParam<const TItems extends JsonSchema>(
  items: TItems,
  options: ArrayParamOptions = {}
) {
  return {
    type: 'array' as const,
    items,
    ...options
  }
}

export function enumParam<const TValue extends string | number | boolean>(
  values: readonly TValue[],
  description?: string
) {
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
