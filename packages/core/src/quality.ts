import type { JsonSchema, WebMCPTool } from './interfaces/tool'
import { checkedStringFormats } from './schema'

// Matched with common inflections (deletes, sending, created); docs/security.md lists the core verbs.
const sensitiveWords = [
  'create',
  'delete',
  'remove',
  'trash',
  'destroy',
  'void',
  'cancel',
  'refund',
  'charge',
  'pay',
  'purchase',
  'buy',
  'checkout',
  'transfer',
  'send',
  'notify',
  'submit',
  'publish',
  'export',
  'email'
]
const sensitiveFieldWords = [
  'password',
  'token',
  'secret',
  'card',
  'iban',
  'ssn',
  'tax',
  'credential',
  'api_key'
]
const weakWords = ['do', 'thing', 'stuff', 'manage', 'handle', 'process']

export interface ToolLintIssue {
  id: string
  message: string
}

export function lintTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): ToolLintIssue[] {
  const issues: ToolLintIssue[] = []

  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    issues.push({
      id: 'name-format',
      message: 'Use a stable snake_case tool name so agents can call it reliably.'
    })
  }

  if (tool.description.trim().length < 40) {
    issues.push({
      id: 'description-too-short',
      message: 'Description is too short; explain when the agent should use this tool.'
    })
  }

  if (weakWords.some((word) => containsWord(tool.description, word))) {
    issues.push({
      id: 'description-vague',
      message: 'Description uses vague wording; prefer concrete action language.'
    })
  }

  if (tool.inputSchema.type !== 'object') {
    issues.push({
      id: 'input-schema-not-object',
      message: 'Input schema should usually be an object with named parameters.'
    })
  }

  const sensitiveName = sensitiveWords.some((word) => containsVerb(tool.name, word))
  const looksSensitive =
    sensitiveName || sensitiveWords.some((word) => containsVerb(tool.description, word))
  if (looksSensitive && !tool.confirmation && tool.annotations?.readOnlyHint !== true) {
    issues.push({
      id: 'sensitive-action-without-confirmation',
      message: 'Sensitive action likely needs explicit confirmation metadata.'
    })
  }

  if (sensitiveName && tool.annotations?.readOnlyHint === true) {
    issues.push({
      id: 'sensitive-read-only',
      message:
        'readOnlyHint is true, but the tool name suggests a sensitive action; use readOnlyHint only for safe reads.'
    })
  }

  for (const [path, format] of findUncheckedFormats(tool.inputSchema, 'inputSchema')) {
    issues.push({
      id: 'unchecked-string-format',
      message: `${path} uses format "${format}", which is not checked; add a pattern or validate in parseInput().`
    })
  }

  for (const path of findPatternsWithoutMaxLength(tool.inputSchema, 'inputSchema')) {
    issues.push({
      id: 'pattern-without-max-length',
      message: `${path} uses a pattern without maxLength; add maxLength to bound regular-expression work.`
    })
  }

  if (tool.inputSchema['x-webmcp-source'] === 'form') {
    issues.push(...getFormToolIssues(tool))
  } else {
    for (const path of findPropertiesWithoutDescription(tool.inputSchema, 'inputSchema')) {
      issues.push({
        id: 'missing-property-description',
        message: `${path} needs a description.`
      })
    }
  }

  return issues
}

/** String warnings retained on RegisteredTool; use lintTool() when a test needs stable rule IDs. */
export function getToolWarnings<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): string[] {
  return lintTool(tool).map(function message(issue) {
    return issue.message
  })
}

function findUncheckedFormats(schema: JsonSchema, path: string): [string, string][] {
  const found: [string, string][] =
    typeof schema.format === 'string' && !checkedStringFormats.has(schema.format)
      ? [[path, schema.format]]
      : []
  for (const [name, child] of Object.entries(schema.properties ?? {}))
    found.push(...findUncheckedFormats(child, `${path}.properties.${name}`))
  if (schema.items) found.push(...findUncheckedFormats(schema.items, `${path}.items`))
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    for (const [index, child] of (schema[key] ?? []).entries())
      found.push(...findUncheckedFormats(child, `${path}.${key}[${index}]`))
  }
  return found
}

