import {
  invokeTool,
  listTools,
  type JsonSchema,
  type RegisteredTool,
  type ToolInvocationResult
} from '@webmcp-kit/core'

export interface MCPBridgeTool {
  name: string
  description: string
  inputSchema: JsonSchema
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
  return listTools().map(toBridgeTool)
}

async function callTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolInvocationResult> {
  return invokeTool({
    toolName: name,
    input,
    source: 'fallback'
  })
}

async function handleRequest(request: MCPBridgeRequest): Promise<MCPBridgeResponse> {
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

    const result = await callTool(name, input)

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.output ?? result.error ?? null)
          }
        ],
        isError: result.status !== 'success'
      }
    }
  }

  return createErrorResponse(request, -32601, `Unsupported MCP bridge method "${request.method}".`)
}

function toBridgeTool(registration: RegisteredTool): MCPBridgeTool {
  return {
    name: registration.tool.name,
    description: registration.tool.description,
    inputSchema: registration.tool.inputSchema
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
