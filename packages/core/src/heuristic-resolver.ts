import type { JsonSchema, ResolverContext, ToolResolution, WebMCPTool } from './interfaces/tool'
import { validateJsonValue } from './schema'

const numberWords = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20]
])

const ignoredTerms = new Set([
  'a',
  'all',
  'an',
  'and',
  'are',
  'as',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'have',
  'how',
  'i',
  'in',
  'into',
  'is',
  'it',
  'item',
  'items',
  'me',
  'my',
  'of',
  'on',
  'or',
  'please',
  'show',
  'the',
  'that',
  'this',
  'to',
  'what',
  'with',
  'you',
  'your'
])

// One tool-name term, or two description/property terms, before a tool may run.
const minimumToolScore = 2

export function resolveWithHeuristics(
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext = {}
): ToolResolution {
  const selectedTool = selectTool(message, tools)
  if (!selectedTool) {
    return createResolverOutcome(
      'no_tools_match',
      'No registered WebMCP tool matched this request closely enough to run.'
    )
  }

  const input = createInputFromSchema(selectedTool.inputSchema, message, context)
  if (
    hasMissingRequiredArrayInput(selectedTool.inputSchema, input) ||
    validateJsonValue(input, selectedTool.inputSchema).length > 0
  ) {
    return createResolverOutcome(
      'needs_clarification',
      'The request matched a tool, but the request and current app context did not supply valid required inputs.'
    )
  }

  return {
    toolName: selectedTool.name,
    input,
    confidence: selectedToolScore(message, selectedTool) > 0 ? 0.62 : 0.5,
    reason:
      'Selected the available tool whose name, description, and schema best matched the request.'
  }
}

function createResolverOutcome(toolName: 'needs_clarification' | 'no_tools_match', reason: string) {
  return {
    toolName,
    input: {},
    confidence: 0,
    reason
  }
}

function selectTool(message: string, tools: WebMCPTool[]): WebMCPTool | undefined {
  if (tools.length === 0) {
    return undefined
  }

  const selectedTool = [...tools].sort(function sortByScore(left, right) {
    return selectedToolScore(message, right) - selectedToolScore(message, left)
  })[0]
  if (selectedToolScore(message, selectedTool) < minimumToolScore) return undefined

  return selectedTool
}

function selectedToolScore(message: string, tool: WebMCPTool): number {
  const messageTerms = tokenize(message)
  // Score words authors wrote, never JSON Schema keywords such as "type", "object", or "false".
  const toolText = `${tool.name} ${tool.description} ${getSchemaText(tool.inputSchema)}`
  const toolTerms = new Set(tokenize(toolText))

  const tokenScore = messageTerms.reduce(function addMatchingTerm(total, term) {
    if (!toolTerms.has(term) && !(term.endsWith('s') && toolTerms.has(term.slice(0, -1)))) {
      return total
    }
    return total + (tool.name.toLowerCase().includes(term) ? 2 : 1)
  }, 0)

  return (
    tokenScore + getSchemaEnumScore(message, tool.inputSchema) + getSearchIntentScore(message, tool)
  )
}

function getSchemaText(schema: JsonSchema): string {
  return Object.entries(schema.properties ?? {})
    .flatMap(function describeProperty([name, property]) {
      return [
        name,
        property.title ?? '',
        property.description ?? '',
        ...(property.enum ?? []).filter((value) => typeof value === 'string'),
        getSchemaText(property)
      ]
    })
    .join(' ')
}

function getSchemaEnumScore(message: string, schema: JsonSchema): number {
  if (!schema.properties) return 0
  const normalizedMessage = message.toLowerCase()

  return Object.values(schema.properties).reduce(function addEnumScore(total, propertySchema) {
    if (!Array.isArray(propertySchema.enum)) return total
    const hasMatchingEnum = propertySchema.enum.some(function enumMatches(value) {
      return typeof value === 'string' && normalizedMessage.includes(value.toLowerCase())
    })
    return hasMatchingEnum ? total + 3 : total
  }, 0)
}

