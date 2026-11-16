import {
  getTool,
  invokeTool,
  type JsonSchema,
  type RegisteredTool,
  type ToolAnnotations,
  type ToolInvocationResult
} from '@vampaz/webmcp-kit'
import { listAvailableTools } from '../../core/src/registry'

export interface MCPBridgeTool {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}

export interface MCPBridgeRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: 'tools/list' | 'tools/call'
  params?: Record<string, unknown>
}

export interface MCPBridgeResponse {
  jsonrpc: '2.0'
  id?: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

export interface MCPBridge {
  listTools: () => MCPBridgeTool[]
  callTool: (name: string, input: Record<string, unknown>) => Promise<ToolInvocationResult>
  handleRequest: (request: MCPBridgeRequest) => Promise<MCPBridgeResponse>
}

export function createLocalMCPBridge(): MCPBridge {
  return {
    listTools: listToolsForBridge,
    callTool,
    handleRequest
  }
}

function listToolsForBridge(): MCPBridgeTool[] {
  return listAvailableTools().map(toBridgeTool)
}

async function callTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolInvocationResult> {
  return invokeTool({
    toolName: name,
    input,
    source: 'mcp-bridge'
  })
}

async function handleRequest(request: MCPBridgeRequest): Promise<MCPBridgeResponse> {
  if (!isRecord(request)) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Expected a JSON-RPC request object.' }
    }
  }

  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: listToolsForBridge()
      }
    }
  }

  if (request.method === 'tools/call') {
    const name = request.params?.name
    const input = request.params?.arguments ?? {}

    if (typeof name !== 'string' || !isRecord(input)) {
      return createErrorResponse(request, -32602, 'Expected params.name and params.arguments.')
    }

    // Read the schema before the call: a tool can unregister itself while it runs.
    const declaresOutput = Boolean(getTool(name)?.tool.outputSchema)
    const result = await callTool(name, input)
    const text = serializeResult(result)
    if (text === undefined) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: 'Tool result could not be serialized.' }],
          isError: true
        }
      }
    }
    // MCP requires structured content, which may be any JSON value, when an output schema is declared.
    const structured = declaresOutput && result.status === 'success' && result.output !== undefined

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text
          }
        ],
        ...(structured ? { structuredContent: result.output } : {}),
        isError: result.status !== 'success'
      }
    }
  }

  return createErrorResponse(request, -32601, `Unsupported MCP bridge method "${request.method}".`)
}

function toBridgeTool(registration: RegisteredTool): MCPBridgeTool {
  const { outputSchema, annotations } = registration.tool
  return {
    name: registration.tool.name,
    description: registration.tool.description,
    inputSchema: structuredClone(registration.tool.inputSchema),
    ...(outputSchema ? { outputSchema: structuredClone(outputSchema) } : {}),
    ...(annotations ? { annotations: structuredClone(annotations) } : {})
  }
}

function serializeResult(result: ToolInvocationResult): string | undefined {
  try {
    const text = JSON.stringify(result.output ?? result.error ?? null)
    return typeof text === 'string' ? text : undefined
  } catch {
    return undefined
  }
}

function createErrorResponse(
  request: MCPBridgeRequest,
  code: number,
  message: string
): MCPBridgeResponse {
  return {
    jsonrpc: '2.0',
    id: request.id,
    error: {
      code,
      message
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
