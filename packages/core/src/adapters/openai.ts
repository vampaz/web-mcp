import type { AnyWebMCPTool, JsonSchema } from '../interfaces/tool'

export interface OpenAIFunctionTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export function formatOpenAITool(tool: AnyWebMCPTool): OpenAIFunctionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeParameters(tool.inputSchema)
    }
  }
}

export function formatOpenAITools(tools: readonly AnyWebMCPTool[]): OpenAIFunctionTool[] {
  return tools.map(formatOpenAITool)
}

function normalizeParameters(schema: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: schema.properties ?? {},
    required: schema.required ?? [],
    additionalProperties: schema.additionalProperties ?? false
  }
}
