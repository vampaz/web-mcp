import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { fakeController } from './controller.js'
defineWebMCPChat()
const element = document.createElement('webmcp-chat') as WebMCPChatElement
element.configure({ controller: fakeController() })
document.body.append(element)
