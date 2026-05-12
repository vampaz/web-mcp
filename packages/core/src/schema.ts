import type { JsonSchema } from './interfaces/tool'

const supportedTypes = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array', 'null'])

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
  validateEnum(node, path, errors)
  validateNumberKeyword(node.minimum, `${path}.minimum`, errors)
  validateNumberKeyword(node.maximum, `${path}.maximum`, errors)
  validateAdditionalProperties(node, path, errors)
}

function validateType(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.type === undefined) return

  if (typeof schema.type !== 'string' || !supportedTypes.has(schema.type)) {
    errors.push(`${path}.type must be one of ${Array.from(supportedTypes).join(', ')}.`)
  }
}

function validateProperties(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.properties === undefined) return

  if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
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
      errors.push(`${path}.required includes "${requiredName}", but ${path}.properties does not define it.`)
    }
  }
}

function validateItems(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.items === undefined) return

  validateSchemaNode(schema.items, `${path}.items`, errors)
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

function validateAdditionalProperties(schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.additionalProperties === undefined) return

  if (typeof schema.additionalProperties === 'boolean') return

  validateSchemaNode(schema.additionalProperties, `${path}.additionalProperties`, errors)
}
