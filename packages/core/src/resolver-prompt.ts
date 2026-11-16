import type {
  JsonSchema,
  ResolverContext,
  ResolverRunOptions,
  ToolAnnotations,
  ToolResolution
} from './interfaces/tool'
import { createToolResolutionSchema } from './resolution-validation'

export interface ResolverPromptTool {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}

/** Serializable tool fields shared by browser and server resolver requests. */
export type ResolverToolCatalogEntry = ResolverPromptTool

export function createResolverMessages(
  message: string,
  tools: ResolverPromptTool[],
  context: ResolverContext,
  singleStep = false,
  structured = false,
  purpose?: ResolverRunOptions['purpose']
) {
  return [
    {
      role: 'system',
      content:
        purpose === 'summary'
          ? 'Summarize the supplied conversation through the offered tool. Do not select application actions, ask for clarification, or answer the original request. ' +
            (structured
              ? 'Return only JSON with an action object containing toolName, input, confidence, and reason.'
              : 'Return only JSON with toolName, input, confidence, and reason.')
          : singleStep
            ? 'Choose exactly one next app tool, needs_clarification, or no_tools_match. Never return tool_sequence or steps. ' +
              (structured
                ? 'Return only JSON with an action object containing toolName, input, confidence, and reason.'
                : 'Return only JSON with toolName, input, confidence, and reason.')
            : 'Choose one app tool, a short ordered tool_sequence, needs_clarification, or no_tools_match. Return only JSON with toolName, input, confidence, reason, and optional steps.'
    },
    {
      role: 'user',
      content: createResolverPrompt(message, tools, context, singleStep, structured, purpose)
    }
  ]
}

export function createResolverPrompt(
  message: string,
  tools: ResolverPromptTool[],
  context: ResolverContext,
  singleStep = false,
  structured = false,
  purpose?: ResolverRunOptions['purpose'],
  schemaSupplied = structured
): string {
  singleStep ||= purpose === 'summary'
  function outcomeExample(toolName: string, reason: string) {
    const resolution: ToolResolution = { toolName, input: {}, confidence: 0, reason }
    return JSON.stringify(structured && singleStep ? { action: resolution } : resolution)
  }
  return [
    `User request: ${message}`,
    `Current app context:\n${JSON.stringify(context)}`,
    `Available tools:\n${JSON.stringify(createResolverToolCatalog(tools))}`,
    'Put only the selected tool arguments inside input. confidence and reason are siblings of toolName, never inside input unless the tool explicitly defines them.',
    ...(purpose === 'summary'
      ? []
      : [
          'Choose the best tool and exact parameters from the current app context. Prefer stable IDs from context over labels.',
          singleStep
            ? 'Choose only the next unfinished action. Return one tool invocation, never a sequence or steps. Wait for the actual result before choosing another action. Never invent future tool results or placeholders.'
            : 'If the request requires multiple app actions, return a chained resolution with toolName "tool_sequence", input {}, and steps ordered by dependency. Use at most 5 steps. Each step must use one available tool and must be executable after the previous step updates app state.',
          `If the request is missing required information that is not present in context, return ${outcomeExample('needs_clarification', 'Ask for the missing information.')}.`,
          `If none of the available tools can satisfy the request, return ${outcomeExample('no_tools_match', 'Explain what kind of app action is available instead.')}.`
        ]),
    ...(schemaSupplied
      ? [
          'Follow the response schema supplied by the model API.' +
            (structured && singleStep ? ' Wrap the single resolution in action.' : '')
        ]
      : [
          'Return only valid JSON matching this schema:',
          JSON.stringify(createToolResolutionSchema(tools, singleStep, purpose))
        ])
  ].join('\n\n')
}

export function createResolverToolCatalog(tools: ResolverPromptTool[]): ResolverToolCatalogEntry[] {
  return tools.map(function catalog(tool) {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {})
    }
  })
}
