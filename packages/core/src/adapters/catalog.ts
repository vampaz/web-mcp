import type { JsonSchema, RegisteredTool, ToolConfirmation, ToolScopeResult } from '../interfaces/tool'

export interface ToolCatalog {
  title: string
  tools: ToolCatalogEntry[]
}

export interface ToolCatalogEntry {
  name: string
  description: string
  mode: RegisteredTool['mode']
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  confirmation?: ToolConfirmation
  examples: unknown[]
  warnings: string[]
  available: boolean
  unavailableReason?: string
}

export interface ToolCatalogOptions {
  title?: string
}

interface CatalogRegistration {
  tool: {
    name: string
    description: string
    inputSchema: JsonSchema
    outputSchema?: JsonSchema
    confirmation?: ToolConfirmation
    examples?: unknown[]
    scope?: () => ToolScopeResult
  }
  mode: RegisteredTool['mode']
  warnings: string[]
}

export function createToolCatalog(registrations: CatalogRegistration[], options: ToolCatalogOptions = {}): ToolCatalog {
  return {
    title: options.title ?? 'WebMCP Tool Catalog',
    tools: registrations.map(function mapRegistration(registration) {
      const availability = registration.tool.scope?.()

      return {
        name: registration.tool.name,
        description: registration.tool.description,
        mode: registration.mode,
        inputSchema: registration.tool.inputSchema,
        outputSchema: registration.tool.outputSchema,
        confirmation: registration.tool.confirmation,
        examples: registration.tool.examples ?? [],
        warnings: registration.warnings,
        available: availability?.available ?? true,
        unavailableReason: availability?.reason
      }
    })
  }
}

export function formatToolCatalogMarkdown(catalog: ToolCatalog): string {
  const sections = [
    `# ${catalog.title}`,
    `Tools: ${catalog.tools.length}`,
    ...catalog.tools.map(formatCatalogEntry)
  ]

  return `${sections.join('\n\n')}\n`
}

function formatCatalogEntry(entry: ToolCatalogEntry): string {
  const lines = [
    `## ${entry.name}`,
    '',
    entry.description,
    '',
    `- Mode: ${entry.mode}`,
    `- Available: ${entry.available ? 'yes' : 'no'}`
  ]

  if (entry.unavailableReason) {
    lines.push(`- Unavailable reason: ${entry.unavailableReason}`)
  }

  if (entry.confirmation?.required) {
    lines.push(`- Confirmation: ${entry.confirmation.reason}`)
  }

  if (entry.warnings.length > 0) {
    lines.push('', 'Warnings:')
    for (const warning of entry.warnings) {
      lines.push(`- ${warning}`)
    }
  }

  lines.push('', 'Input schema:', '', '```json', JSON.stringify(entry.inputSchema, null, 2), '```')

  if (entry.outputSchema) {
    lines.push('', 'Output schema:', '', '```json', JSON.stringify(entry.outputSchema, null, 2), '```')
  }

  if (entry.examples.length > 0) {
    lines.push('', 'Examples:', '', '```json', JSON.stringify(entry.examples, null, 2), '```')
  }

  return lines.join('\n')
}
