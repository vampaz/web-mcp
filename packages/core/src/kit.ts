import type { ResolverProviderConfig, ToolResolver } from './interfaces/tool'
import { createConfiguredResolver } from './resolver'

export interface WebMCPKitOptions {
  resolver?: ResolverProviderConfig
}

export interface WebMCPKit {
  resolver: ToolResolver
  resolverConfig?: ResolverProviderConfig
}

export async function createWebMCPKit(options: WebMCPKitOptions = {}): Promise<WebMCPKit> {
  const resolver = await createConfiguredResolver(options.resolver)

  return {
    resolver,
    resolverConfig: options.resolver
  }
}
