import type { ToolResolver } from '@vampaz/webmcp-kit'

export interface DemoProvider {
  id: string
  label: string
  models: { model: string; label: string }[]
  loadModels?: () => Promise<{ model: string; label: string }[]>
  create(model?: string): Promise<ToolResolver>
}