function getSearchIntentScore(message: string, tool: WebMCPTool): number {
  const normalizedMessage = message.toLowerCase()
  const hasSearchIntent =
    normalizedMessage.includes('find') ||
    normalizedMessage.includes('search') ||
    normalizedMessage.includes('show')
  if (!hasSearchIntent) return 0

  const toolText = `${tool.name} ${tool.description}`.toLowerCase()
  if (toolText.includes('search') || toolText.includes('find')) return 2
  if (!tool.inputSchema.properties) return 0

  const hasQueryInput = Object.keys(tool.inputSchema.properties).some(
    function propertyIsQuery(key) {
      return isQueryKey(key)
    }
  )
  return hasQueryInput ? 2 : 0
}

function createInputFromSchema(
  schema: JsonSchema,
  message: string,
  context: ResolverContext
): Record<string, unknown> {
  if (schema.type !== 'object' || !schema.properties) return {}

  const input: Record<string, unknown> = Object.create(null)
  const required = new Set(schema.required ?? [])

  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    const value =
      createInputValue(key, propertySchema, message, context, required.has(key)) ??
      propertySchema.default
    if (value !== undefined) input[key] = value
  }

  return input
}

function hasMissingRequiredArrayInput(schema: JsonSchema, input: Record<string, unknown>): boolean {
  if (schema.type !== 'object' || !schema.properties) return false

  return (schema.required ?? []).some(function requiredArrayIsEmpty(key) {
    const propertySchema = schema.properties?.[key]
    return propertySchema?.type === 'array' && Array.isArray(input[key]) && input[key].length === 0
  })
}

function createInputValue(
  key: string,
  schema: JsonSchema,
  message: string,
  context: ResolverContext,
  required: boolean
): unknown {
  if (Array.isArray(schema.enum)) return getEnumValue(schema.enum, message, key)

  if (schema.type === 'array') {
    const ids = findContextIds(message, context)
    if (ids.length > 0 || required) return ids
    return undefined
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (isQuantityKey(key)) return extractQuantity(message)
    if (isPercentKey(key)) return extractAmount(message)
    if (isAmountKey(key)) return extractAmount(message)
    return required ? extractAmount(message) : undefined
  }

  if (schema.type === 'boolean') {
    if (/\btrue\b/i.test(message)) return true
    if (/\bfalse\b/i.test(message)) return false
    return undefined
  }

  if (schema.type === 'string' || schema.type === undefined) {
    if (isIdKey(key)) return findContextValueForKey(key, message, context)
    // Optional text is filled only when the request is explicitly a search; otherwise leave it out.
    if (isQueryKey(key) && (required || hasSearchIntent(message))) return cleanQuery(message)
    if (!required) return undefined
    if (isCustomerKey(key)) return extractCustomerName(message)
    if (isBodyKey(key)) return message
    if (isSubjectKey(key)) return getSubject(message)
    return cleanQuery(message)
  }

  return undefined
}

function hasSearchIntent(message: string): boolean {
  return /\b(find|search|show|look up|list)\b/i.test(message)
}

function getEnumValue(values: readonly unknown[], message: string, key: string): unknown {
  const normalizedMessage = message.toLowerCase()
  const matchingValue = values.find(function findMatchingValue(value) {
    return typeof value === 'string' && normalizedMessage.includes(value.toLowerCase())
  })
  if (matchingValue !== undefined) return matchingValue

  if (isDirectionKey(key)) {
    const direction =
      normalizedMessage.includes('desc') ||
      normalizedMessage.includes('highest') ||
      normalizedMessage.includes('most') ||
      normalizedMessage.includes('largest')
        ? 'desc'
        : /\b(asc|lowest|least|smallest)\b/.test(normalizedMessage)
          ? 'asc'
          : undefined
    if (values.includes(direction)) return direction
  }

  return undefined
}

function findContextValueForKey(
  key: string,
  message: string,
  context: ResolverContext
): string | undefined {
  if (!isIdKey(key)) return undefined

  return findBestContextObject(message, context)?.id
}

function findContextIds(message: string, context: ResolverContext): string[] {
  if (message.toLowerCase().includes('first')) {
    return findContextObjects(context)
      .slice(0, extractQuantity(message) ?? 1)
      .map(function mapContextId(item) {
        return item.id
      })
  }

  const matchingObjects = findContextObjects(context).filter(function objectMatchesMessage(item) {
    return contextObjectMatchesMessage(item, message)
  })

  return matchingObjects.map(function mapContextId(item) {
    return item.id
  })
}

