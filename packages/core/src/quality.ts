import type { WebMCPTool } from './interfaces/tool'

const sensitiveWords = ['delete', 'remove', 'void', 'charge', 'pay', 'send', 'publish', 'export', 'email']
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

  return warnings
}
