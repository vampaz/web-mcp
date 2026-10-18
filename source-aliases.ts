import { fileURLToPath } from 'node:url'

export const sourceAliases = [
  'pi/worker',
  'pi',
  'chat',
  'testing/playwright',
  'testing',
  'devtools',
  'mcp-bridge',
  'vue',
  'react',
  'svelte',
  'zod',
  ''
].map(function alias(name) {
  const directory = name === '' ? 'core' : name === 'pi/worker' ? 'pi' : name.split('/')[0]
  const file = name.endsWith('/worker')
    ? 'worker'
    : name.endsWith('/playwright')
      ? 'playwright'
      : 'index'
  return {
    find: new RegExp(`^@vampaz/webmcp-kit${name ? '/' + name : ''}$`),
    replacement: fileURLToPath(new URL(`./packages/${directory}/src/${file}.ts`, import.meta.url))
  }
})
