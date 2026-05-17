import type { RegisteredTool, RegistrySnapshot, ToolInvocation, ToolInvocationResult } from './interfaces/tool'
import { getRegistrySnapshot, invokeTool, listTools } from './registry'

export interface TestBridgeTool {
  name: string
  description: string
  inputSchema: RegisteredTool['tool']['inputSchema']
  outputSchema?: RegisteredTool['tool']['outputSchema']
  confirmation?: RegisteredTool['tool']['confirmation']
  mode: RegisteredTool['mode']
  warnings: string[]
  available: boolean
  unavailableReason?: string
}

export interface WebMCPKitTestBridge {
  getRegistrySnapshot: () => TestBridgeSnapshot
  listTools: () => TestBridgeTool[]
  invokeTool: <TOutput = unknown>(invocation: ToolInvocation) => Promise<ToolInvocationResult<TOutput>>
}

export interface TestBridgeSnapshot extends Omit<RegistrySnapshot, 'tools'> {
  tools: TestBridgeTool[]
}

interface WindowWithTestBridge extends Window {
  __webMCPKit?: WebMCPKitTestBridge
}

export function installWebMCPKitTestBridge(target: Window = window): () => void {
  const bridge: WebMCPKitTestBridge = {
    getRegistrySnapshot() {
      const snapshot = getRegistrySnapshot()

      return {
        ...snapshot,
        tools: createToolSummaries()
      }
    },
    listTools() {
      return createToolSummaries()
    },
    invokeTool(invocation) {
      return invokeTool({
        ...invocation,
        confirmed: false
      })
    }
  }

  ;(target as WindowWithTestBridge).__webMCPKit = bridge

  return function uninstallWebMCPKitTestBridge() {
    delete (target as WindowWithTestBridge).__webMCPKit
  }
}

function createToolSummaries(): TestBridgeTool[] {
  return listTools().map(function mapTool(registration) {
    const availability = registration.tool.scope?.()

    return {
      name: registration.tool.name,
      description: registration.tool.description,
      inputSchema: registration.tool.inputSchema,
      outputSchema: registration.tool.outputSchema,
      confirmation: registration.tool.confirmation,
      mode: registration.mode,
      warnings: registration.warnings,
      available: availability?.available ?? true,
      unavailableReason: availability?.reason
    }
  })
}

declare global {
  interface Window {
    __webMCPKit?: WebMCPKitTestBridge
  }
}
