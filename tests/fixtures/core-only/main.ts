import { defineTool, invokeTool, objectInputSchema, stringParam } from '@vampaz/webmcp-kit'
import { initWebMCP } from '@vampaz/webmcp-kit/command-input'
import { createHostedOpenAIResolver } from '@vampaz/webmcp-kit/hosted'
import { installWebMCPKitTestBridge } from '@vampaz/webmcp-kit/testing'

void invokeTool({ toolName: 'read_value', input: {} })
void [initWebMCP, createHostedOpenAIResolver, installWebMCPKitTestBridge]
const tool = defineTool({
  name: 'read_name',
  description: 'Read the supplied name.',
  inputSchema: objectInputSchema({ name: stringParam() }, { required: ['name'] }),
  execute(input) {
    const name: string = input.name
    // @ts-expect-error Must remain a string rather than silently degrading to any.
    const invalid: number = input.name
    void invalid
    return name
  }
})
void tool
