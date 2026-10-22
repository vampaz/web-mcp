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

// Keywords that constrain values but are not implemented; accepting them would skip validation silently.
const unsupportedKeywords = [
  '$ref',
  '$defs',
  'definitions',
  '$dynamicRef',
  '$anchor',
  'if',
  'then',
  'else',
  'patternProperties',
  'dependentRequired',
  'dependentSchemas',
  'dependencies',
  'contains',
  'minContains',
  'maxContains',
  'unevaluatedProperties',
  'unevaluatedItems'
]

export const checkedStringFormats = new Set([
  'email',
  'date',
  'time',
  'date-time',
  'uri',
  'uuid',
  'ipv4',
  'ipv6',
  'hostname'
])

const maxFormattedValueLength = 80
const patternCache = new Map<string, RegExp>()

export function validateJsonValue(value: unknown, schema: JsonSchema, path = ''): string[] {
  const errors: string[] = []
  validateValueNode(value, schema, path, errors)

  return errors
}

export function formatJsonValueValidationError(
  errors: string[],
  subject: 'input' | 'output' = 'input'
): string {
  return `${subject} validation failed: ${errors.join(' ')}`
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
  for (const keyword of unsupportedKeywords) {
    if (Object.hasOwn(node, keyword)) {
      errors.push(`${path}.${keyword} is not supported; inline the schema or remove the keyword.`)
    }
  }
  validateType(node, path, errors)
  validateProperties(node, path, errors)
  validateRequired(node, path, errors)
  validateItems(node, path, errors)
  validateSchemaList(node.prefixItems, `${path}.prefixItems`, errors)
  validateSchemaList(node.anyOf, `${path}.anyOf`, errors)
  validateSchemaList(node.oneOf, `${path}.oneOf`, errors)
  validateSchemaList(node.allOf, `${path}.allOf`, errors)
  if (node.not !== undefined) validateSchemaNode(node.not, `${path}.not`, errors)
  if (node.propertyNames !== undefined)
    validateSchemaNode(node.propertyNames, `${path}.propertyNames`, errors)
  validateEnum(node, path, errors)
  validateNumberKeyword(node.minimum, `${path}.minimum`, errors)
  validateNumberKeyword(node.maximum, `${path}.maximum`, errors)
  validateNumberKeyword(node.exclusiveMinimum, `${path}.exclusiveMinimum`, errors)
  validateNumberKeyword(node.exclusiveMaximum, `${path}.exclusiveMaximum`, errors)
  validateNumberKeyword(node.multipleOf, `${path}.multipleOf`, errors)
  if (typeof node.multipleOf === 'number' && node.multipleOf <= 0)
    errors.push(`${path}.multipleOf must be greater than 0.`)
  validateIntegerKeyword(node.minItems, `${path}.minItems`, errors)
  validateIntegerKeyword(node.maxItems, `${path}.maxItems`, errors)
  validateIntegerKeyword(node.minProperties, `${path}.minProperties`, errors)
  validateIntegerKeyword(node.maxProperties, `${path}.maxProperties`, errors)
  validateIntegerKeyword(node.minLength, `${path}.minLength`, errors)
  validateIntegerKeyword(node.maxLength, `${path}.maxLength`, errors)
  if (node.uniqueItems !== undefined && typeof node.uniqueItems !== 'boolean')
    errors.push(`${path}.uniqueItems must be a boolean.`)
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

    if (schema.properties && !Object.hasOwn(schema.properties, requiredName)) {
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

function validateSchemaList(schemas: unknown, path: string, errors: string[]): void {
  if (schemas === undefined) return

  if (!Array.isArray(schemas) || schemas.length === 0) {
    errors.push(`${path} must be a non-empty array of schemas.`)
    return
  }

  for (const [index, schema] of schemas.entries()) {
    validateSchemaNode(schema, `${path}[${index}]`, errors)
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

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number.`)
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
    new RegExp(value, 'u')
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

  if (schema.oneOf && countMatchingSchemas(value, schema.oneOf) !== 1) {
    errors.push(`${formatValuePath(path)} did not match exactly one allowed schema.`)
    return
  }

  for (const allOfSchema of schema.allOf ?? []) validateValueNode(value, allOfSchema, path, errors)

  if (schema.not && validateJsonValue(value, schema.not).length === 0) {
    errors.push(`${formatValuePath(path)} matched a disallowed schema.`)
    return
  }

  validateConstValue(value, schema, path, errors)
  validateEnumValue(value, schema, path, errors)
  validateObjectValue(value, schema, path, errors)
  validateArrayValue(value, schema, path, errors)
  validateNumberValue(value, schema, path, errors)
  validateStringValue(value, schema, path, errors)
}

function validateConstValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (schema.const === undefined || areJsonValuesEqual(value, schema.const)) return

  errors.push(
    `${formatValuePath(path)} expected ${formatJsonValue(schema.const)}, got ${formatJsonValue(value)}.`
  )
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

  const propertyCount = Object.keys(value).length
  if (schema.minProperties !== undefined && propertyCount < schema.minProperties) {
    errors.push(
      `${formatValuePath(path)} expected at least ${schema.minProperties} properties, got ${propertyCount}.`
    )
  }
  if (schema.maxProperties !== undefined && propertyCount > schema.maxProperties) {
    errors.push(
      `${formatValuePath(path)} expected at most ${schema.maxProperties} properties, got ${propertyCount}.`
    )
  }
  if (schema.propertyNames) {
    for (const propertyName of Object.keys(value)) {
      if (validateJsonValue(propertyName, schema.propertyNames).length > 0) {
        errors.push(
          `${formatValuePath(appendValuePath(path, propertyName))} has a disallowed property name.`
        )
      }
    }
  }

  for (const requiredName of schema.required ?? []) {
    if (!Object.hasOwn(value, requiredName)) {
      errors.push(`${formatValuePath(appendValuePath(path, requiredName))} is required.`)
    }
  }

  const properties = schema.properties ?? {}
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, propertyName)) {
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
      if (!Object.hasOwn(properties, propertyName)) {
        errors.push(`${formatValuePath(appendValuePath(path, propertyName))} is not allowed.`)
      }
    }
    return
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    for (const propertyName of Object.keys(value)) {
      if (!Object.hasOwn(properties, propertyName)) {
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
  if (!Array.isArray(value)) return

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(
      `${formatValuePath(path)} expected array length >= ${schema.minItems}, got ${value.length}.`
    )
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(
      `${formatValuePath(path)} expected array length <= ${schema.maxItems}, got ${value.length}.`
    )
  }

  if (schema.uniqueItems === true) {
    const duplicate = value.findIndex(function repeated(item, index) {
      return value.slice(0, index).some(function equal(previous) {
        return areJsonValuesEqual(previous, item)
      })
    })
    if (duplicate >= 0) {
      errors.push(
        `${formatValuePath(appendValuePath(path, String(duplicate)))} is a duplicate item.`
      )
    }
  }

  const prefixItems = schema.prefixItems ?? []
  value.forEach(function validateArrayItem(item, index) {
    const itemSchema = index < prefixItems.length ? prefixItems[index] : schema.items
    if (itemSchema)
      validateValueNode(item, itemSchema, appendValuePath(path, String(index)), errors)
  })
}

function validateNumberValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (typeof value !== 'number') return
  if (!Number.isFinite(value)) {
    errors.push(`${formatValuePath(path)} expected finite number, got ${getJsonValueType(value)}.`)
    return
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${formatValuePath(path)} expected number >= ${schema.minimum}, got ${value}.`)
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${formatValuePath(path)} expected number <= ${schema.maximum}, got ${value}.`)
  }

  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push(
      `${formatValuePath(path)} expected number > ${schema.exclusiveMinimum}, got ${value}.`
    )
  }

  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    errors.push(
      `${formatValuePath(path)} expected number < ${schema.exclusiveMaximum}, got ${value}.`
    )
  }

  if (schema.multipleOf !== undefined && !isMultipleOf(value, schema.multipleOf)) {
    errors.push(
      `${formatValuePath(path)} expected a multiple of ${schema.multipleOf}, got ${value}.`
    )
  }
}

function isMultipleOf(value: number, divisor: number): boolean {
  const quotient = value / divisor
  return Math.abs(quotient - Math.round(quotient)) < 1e-9
}

function validateStringValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[]
): void {
  if (typeof value !== 'string') return
  const errorCount = errors.length

  // UTF-16 length bounds the code point count, so most strings skip counting.
  if (schema.minLength !== undefined && value.length >= schema.minLength) {
    const length = countCodePoints(value)
    if (length < schema.minLength) {
      errors.push(
        `${formatValuePath(path)} expected string length >= ${schema.minLength}, got ${length}.`
      )
    }
  } else if (schema.minLength !== undefined) {
    errors.push(
      `${formatValuePath(path)} expected string length >= ${schema.minLength}, got ${countCodePoints(value)}.`
    )
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    const length = countCodePoints(value)
    if (length > schema.maxLength) {
      errors.push(
        `${formatValuePath(path)} expected string length <= ${schema.maxLength}, got ${length}.`
      )
    }
  }

  // A failed length bound skips pattern and format checks, so maxLength limits regular-expression work.
  if (errors.length > errorCount) return

  if (schema.pattern !== undefined && !getPattern(schema.pattern).test(value)) {
    errors.push(
      `${formatValuePath(path)} expected string matching ${schema.pattern}, got ${formatJsonValue(value)}.`
    )
  }

  if (schema.format !== undefined && !matchesKnownStringFormat(value, schema.format)) {
    errors.push(
      `${formatValuePath(path)} expected ${schema.format} format, got ${formatJsonValue(value)}.`
    )
  }
}

function countCodePoints(value: string): number {
  let count = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) index++
    }
    count++
  }
  return count
}

function getPattern(pattern: string): RegExp {
  let compiled = patternCache.get(pattern)
  if (!compiled) {
    if (patternCache.size >= 256) patternCache.clear()
    compiled = new RegExp(pattern, 'u')
    patternCache.set(pattern, compiled)
  }
  return compiled
}

function matchesJsonSchemaType(value: unknown, type: string | readonly string[]): boolean {
  if (Array.isArray(type)) {
    return type.some(function matchesAllowedType(allowedType) {
      return matchesJsonSchemaType(value, allowedType)
    })
  }

  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'null') return value === null
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'object') return isJsonObject(value)

  return typeof value === type
}

function matchesAnyOf(value: unknown, schemas: readonly JsonSchema[]): boolean {
  return schemas.some(function matchesAnyOfSchema(schema) {
    return validateJsonValue(value, schema).length === 0
  })
}

function countMatchingSchemas(value: unknown, schemas: readonly JsonSchema[]): number {
  return schemas.filter(function matchesSchema(schema) {
    return validateJsonValue(value, schema).length === 0
  }).length
}

function matchesKnownStringFormat(value: string, format: string): boolean {
  if (format === 'email') return /^[^\s@]+@[^\s@]+$/.test(value)
  if (format === 'date') return matchesCalendarDate(value)
  if (format === 'time') return matchesClockTime(value)
  if (format === 'date-time') {
    const parts = value.split('T')
    return (
      parts.length === 2 && matchesCalendarDate(parts[0] ?? '') && matchesClockTime(parts[1] ?? '')
    )
  }
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol)
    } catch {
      return false
    }
  }
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (format === 'ipv4') return matchesIPv4(value)
  if (format === 'ipv6') return matchesIPv6(value)
  if (format === 'hostname') {
    return (
      value.length <= 253 &&
      value.split('.').every(function label(part) {
        return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)
      })
    )
  }

  // Other formats are annotations; quality warnings tell authors they are not checked.
  return true
}

function matchesIPv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every(function octet(part) {
      return /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255
    })
  )
}

function matchesIPv6(value: string): boolean {
  if (
    !/^[0-9a-f:.]+$/i.test(value) ||
    value.includes(':::') ||
    value.split('::').length > 2 ||
    /^:[^:]|[^:]:$/.test(value)
  )
    return false
  let groups = value.split(':')
  const last = groups.at(-1) ?? ''
  if (last.includes('.')) {
    if (!matchesIPv4(last)) return false
    groups = [...groups.slice(0, -1), '0', '0']
  }
  const compressed = value.includes('::')
  const filled = groups.filter(function present(group) {
    return group !== ''
  })
  if (filled.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false
  return compressed ? filled.length < 8 : groups.length === 8
}

function matchesCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= (daysInMonth[month - 1] ?? 0)
}

function matchesClockTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return false

  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] === undefined ? 0 : Number(match[3])
  const offsetHour = match[4] === undefined ? 0 : Number(match[4])
  const offsetMinute = match[5] === undefined ? 0 : Number(match[5])

  return hour <= 23 && minute <= 59 && second <= 60 && offsetHour <= 23 && offsetMinute <= 59
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function formatExpectedType(type: string | readonly string[]): string {
  return typeof type === 'string' ? type : type.join(' or ')
}

function getJsonValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (Number.isInteger(value)) return 'integer'
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'
  if (value === Infinity) return 'Infinity'
  if (value === -Infinity) return '-Infinity'

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

// Error text reaches events, native agents and model prompts, so untrusted values are shortened.
function formatJsonValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  const text = typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? String(value))

  return text.length > maxFormattedValueLength
    ? `${text.slice(0, maxFormattedValueLength - 1)}…`
    : text
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every(function equalItem(value, index) {
        return areJsonValuesEqual(value, right[index])
      })
    )
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(function equalProperty(key) {
      return Object.hasOwn(right, key) && areJsonValuesEqual(left[key], right[key])
    })
  )
}
