import type { JsonSchema } from './interfaces/tool'

const supportedTypes = new Set([
  'object',
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'null'
])

export function validateJsonValue(value: unknown, schema: JsonSchema, path = ''): string[] {
  const errors: string[] = []
  validateValueNode(value, schema, path, errors)

  return errors
}

export function formatJsonValueValidationError(errors: string[]): string {
  return `input validation failed: ${errors.join(' ')}`
}

export function validateJsonSchema(schema: JsonSchema, path = 'schema'): string[] {
  const errors: string[] = []
  validateSchemaNode(schema, path, errors)

  return errors
}

function validateSchemaNode(schema: unknown, path: string, errors: string[]): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    errors.push(`${path} must be an object.`)
    return
  }

  const node = schema as JsonSchema
  validateType(node, path, errors)
  validateProperties(node, path, errors)
  validateRequired(node, path, errors)
  validateItems(node, path, errors)
  validateAnyOf(node, path, errors)
  validateEnum(node, path, errors)
  validateNumberKeyword(node.minimum, `${path}.minimum`, errors)
  validateNumberKeyword(node.maximum, `${path}.maximum`, errors)
  validateIntegerKeyword(node.minLength, `${path}.minLength`, errors)
  validateIntegerKeyword(node.maxLength, `${path}.maxLength`, errors)
  validatePatternKeyword(node.pattern, `${path}.pattern`, errors)
  validateAdditionalProperties(node, path, errors)
}

function validateType(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.type === undefined) return

  if (typeof schema.type === 'string' && supportedTypes.has(schema.type)) return

  if (
    Array.isArray(schema.type) &&
    schema.type.length > 0 &&
    schema.type.every(function isSupportedType(type) {
      return typeof type === 'string' && supportedTypes.has(type)
    })
  ) {
    return
  }

  if (typeof schema.type !== 'string' || !supportedTypes.has(schema.type)) {
    errors.push(`${path}.type must be one of ${Array.from(supportedTypes).join(', ')}.`)
  }
}

function validateProperties(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.properties === undefined) return

  if (
    !schema.properties ||
    typeof schema.properties !== 'object' ||
    Array.isArray(schema.properties)
  ) {
    errors.push(`${path}.properties must be an object of named schemas.`)
    return
  }

  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    validateSchemaNode(propertySchema, `${path}.properties.${propertyName}`, errors)
  }
}

function validateRequired(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.required === undefined) return

  if (!Array.isArray(schema.required)) {
    errors.push(`${path}.required must be an array of property names.`)
    return
  }

  for (const [index, requiredName] of schema.required.entries()) {
    if (typeof requiredName !== 'string' || !requiredName) {
      errors.push(`${path}.required[${index}] must be a non-empty string.`)
      continue
    }

    if (schema.properties && !(requiredName in schema.properties)) {
      errors.push(
        `${path}.required includes "${requiredName}", but ${path}.properties does not define it.`
      )
    }
  }
}

function validateItems(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.items === undefined) return

  validateSchemaNode(schema.items, `${path}.items`, errors)
}

function validateAnyOf(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.anyOf === undefined) return

  if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
    errors.push(`${path}.anyOf must be a non-empty array of schemas.`)
    return
  }

  for (const [index, anyOfSchema] of schema.anyOf.entries()) {
    validateSchemaNode(anyOfSchema, `${path}.anyOf[${index}]`, errors)
  }
}

function validateEnum(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.enum === undefined) return

  if (!Array.isArray(schema.enum)) {
    errors.push(`${path}.enum must be an array.`)
  }
}

function validateNumberKeyword(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return

  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push(`${path} must be a number.`)
  }
}

