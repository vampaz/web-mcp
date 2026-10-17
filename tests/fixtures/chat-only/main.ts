import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { fakeController } from './controller'
defineWebMCPChat()
const element = document.createElement('webmcp-chat') as WebMCPChatElement
element.configure({ harness: fakeController() })
document.body.append(element)
