import type { WebMCPTool } from './interfaces/tool'

const sensitiveWords = ['delete', 'remove', 'void', 'charge', 'pay', 'send', 'publish', 'export', 'email']
const sensitiveFieldWords = ['password', 'token', 'secret', 'card', 'iban', 'ssn', 'tax', 'credential', 'api_key']
const weakWords = ['do', 'thing', 'stuff', 'manage', 'handle', 'process']

export function getToolWarnings<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): string[] {
  const warnings: string[] = []

  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    warnings.push('Use a stable snake_case tool name so agents can call it reliably.')
  }

  if (tool.description.trim().length < 40) {
    warnings.push('Description is too short; explain when the agent should use this tool.')
  }

  if (weakWords.some((word) => tool.description.toLowerCase().includes(word))) {
    warnings.push('Description uses vague wording; prefer concrete action language.')
  }

  if (tool.inputSchema.type !== 'object') {
    warnings.push('Input schema should usually be an object with named parameters.')
  }

  const looksSensitive = sensitiveWords.some((word) => tool.name.includes(word) || tool.description.toLowerCase().includes(word))
  if (looksSensitive && !tool.confirmation?.required) {
    warnings.push('Sensitive action likely needs explicit confirmation metadata.')
  }

  if (tool.inputSchema['x-webmcp-source'] === 'form') {
    warnings.push(...getFormToolWarnings(tool))
  }

  return warnings
}

function getFormToolWarnings<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): string[] {
  const warnings: string[] = []

  for (const [fieldName, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
    const description = schema.description?.trim()
    if (!description || description.toLowerCase() === fieldName.toLowerCase()) {
      warnings.push(`Form field "${fieldName}" needs a specific tool description.`)
    }

    if (isUnconstrainedField(schema)) {
      warnings.push(`Form field "${fieldName}" is exposed without validation constraints.`)
    }

    const fieldText = `${fieldName} ${description ?? ''}`.toLowerCase()
    const looksSensitive = sensitiveFieldWords.some((word) => fieldText.includes(word))
    if (looksSensitive && !tool.confirmation?.required) {
      warnings.push(`Sensitive form field "${fieldName}" should require explicit confirmation or be excluded.`)
    }
  }

  return warnings
}

function isUnconstrainedField(schema: WebMCPTool['inputSchema']): boolean {
  if (schema.enum?.length) return false

  if (schema.type === 'string') {
    return schema.minLength === undefined && schema.maxLength === undefined && schema.pattern === undefined
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return schema.minimum === undefined && schema.maximum === undefined
  }

  return false
}