function findBestContextObject(
  message: string,
  context: ResolverContext
): { id: string } | undefined {
  const objects = findContextObjects(context)
  const matches = objects.filter(function objectMatchesMessage(item) {
    return contextObjectMatchesMessage(item, message)
  })
  return matches.length === 1 ? matches[0] : undefined
}

function findContextObjects(context: ResolverContext): Array<{ id: string; text: string }> {
  return Object.values(context).flatMap(function flattenContextValue(value) {
    if (!Array.isArray(value)) return []
    return value.flatMap(function mapContextItem(item) {
      const id = getContextObjectId(item)
      if (!id) return []
      return [
        {
          id,
          text: getContextObjectText(item)
        }
      ]
    })
  })
}

function getContextObjectId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('id' in value)) return undefined
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

function getContextObjectText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  return Object.values(value)
    .filter(function keepSearchableValue(item) {
      return ['number', 'string', 'boolean'].includes(typeof item)
    })
    .join(' ')
    .toLowerCase()
}

function contextObjectMatchesMessage(item: { text: string }, message: string): boolean {
  const terms = tokenize(message).filter(function keepUsefulTerm(term) {
    return term.length > 2 && !ignoredTerms.has(term) && !/^\d+$/.test(term)
  })
  if (terms.length === 0) return false

  return terms.some(function hasMatchingTerm(term) {
    return termMatchesText(term, item.text)
  })
}

function termMatchesText(term: string, searchableText: string): boolean {
  if (searchableText.includes(term)) return true
  if (term.endsWith('s') && searchableText.includes(term.slice(0, -1))) return true
  return !term.endsWith('s') && searchableText.includes(`${term}s`)
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\W+/)
    .filter(function keepTerm(term) {
      return term.length > 0 && !ignoredTerms.has(term)
    })
}

function extractAmount(message: string): number | undefined {
  const amount = message.match(/(?:€|\$)?\s*(\d+(?:[.,]\d+)?)/)?.[1]
  if (!amount) return undefined

  return Number(amount.replace(',', '.'))
}

function extractQuantity(message: string): number | undefined {
  const numericQuantity = message.match(/\b(\d+)\b/)?.[1]
  if (numericQuantity) return Number(numericQuantity)

  const normalizedMessage = message.toLowerCase()
  for (const [word, value] of numberWords) {
    if (new RegExp(`\\b${word}\\b`).test(normalizedMessage)) return value
  }

  return undefined
}

function extractCustomerName(message: string): string {
  const match = message.match(/(?:for|to)\s+([\w\s]+?)(?:\s+for\s+|$)/i)
  return match?.[1]?.trim() || cleanQuery(message)
}

function cleanQuery(message: string): string {
  return message.replace(/\b(search|find|show|for|please)\b/gi, '').trim() || message
}

function getSubject(message: string): string {
  return cleanQuery(message).slice(0, 80) || 'Request'
}

function isAmountKey(key: string): boolean {
  return key.toLowerCase().includes('amount') || key.toLowerCase().includes('price')
}

function isBodyKey(key: string): boolean {
  return key.toLowerCase().includes('body') || key.toLowerCase().includes('description')
}

function isCustomerKey(key: string): boolean {
  return key.toLowerCase().includes('customer') || key.toLowerCase().includes('account')
}

function isDirectionKey(key: string): boolean {
  return key.toLowerCase().includes('direction')
}

function isIdKey(key: string): boolean {
  return key.toLowerCase() === 'id' || key.toLowerCase().endsWith('id')
}

function isPercentKey(key: string): boolean {
  return key.toLowerCase().includes('percent') || key.toLowerCase().includes('discount')
}

function isQuantityKey(key: string): boolean {
  return key.toLowerCase().includes('quantity') || key.toLowerCase().includes('count')
}

function isQueryKey(key: string): boolean {
  return key.toLowerCase().includes('query') || key.toLowerCase().includes('search')
}

function isSubjectKey(key: string): boolean {
  return key.toLowerCase().includes('subject') || key.toLowerCase().includes('title')
}
