import {
  getErrorMessage,
  normalizeJsonText,
  toolPlanSchema,
  validateToolPlan,
  type PlannerContext,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPTool
} from 'webmcp-kit'

import type {
  BrowserLocalAIPlannerOptions,
  NavigatorWithGpu,
  WebLLMEngine,
  WebLLMInitProgressReport,
  WebLLMModule
} from '@/interfaces/browser-local-ai'
import { createDemoHeuristicPlanner } from '@/utils/demo-heuristic-planner'

export const defaultBrowserLocalAIModel = 'Qwen3.5-2B-q4f16_1-MLC'

export function createBrowserLocalAIPlanner(
  options: BrowserLocalAIPlannerOptions = { model: defaultBrowserLocalAIModel }
): ToolPlanner {
  let engine: WebLLMEngine | undefined
  let enginePromise: Promise<WebLLMEngine> | undefined
  const planner: ToolPlanner = {
    name: 'Browser local AI',
    available: true,
    status: 'downloadable',
    detail: `Browser local AI will download and run ${options.model} with WebGPU on the first command.`,
    async plan(message: string, tools: WebMCPTool[], context: PlannerContext = {}) {
      try {
        await assertWebGPUAvailable()
        enginePromise ??= createWebLLMEngine(options.model, planner)
        engine ??= await enginePromise
        const modelPlan = await planWithWebLLM(engine, options.model, message, tools, context)
        const plan = await repairBrowserLocalAIPlan(modelPlan, message, tools, context)
        validateToolPlan(plan, tools)
        planner.status = 'ready'
        planner.detail = `Browser local AI is running ${options.model} locally with WebGPU.`
        return plan
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        if (!engine) enginePromise = undefined
        planner.status = engine ? 'ready' : 'unavailable'
        planner.detail = errorMessage
        throw new Error(`Browser local AI could not plan this command (${errorMessage})`)
      }
    },
    dispose() {
      void engine?.unload?.()
      engine = undefined
      enginePromise = undefined
      planner.status = 'downloadable'
      planner.detail = `Browser local AI will download and run ${options.model} with WebGPU on the first command.`
    }
  }

  return planner
}

async function repairBrowserLocalAIPlan(
  plan: ToolPlan,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): Promise<ToolPlan> {
  if (
    !tools.some(function hasSelectItemsTool(tool) {
      return tool.name === 'select_items'
    })
  ) {
    return plan
  }

  try {
    const groundedPlan = await createDemoHeuristicPlanner().plan(message, tools, context)
    if (groundedPlan.toolName !== 'select_items') return plan
    if (!Array.isArray(groundedPlan.input.ids) || groundedPlan.input.ids.length === 0) return plan

    return {
      ...groundedPlan,
      confidence: Math.max(groundedPlan.confidence, plan.confidence),
      reason: `Browser local AI plan grounded against visible checklist context. ${groundedPlan.reason}`
    }
  } catch {
    return plan
  }
}

async function assertWebGPUAvailable(): Promise<void> {
  if (typeof navigator === 'undefined') {
    throw new Error('Browser local AI needs a browser with WebGPU support.')
  }

  try {
    const adapter = await (navigator as NavigatorWithGpu).gpu?.requestAdapter()
    if (!adapter) throw new Error('WebGPU adapter unavailable.')
  } catch {
    throw new Error('Browser local AI needs WebGPU support in this browser.')
  }
}

async function createWebLLMEngine(model: string, planner: ToolPlanner): Promise<WebLLMEngine> {
  planner.status = 'downloading'
  planner.detail = `Browser local AI is loading ${model}.`
  const webllm = (await import('@mlc-ai/web-llm')) as unknown as WebLLMModule
  const createdEngine = await webllm.CreateMLCEngine(model, {
    initProgressCallback(report) {
      planner.status = 'downloading'
      planner.detail = getProgressDetail(model, report)
    }
  })
  planner.status = 'ready'
  planner.detail = `Browser local AI is running ${model} locally with WebGPU.`
  return createdEngine
}

async function planWithWebLLM(
  engine: WebLLMEngine,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): Promise<ToolPlan> {
  const response = await engine.chat.completions.create({
    model,
    messages: createPlannerMessages(message, tools, context),
    response_format: {
      type: 'json_object',
      schema: JSON.stringify(toolPlanSchema)
    },
    temperature: 0,
    max_tokens: 512
  })
  const content = response.choices?.[0]?.message?.content
  if (!content) throw new Error('provider returned no message content')

  return normalizeBrowserLocalAIPlan(
    JSON.parse(normalizeJsonText(content, 'Browser local AI')) as ToolPlan
  )
}

function createPlannerMessages(message: string, tools: WebMCPTool[], context: PlannerContext) {
  const promptContext = getPromptContext(message, tools, context)

  return [
    {
      role: 'system',
      content:
        'You are a browser app tool planner. Choose the tool whose description matches the requested action. Use only IDs and values that appear in the current app context. Return only JSON with toolName, input, confidence, reason, and optional steps.'
    },
    {
      role: 'user',
      content: createPlannerPrompt(message, tools, promptContext)
    }
  ]
}

