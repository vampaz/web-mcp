import assert from 'node:assert/strict'
import { registerTool, invokeTool } from '@vampaz/webmcp-kit'
import { createPiHarness, createPiRuntime } from '@vampaz/webmcp-kit/pi'
assert.equal(typeof createPiHarness, 'function')
assert.equal(typeof createPiRuntime, 'function')
registerTool({
  name: 'read_value',
  description: 'Read the visible value from this application.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  execute() {
    return 7
  }
})
assert.equal((await invokeTool({ toolName: 'read_value', input: {} })).output, 7)
assert.throws(function missing() {
  import.meta.resolve('vue')
})
console.log('core-only passed')
