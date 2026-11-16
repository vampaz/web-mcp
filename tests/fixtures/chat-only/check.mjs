import assert from 'node:assert/strict'
import { defineWebMCPChat } from '@vampaz/webmcp-kit/chat'
import { renderMarkdown } from '@vampaz/webmcp-kit/chat/markdown'
defineWebMCPChat()
assert.equal(typeof renderMarkdown, 'function')
assert.throws(function missing() {
  import.meta.resolve('vue')
})
console.log('chat-only passed')