function validateIntegerKeyword(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer.`)
  }
}

function validatePatternKeyword(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return

  if (typeof value !== 'string') {
    errors.push(`${path} must be a string.`)
    return
  }

  try {
    new RegExp(value)
  } catch {
    errors.push(`${path} must be a valid regular expression.`)
  }
}

function validateAdditionalProperties(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.additionalProperties === undefined) return

  if (typeof schema.additionalProperties === 'boolean') return

  validateSchemaNode(schema.additionalProperties, `${path}.additionalProperties`, errors)
}

function validateValueNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (schema.type && !matchesJsonSchemaType(value, schema.type)) {
    errors.push(
      `${formatValuePath(path)} expected ${formatExpectedType(schema.type)}, got ${getJsonValueType(value)}.`
    )
    return
  }

  if (schema.anyOf && !matchesAnyOf(value, schema.anyOf)) {
    errors.push(`${formatValuePath(path)} did not match any allowed schema.`)
    return
  }

  validateEnumValue(value, schema, path, errors)
  validateObjectValue(value, schema, path, errors)
  validateArrayValue(value, schema, path, errors)
  validateNumberValue(value, schema, path, errors)
  validateStringValue(value, schema, path, errors)
}

function validateEnumValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (!schema.enum) return

  if (
    !schema.enum.some(function isMatchingEnumValue(enumValue) {
      return areJsonValuesEqual(value, enumValue)
    })
  ) {
    errors.push(
      `${formatValuePath(path)} expected one of ${schema.enum.map(formatJsonValue).join(', ')}, got ${formatJsonValue(value)}.`
    )
  }
}

function validateObjectValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (!isJsonObject(value)) return

  for (const requiredName of schema.required ?? []) {
    if (!(requiredName in value)) {
      errors.push(`${formatValuePath(appendValuePath(path, requiredName))} is required.`)
    }
  }

  const properties = schema.properties ?? {}
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (propertyName in value) {
      validateValueNode(
        value[propertyName],
        propertySchema,
        appendValuePath(path, propertyName),
        errors
      )
    }
  }

  if (schema.additionalProperties === false) {
    for (const propertyName of Object.keys(value)) {
      if (!(propertyName in properties)) {
        errors.push(`${formatValuePath(appendValuePath(path, propertyName))} is not allowed.`)
      }
    }
    return
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    for (const propertyName of Object.keys(value)) {
      if (!(propertyName in properties)) {
        validateValueNode(
          value[propertyName],
          schema.additionalProperties,
          appendValuePath(path, propertyName),
          errors
        )
      }
    }
  }
}

function validateArrayValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (!Array.isArray(value) || !schema.items) return

  value.forEach(function validateArrayItem(item, index) {
    validateValueNode(
      item,
      schema.items as JsonSchema,
      appendValuePath(path, String(index)),
      errors
    )
  })
}

function validateNumberValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (typeof value !== 'number') return

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${formatValuePath(path)} expected number >= ${schema.minimum}, got ${value}.`)
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${formatValuePath(path)} expected number <= ${schema.maximum}, got ${value}.`)
  }
}

function validateStringValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (typeof value !== 'string') return

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(
      `${formatValuePath(path)} expected string length >= ${schema.minLength}, got ${value.length}.`
    )
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(
      `${formatValuePath(path)} expected string length <= ${schema.maxLength}, got ${value.length}.`
    )
  }

  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    errors.push(
      `${formatValuePath(path)} expected string matching ${schema.pattern}, got ${formatJsonValue(value)}.`
    )
  }
}

function matchesJsonSchemaType(value: unknown, type: string | string[]): boolean {
  if (Array.isArray(type)) {
    return type.some(function matchesAllowedType(allowedType) {
      return matchesJsonSchemaType(value, allowedType)
    })
  }

  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'null') return value === null
  if (type === 'number') return typeof value === 'number' && !Number.isNaN(value)
  if (type === 'object') return isJsonObject(value)

  return typeof value === type
}

function matchesAnyOf(value: unknown, schemas: JsonSchema[]): boolean {
  return schemas.some(function matchesAnyOfSchema(schema) {
    return validateJsonValue(value, schema).length === 0
  })
}

function formatExpectedType(type: string | string[]): string {
  return Array.isArray(type) ? type.join(' or ') : type
}

function getJsonValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (Number.isInteger(value)) return 'integer'
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'

  return typeof value
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function appendValuePath(path: string, segment: string): string {
  return `${path}/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`
}

function formatValuePath(path: string): string {
  return path || '/'
}

function formatJsonValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  if (value === undefined) return 'undefined'

  return JSON.stringify(value) ?? String(value)
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