function findPatternsWithoutMaxLength(schema: JsonSchema, path: string): string[] {
  const found: string[] =
    schema.pattern !== undefined && schema.maxLength === undefined ? [path] : []
  for (const [name, child] of Object.entries(schema.properties ?? {}))
    found.push(...findPatternsWithoutMaxLength(child, `${path}.properties.${name}`))
  if (schema.items) found.push(...findPatternsWithoutMaxLength(schema.items, `${path}.items`))
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    for (const [index, child] of (schema[key] ?? []).entries())
      found.push(...findPatternsWithoutMaxLength(child, `${path}.${key}[${index}]`))
  }
  if (schema.not) found.push(...findPatternsWithoutMaxLength(schema.not, `${path}.not`))
  if (schema.propertyNames)
    found.push(...findPatternsWithoutMaxLength(schema.propertyNames, `${path}.propertyNames`))
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    found.push(
      ...findPatternsWithoutMaxLength(schema.additionalProperties, `${path}.additionalProperties`)
    )
  return found
}

function getFormToolIssues<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): ToolLintIssue[] {
  const issues: ToolLintIssue[] = []

  for (const [fieldName, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
    const description = schema.description?.trim()
    if (!description || description.toLowerCase() === fieldName.toLowerCase()) {
      issues.push({
        id: 'form-field-description',
        message: `Form field "${fieldName}" needs a specific tool description.`
      })
    }

    if (isUnconstrainedField(schema)) {
      issues.push({
        id: 'form-field-unconstrained',
        message: `Form field "${fieldName}" is exposed without validation constraints.`
      })
    }

    const fieldText = `${fieldName} ${description ?? ''}`.toLowerCase()
    const looksSensitive = sensitiveFieldWords.some((word) => containsWord(fieldText, word))
    if (looksSensitive && !tool.confirmation) {
      issues.push({
        id: 'form-field-sensitive',
        message: `Sensitive form field "${fieldName}" should require explicit confirmation or be excluded.`
      })
    }
  }

  return issues
}

function findPropertiesWithoutDescription(schema: JsonSchema, path: string): string[] {
  const found: string[] = []
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    const propertyPath = `${path}.properties.${name}`
    if (!child.description?.trim()) found.push(propertyPath)
    found.push(...findPropertiesWithoutDescription(child, propertyPath))
  }
  if (schema.items) found.push(...findPropertiesWithoutDescription(schema.items, `${path}.items`))
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    for (const [index, child] of (schema[key] ?? []).entries())
      found.push(...findPropertiesWithoutDescription(child, `${path}.${key}[${index}]`))
  }
  if (schema.not) found.push(...findPropertiesWithoutDescription(schema.not, `${path}.not`))
  if (schema.propertyNames)
    found.push(...findPropertiesWithoutDescription(schema.propertyNames, `${path}.propertyNames`))
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    found.push(
      ...findPropertiesWithoutDescription(
        schema.additionalProperties,
        `${path}.additionalProperties`
      )
    )
  return found
}

function isUnconstrainedField(schema: WebMCPTool['inputSchema']): boolean {
  if (schema.enum?.length) return false

  if (schema.type === 'string') {
    return (
      schema.minLength === undefined &&
      schema.maxLength === undefined &&
      schema.pattern === undefined
    )
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return schema.minimum === undefined && schema.maximum === undefined
  }

  return false
}

function containsWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/_/g, ' ')}\\b`).test(normalizeWords(text))
}

function containsVerb(text: string, verb: string): boolean {
  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb
  return new RegExp(`\\b${stem}(?:e|es|s|ed|d|ing)?\\b`).test(normalizeWords(text))
}

function normalizeWords(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
}
