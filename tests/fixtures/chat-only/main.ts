import {
  defineWebMCPChat,
  type WebMCPChatSettings,
  type WebMCPChatElement
} from '@vampaz/webmcp-kit/chat'
import { renderMarkdown } from '@vampaz/webmcp-kit/chat/markdown'
import { fakeController } from './controller.js'
defineWebMCPChat()
const element = document.createElement('webmcp-chat') as WebMCPChatElement
const settings: WebMCPChatSettings = {
  providers: [{ id: 'fake', label: 'Fake provider', models: [] }],
  providerId: 'fake',
  onChange() {}
}
element.configure({ controller: fakeController(), settings })
const markdown = document.createElement('div')
renderMarkdown('**Chat only**', markdown)
document.body.append(element, markdown)
