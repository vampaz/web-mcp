import assert from 'node:assert/strict'
import { defineWebMCPChat } from '@vampaz/webmcp-kit/chat'
defineWebMCPChat()
assert.throws(function missing() {
  import.meta.resolve('@earendil-works/pi-durable')
})
assert.throws(function missing() {
  import.meta.resolve('vue')
})
console.log('chat-only passed')
