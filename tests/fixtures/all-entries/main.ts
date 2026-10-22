import { defineTool, objectInputSchema, registerTool, stringParam } from '@vampaz/webmcp-kit'
import { defineWebMCPCommandInput } from '@vampaz/webmcp-kit/command-input'
import { createPiRuntime, type PiController } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { createHostedOpenAIResolver } from '@vampaz/webmcp-kit/hosted'
import { useWebMCPTool as useVueTool } from '@vampaz/webmcp-kit/vue'
import { useWebMCPTool as useReactTool } from '@vampaz/webmcp-kit/react'
import { useWebMCPTool as useSvelteTool } from '@vampaz/webmcp-kit/svelte'
import { defineZodTool } from '@vampaz/webmcp-kit/zod'
import { mountDevtoolsOverlay } from '@vampaz/webmcp-kit/devtools'
import { installWebMCPKitTestBridge } from '@vampaz/webmcp-kit/testing'
import { waitForWebMCPTool } from '@vampaz/webmcp-kit/testing/playwright'
import { createLocalMCPBridge } from '@vampaz/webmcp-kit/mcp-bridge'
import { readable } from 'svelte/store'
import { ref } from 'vue'
import { z } from 'zod'

const tool = defineTool({
  name: 'read_name',
  description: 'Read the supplied name.',
  inputSchema: objectInputSchema({ name: stringParam() }, { required: ['name'] }),
  execute(input) {
    return input.name
  }
})
const zodTool = defineZodTool({
  name: 'greet_name',
  description: 'Greet the supplied name.',
  schema: z.object({ name: z.string() }),
  execute(input) {
    const name: string = input.name
    return `Hello, ${name}`
  }
})
useVueTool(tool, { when: ref(true) })
useReactTool(tool)
useSvelteTool(zodTool, { when: readable(true) })

export function connectChat(chat: WebMCPChatElement, controller: PiController) {
  chat.configure({ controller })
}

void [
  registerTool,
  defineWebMCPCommandInput,
  createPiRuntime,
  defineWebMCPChat,
  createHostedOpenAIResolver,
  mountDevtoolsOverlay,
  installWebMCPKitTestBridge,
  waitForWebMCPTool,
  createLocalMCPBridge
]
