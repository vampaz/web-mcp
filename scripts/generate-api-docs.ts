import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { format } from 'oxfmt'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile)
if (configFile.error)
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
if (config.errors.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(config.errors, {
      getCanonicalFileName: function name(file) {
        return file
      },
      getCurrentDirectory: function directory() {
        return root
      },
      getNewLine: function newline() {
        return '\n'
      }
    })
  )
const program = ts.createProgram(config.fileNames, config.options)
const checker = program.getTypeChecker()
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
  name: string
  exports: Record<string, { types: string }>
}
const surfaces = Object.entries(manifest.exports).map(function surface([path, entry]) {
  const sourcePath = resolve(root, entry.types.replace('./dist/', '').replace(/\.d\.ts$/, '.ts'))
  const source = program.getSourceFile(sourcePath)
  const module = source && checker.getSymbolAtLocation(source)
  if (!module) throw new Error(`Missing public source for ${path}: ${sourcePath}`)
  return {
    name: manifest.name + (path === '.' ? '' : path.slice(1)),
    symbols: checker.getExportsOfModule(module).map(resolveSymbol)
  }
})
const publicSymbols = new Set(
  surfaces.flatMap(function symbols(surface) {
    return surface.symbols
  })
)
const supporting = new Set<ts.Symbol>()
const sections = [
  '# Complete API reference',
  'Generated from every entry in `package.json#exports`. Run `npm run docs:api` after API changes; `npm run docs:api:check` rejects a stale reference. This process reads TypeScript and does not build the library.',
  'Start with the [integration guide](./integration.md) for a working application, the [architecture](./architecture.md) for ownership and lifecycle, and [API behavior](./api-behavior.md) for defaults, errors, and usage. Signatures below are the complete public exports, including overloads and type fields. Referenced framework and Zod types come from their optional peers. Supporting types at the end describe signatures but are not package-root imports.',
  ...surfaces.map(function link(surface) {
    return `- [\`${surface.name}\`](#${surface.name.replace(/[@/]/g, '').replaceAll('.', '')})`
  })
]
for (const surface of surfaces) {
  sections.push(`## ${surface.name}`)
  for (const symbol of surface.symbols.sort(compareSymbols)) sections.push(render(symbol))
}
sections.push(
  '## Supporting types',
  'These types are referenced by exported contracts. Use the owning public type to access them; do not import internal source paths.'
)
for (const symbol of supporting) sections.push(render(symbol))
const result = await format(
  'api-reference.md',
  sections.join('\n\n') + '\n',
  JSON.parse(await readFile(resolve(root, '.oxfmtrc.json'), 'utf8'))
)
if (result.errors.length) throw new Error(JSON.stringify(result.errors))
const output = resolve(root, 'docs/api-reference.md')
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== result.code)
    throw new Error('API reference is stale. Run npm run docs:api.')
} else await writeFile(output, result.code)
console.log(
  `${surfaces.length} entry points and ${publicSymbols.size} distinct public symbols documented.`
)

function resolveSymbol(symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function compareSymbols(left: ts.Symbol, right: ts.Symbol): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

function render(symbol: ts.Symbol): string {
  const declaration = symbol.declarations?.[0]
  if (!declaration) throw new Error(`Missing declaration for ${symbol.name}`)
  const source = declaration.getSourceFile()
  let code: string
  if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
    code = declaration.getText(source)
    collectTypes(declaration)
  } else if (ts.isFunctionDeclaration(declaration)) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    code = type
      .getCallSignatures()
      .map(function signature(signature) {
        const node = signature.getDeclaration()
        if (node) {
          for (const parameter of node.parameters) collectTypes(parameter.type)
          for (const parameter of node.typeParameters ?? []) collectTypes(parameter)
          collectTypes(node.type)
        }
        return `declare function ${symbol.name}${checker.signatureToString(signature, declaration, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)}`
      })
      .join('\n')
  } else if (ts.isVariableDeclaration(declaration)) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    code = `declare const ${symbol.name}: ${checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)}`
    collectTypes(declaration.type)
  } else throw new Error(`Unsupported public declaration: ${symbol.name}`)
  const description = ts.displayPartsToString(symbol.getDocumentationComment(checker))
  const path = relative(root, source.fileName).replaceAll('\\', '/')
  return `### ${symbol.name}\n\nSource in the repository: \`${path}\`. [Packaged declaration](../dist/${path.replace(/\.ts$/, '.d.ts')}).${description ? `\n\n${description}` : ''}\n\n\`\`\`ts\n${code}\n\`\`\``
}

function collectTypes(node: ts.Node | undefined): void {
  if (!node) return
  if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
    const reference = checker.getSymbolAtLocation(
      ts.isTypeReferenceNode(node) ? node.typeName : node.expression
    )
    if (reference) {
      const symbol = resolveSymbol(reference)
      const declaration = symbol.declarations?.[0]
      if (
        declaration &&
        (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
        declaration.getSourceFile().fileName.startsWith(resolve(root, 'packages') + '/') &&
        !publicSymbols.has(symbol)
      )
        supporting.add(symbol)
    }
  }
  ts.forEachChild(node, collectTypes)
}
