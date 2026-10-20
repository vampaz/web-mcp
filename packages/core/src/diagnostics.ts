import { getToolAvailability } from './availability'
import { hasConfirmationHandler } from './confirmation'
import type {
  IntegrationDiagnostic,
  IntegrationHealthReport,
  RegisteredTool,
  ToolResolver
} from './interfaces/tool'
import { getRegistrySnapshot, listTools } from './registry'

export interface IntegrationHealthOptions {
  resolver?: ToolResolver
}

export function getIntegrationHealthReport(
  options: IntegrationHealthOptions = {}
): IntegrationHealthReport {
  const snapshot = getRegistrySnapshot()
  const tools = listTools()
  const diagnostics = [
    ...getRegistryDiagnostics(tools),
    ...getToolDiagnostics(tools),
    ...getResolverDiagnostics(options.resolver)
  ]
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length

  return {
    status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ready',
    summary: getSummary(snapshot.toolCount, errorCount, warningCount),
    supportLabel: snapshot.supportLabel,
    nativeWebMCP: snapshot.nativeWebMCP,
    toolCount: snapshot.toolCount,
    diagnostics
  }
}

export function assertWebMCPIntegration(
  options: IntegrationHealthOptions = {}
): IntegrationHealthReport {
  const report = getIntegrationHealthReport(options)
  if (report.status === 'error') {
    throw new Error(report.summary)
  }

  return report
}

function getRegistryDiagnostics(tools: RegisteredTool[]): IntegrationDiagnostic[] {
  if (tools.length > 0) return []

  return [
    {
      id: 'no-tools-registered',
      severity: 'error',
      title: 'No WebMCP tools are registered',
      detail:
        'The app is running WebMCP Kit, but agents cannot do anything until at least one tool is registered.',
      action: 'Register a tool with registerTool(), a framework helper, or registerFormTool().'
    }
  ]
}

function getToolDiagnostics(tools: RegisteredTool[]): IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = []
  const confirmationConfigured = hasConfirmationHandler()

  for (const registration of tools) {
    const tool = registration.tool

    for (const warning of registration.warnings) {
      diagnostics.push({
        id: `tool-warning:${tool.name}:${warning}`,
        severity: 'warning',
        title: `Improve ${tool.name}`,
        detail: warning,
        action: 'Tighten the tool name, description, schema, or confirmation metadata.',
        toolName: tool.name
      })
    }

    if (tool.inputSchema.type === 'object' && tool.inputSchema.additionalProperties !== false) {
      diagnostics.push({
        id: `schema-allows-extra-properties:${tool.name}`,
        severity: 'warning',
        title: `${tool.name} accepts extra input properties`,
        detail:
          'Object schemas should usually set additionalProperties: false so model-generated input stays predictable.',
        action: 'Add additionalProperties: false and list required fields explicitly.',
        toolName: tool.name
      })
    }

    if (tool.confirmation && !tool.confirmation.handler && !confirmationConfigured) {
      diagnostics.push({
        id: `missing-confirmation-handler:${tool.name}`,
        severity: 'warning',
        title: `${tool.name} will use the browser confirmation fallback`,
        detail: 'This tool requires confirmation, but no app confirmation handler is installed.',
        action: 'Install setConfirmationHandler() so approval happens in your own UI.',
        toolName: tool.name
      })
    }

    const scopeDiagnostic = getScopeDiagnostic(registration)
    if (scopeDiagnostic) {
      diagnostics.push(scopeDiagnostic)
    }
  }

  return diagnostics
}

function getScopeDiagnostic(registration: RegisteredTool): IntegrationDiagnostic | undefined {
  const tool = registration.tool
  if (!tool.scope) return undefined

  const availability = getToolAvailability(tool)
  if (availability.available) return undefined
  if (!availability.failed) {
    return {
      id: `tool-unavailable:${tool.name}`,
      severity: 'info',
      title: `${tool.name} is unavailable right now`,
      detail: availability.reason ?? 'The tool scope returned unavailable.',
      action: 'This is okay when it matches the current app state.',
      toolName: tool.name
    }
  } else {
    return {
      id: `tool-scope-failed:${tool.name}`,
      severity: 'error',
      title: `${tool.name} scope failed`,
      detail: availability.reason ?? 'Tool scope failed.',
      action: 'Fix the scope() function so devtools and resolvers can safely check availability.',
      toolName: tool.name
    }
  }
}

function getResolverDiagnostics(resolver: ToolResolver | undefined): IntegrationDiagnostic[] {
  if (!resolver) return []

  if (resolver.available && resolver.status === 'ready') {
    return [
      {
        id: 'resolver-ready',
        severity: 'info',
        title: `${resolver.name} resolver is ready`,
        detail: resolver.detail,
        action: 'Run a command through the demo or your app command input.'
      }
    ]
  }

  return [
    {
      id: `resolver-${resolver.status}`,
      severity:
        resolver.status === 'needs-key' || resolver.status === 'unavailable' ? 'warning' : 'info',
      title: `${resolver.name} resolver is ${resolver.status}`,
      detail: resolver.detail,
      action: 'Check the selected provider, model, endpoint, and server environment.'
    }
  ]
}

function getSummary(toolCount: number, errorCount: number, warningCount: number): string {
  if (errorCount > 0) {
    return `${errorCount} integration error${errorCount === 1 ? '' : 's'} found.`
  }

  if (warningCount > 0) {
    return `${toolCount} tool${toolCount === 1 ? '' : 's'} registered with ${warningCount} warning${warningCount === 1 ? '' : 's'}.`
  }

  return `${toolCount} tool${toolCount === 1 ? '' : 's'} registered and ready.`
}