function getPromptContext(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): PlannerContext {
  if (!isSortRequest(message, tools)) return context

  const compactContext = { ...(context as Record<string, unknown>) }
  const omittedRows: Record<string, number> = {}

  omitContextRows(compactContext, omittedRows, 'checklistItems')
  omitContextRows(compactContext, omittedRows, 'invoices')
  omitContextRows(compactContext, omittedRows, 'selectedInvoices')
  omitContextRows(compactContext, omittedRows, 'visibleInvoices')

  if (Object.keys(omittedRows).length > 0) {
    compactContext.omittedRows = omittedRows
  }

  return compactContext
}

function isSortRequest(message: string, tools: WebMCPTool[]): boolean {
  if (!message.toLowerCase().includes('sort')) return false

  return tools.some(function hasSortTool(tool) {
    return tool.name === 'sort_inventory' || tool.name === 'sort_invoices'
  })
}

function omitContextRows(
  context: Record<string, unknown>,
  omittedRows: Record<string, number>,
  key: string
) {
  const value = context[key]
  if (!Array.isArray(value)) return

  omittedRows[key] = value.length
  delete context[key]
}

function createPlannerPrompt(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): string {
  return [
    `User request: ${message}`,
    `Current app context:\n${JSON.stringify(context, null, 2)}`,
    `Available tools:\n${JSON.stringify(createToolCatalog(tools), null, 2)}`,
    `Sort tool options:\n${JSON.stringify(createSortToolOptions(tools), null, 2)}`,
    'Choose the best tool and exact parameters from the current app context. Prefer stable IDs from context over labels.',
    'For sort requests, choose the matching sort tool directly. Do not return tool_sequence for a single sort. Use sortBy exactly from the advertised sort tool options and direction as "asc" or "desc".',
    'For category requests such as "all liquids", include every matching item from context, not only a few examples.',
    'The input field must contain actual argument values for the selected tool. Never copy a tool inputSchema into input.',
    'Do not copy placeholder IDs from examples. Placeholder IDs are intentionally invalid.',
    'Only choose clear, reset, delete, remove, or discard tools when the user explicitly asks to clear, reset, delete, remove, discard, or undo something.',
    'If the request requires multiple app actions, return a chained plan with toolName "tool_sequence", input {}, and steps ordered by dependency. Use at most 5 steps. Each step must use one available tool and must be executable after the previous step updates app state.',
    'Return exactly one compact JSON object. Shape example only, with invalid placeholder IDs: {"toolName":"select_items","input":{"ids":["id_from_context_a","id_from_context_b"]},"confidence":0.9,"reason":"Selected every matching item ID from context."}'
  ].join('\n\n')
}

function createToolCatalog(tools: WebMCPTool[]) {
  return tools.map(function mapTool(tool) {
    return {
      name: tool.name,
      description: tool.description,
      inputExample: createInputExample(tool.inputSchema)
    }
  })
}

function createInputExample(inputSchema: WebMCPTool['inputSchema']): Record<string, unknown> {
  if (!inputSchema || inputSchema.type !== 'object') return {}
  const properties = inputSchema.properties
  if (!properties || typeof properties !== 'object') return {}

  const example: Record<string, unknown> = {}
  for (const [key, propertySchema] of Object.entries(properties)) {
    example[key] = createPropertyExample(propertySchema)
  }

  return example
}

function createPropertyExample(propertySchema: unknown): unknown {
  if (!propertySchema || typeof propertySchema !== 'object') return 'value'
  const enumValues = (propertySchema as { enum?: unknown }).enum
  if (Array.isArray(enumValues) && enumValues.length > 0) return enumValues[0]
  const type = (propertySchema as { type?: unknown }).type

  if (type === 'array') return ['id_from_context']
  if (type === 'number' || type === 'integer') return 0
  if (type === 'boolean') return true
  if (type === 'object') return {}

  return 'value_from_context'
}

function createSortToolOptions(tools: WebMCPTool[]) {
  return tools.flatMap(function mapSortTool(tool) {
    if (!tool.name.startsWith('sort_')) return []

    return [
      {
        toolName: tool.name,
        sortBy: getStringEnumValues(tool.inputSchema?.properties?.sortBy),
        direction: getStringEnumValues(tool.inputSchema?.properties?.direction)
      }
    ]
  })
}

function getStringEnumValues(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return []
  const enumValues = (schema as { enum?: unknown }).enum
  if (!Array.isArray(enumValues)) return []

  return enumValues.filter(function isStringEnumValue(value): value is string {
    return typeof value === 'string'
  })
}

function normalizeBrowserLocalAIPlan(plan: ToolPlan): ToolPlan {
  if (plan?.toolName === 'tool_sequence') return plan
  if (!Array.isArray(plan?.steps)) return plan

  if (plan.steps.length === 1) return plan.steps[0]

  return {
    toolName: 'tool_sequence',
    input: {},
    confidence: plan.confidence,
    reason: plan.reason,
    steps: plan.steps
  }
}

function getProgressDetail(model: string, report: WebLLMInitProgressReport): string {
  if (report.text) return `Browser local AI is loading ${model}: ${report.text}`
  if (typeof report.progress === 'number') {
    return `Browser local AI is loading ${model}: ${Math.round(report.progress * 100)}%`
  }

  return `Browser local AI is loading ${model}.`
}
