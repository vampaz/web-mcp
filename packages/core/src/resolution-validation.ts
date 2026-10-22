import type {
  JsonSchema,
  ResolverRunOptions,
  ToolResolution,
  ToolResolutionStep
} from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

export const resolverOutcomeToolNames = ['needs_clarification', 'no_tools_match'] as const
export type ResolverOutcomeToolName = (typeof resolverOutcomeToolNames)[number]

export interface ToolResolutionValidationTool {
  name?: string
  inputSchema?: JsonSchema
}

export interface ToolResolutionValidationOptions {
  messageStyle?: 'provider' | 'server'
  singleStep?: boolean
  purpose?: ResolverRunOptions['purpose']
}

export const toolResolutionSchema = {
  type: 'object',
  properties: {
    toolName: { type: 'string' },
    input: { type: 'object' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          toolName: { type: 'string' },
          input: { type: 'object' },
          confidence: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['toolName', 'input', 'confidence', 'reason'],
        additionalProperties: false
      },
      maxItems: 5
    }
  },
  required: ['toolName', 'input', 'confidence', 'reason'],
  additionalProperties: false
} satisfies JsonSchema

export function createToolResolutionSchema(
  tools: ToolResolutionValidationTool[],
  singleStep = false,
  purpose?: ResolverRunOptions['purpose']
): JsonSchema {
  if (!singleStep && purpose !== 'summary') return toolResolutionSchema
  const properties: Record<string, JsonSchema> = { ...toolResolutionSchema.properties }
  delete properties.steps
  return {
    ...toolResolutionSchema,
    properties: {
      ...properties,
      toolName: {
        type: 'string',
        enum: [
          ...tools
            .map(function name(tool) {
              return tool.name
            })
            .filter(Boolean),
          ...(purpose === 'summary' ? [] : resolverOutcomeToolNames)
        ]
      }
    }
  }
}

export function createStructuredToolResolutionSchema(
  tools: ToolResolutionValidationTool[],
  purpose?: ResolverRunOptions['purpose']
): JsonSchema {
  const resolution = createToolResolutionSchema(tools, true, purpose)
  const variants = [
    ...tools
      .filter((tool) => tool.name)
      .map((tool) => ({
        ...resolution,
        properties: {
          ...resolution.properties,
          toolName: { type: 'string', enum: [tool.name] },
          input: tool.inputSchema ?? { type: 'object' }
        }
      })),
    ...(purpose === 'summary'
      ? []
      : [
          {
            ...resolution,
            properties: {
              ...resolution.properties,
              toolName: { type: 'string', enum: [...resolverOutcomeToolNames] },
              input: { type: 'object', properties: {}, additionalProperties: false }
            }
          }
        ])
  ]
  return {
    type: 'object',
    properties: { action: { anyOf: variants } },
    required: ['action'],
    additionalProperties: false
  }
}

/** A resolver returned a resolution that does not match the offered tools or the resolution contract. */
export class ToolResolutionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolResolutionValidationError'
  }
}

export function validateToolResolution(
  resolution: unknown,
  tools: ToolResolutionValidationTool[],
  options: ToolResolutionValidationOptions = {}
): void {
  const messages = getValidationMessages(options.messageStyle ?? 'provider')

  if (!resolution || typeof resolution !== 'object')
    throw new ToolResolutionValidationError(messages.invalidResolution)
  const typedResolution = resolution as Partial<ToolResolution>
  if (
    (options.singleStep || options.purpose === 'summary') &&
    (typedResolution.steps !== undefined || typedResolution.toolName === 'tool_sequence')
  )
    throw new ToolResolutionValidationError(
      'provider returned a sequence for a single-step request'
    )
  if (typeof typedResolution.toolName !== 'string')
    throw new ToolResolutionValidationError(messages.invalidToolName)
  if (
    !typedResolution.input ||
    typeof typedResolution.input !== 'object' ||
    Array.isArray(typedResolution.input)
  ) {
    throw new ToolResolutionValidationError(messages.invalidInput)
  }
  if (
    typeof typedResolution.confidence !== 'number' ||
    !Number.isFinite(typedResolution.confidence)
  ) {
    throw new ToolResolutionValidationError(messages.invalidConfidence)
  }
  if (typeof typedResolution.reason !== 'string')
    throw new ToolResolutionValidationError(messages.invalidReason)
  if (isResolverOutcomeToolName(typedResolution.toolName)) {
    if (options.purpose === 'summary')
      throw new ToolResolutionValidationError(messages.unknownTool(typedResolution.toolName))
    if (typedResolution.steps !== undefined)
      throw new ToolResolutionValidationError(messages.invalidOutcomeSteps)
    return
  }
  if (typedResolution.steps !== undefined) {
    validateToolResolutionSequence(typedResolution as ToolResolution, tools, messages)
    return
  }

  validateToolResolutionStep(typedResolution as ToolResolutionStep, tools, messages)
}

export function isResolverOutcomeToolName(toolName: string): toolName is ResolverOutcomeToolName {
  return resolverOutcomeToolNames.includes(toolName as ResolverOutcomeToolName)
}

function validateToolResolutionSequence(
  resolution: ToolResolution,
  tools: ToolResolutionValidationTool[],
  messages: ToolResolutionValidationMessages
): void {
  if (resolution.toolName !== 'tool_sequence')
    throw new ToolResolutionValidationError(messages.invalidSequence)
  if (!Array.isArray(resolution.steps) || resolution.steps.length === 0) {
    throw new ToolResolutionValidationError(messages.invalidSequenceSteps)
  }
  if (resolution.steps.length > 5) throw new ToolResolutionValidationError(messages.sequenceTooLong)

  resolution.steps.forEach(function validateSequenceStep(step) {
    validateToolResolutionStep(step, tools, messages)
  })
}

function validateToolResolutionStep(
  step: ToolResolutionStep,
  tools: ToolResolutionValidationTool[],
  messages: ToolResolutionValidationMessages
): void {
  if (!step || typeof step !== 'object')
    throw new ToolResolutionValidationError(messages.invalidStep)
  if (typeof step.toolName !== 'string')
    throw new ToolResolutionValidationError(messages.invalidStepToolName)
  if (!step.input || typeof step.input !== 'object' || Array.isArray(step.input)) {
    throw new ToolResolutionValidationError(messages.invalidStepInput)
  }
  if (typeof step.confidence !== 'number' || !Number.isFinite(step.confidence)) {
    throw new ToolResolutionValidationError(messages.invalidStepConfidence)
  }
  if (typeof step.reason !== 'string')
    throw new ToolResolutionValidationError(messages.invalidStepReason)

  const selectedTool = tools.find(function findSelectedTool(tool) {
    return tool.name === step.toolName
  })
  if (!selectedTool) throw new ToolResolutionValidationError(messages.unknownTool(step.toolName))
  if (!selectedTool.inputSchema)
    throw new ToolResolutionValidationError(messages.missingInputSchema)

  const inputValidationErrors = validateJsonValue(step.input, selectedTool.inputSchema)
  if (inputValidationErrors.length > 0) {
    throw new ToolResolutionValidationError(
      messages.invalidToolInput(
        step.toolName,
        formatJsonValueValidationError(inputValidationErrors)
      )
    )
  }
}

interface ToolResolutionValidationMessages {
  invalidResolution: string
  invalidToolName: string
  invalidInput: string
  invalidConfidence: string
  invalidReason: string
  invalidOutcomeSteps: string
  invalidSequence: string
  invalidSequenceSteps: string
  sequenceTooLong: string
  invalidStep: string
  invalidStepToolName: string
  invalidStepInput: string
  invalidStepConfidence: string
  invalidStepReason: string
  unknownTool: (toolName: string) => string
  missingInputSchema: string
  invalidToolInput: (toolName: string, detail: string) => string
}

function getValidationMessages(style: 'provider' | 'server'): ToolResolutionValidationMessages {
  if (style === 'server') {
    return {
      invalidResolution: 'Invalid resolution',
      invalidToolName: 'Invalid toolName',
      invalidInput: 'Invalid input',
      invalidConfidence: 'Invalid confidence',
      invalidReason: 'Invalid reason',
      invalidOutcomeSteps: 'Resolver outcomes cannot include steps',
      invalidSequence: 'Invalid tool sequence',
      invalidSequenceSteps: 'Invalid tool sequence steps',
      sequenceTooLong: 'Tool sequence is too long',
      invalidStep: 'Invalid resolution step',
      invalidStepToolName: 'Invalid step toolName',
      invalidStepInput: 'Invalid step input',
      invalidStepConfidence: 'Invalid step confidence',
      invalidStepReason: 'Invalid step reason',
      unknownTool() {
        return 'Unknown tool'
      },
      missingInputSchema: 'Selected tool has no input schema',
      invalidToolInput(_toolName, detail) {
        return `Invalid tool input: ${detail}`
      }
    }
  }

  return {
    invalidResolution: 'provider returned an invalid resolution',
    invalidToolName: 'provider returned a resolution without toolName',
    invalidInput: 'provider returned a resolution with invalid input',
    invalidConfidence: 'provider returned a resolution without numeric confidence',
    invalidReason: 'provider returned a resolution without reason',
    invalidOutcomeSteps: 'provider returned a resolver outcome with steps',
    invalidSequence: 'provider returned steps without tool_sequence',
    invalidSequenceSteps: 'provider returned an empty tool sequence',
    sequenceTooLong: 'provider returned too many tool sequence steps',
    invalidStep: 'provider returned an invalid resolution step',
    invalidStepToolName: 'provider returned a resolution step without toolName',
    invalidStepInput: 'provider returned a resolution step with invalid input',
    invalidStepConfidence: 'provider returned a resolution step without numeric confidence',
    invalidStepReason: 'provider returned a resolution step without reason',
    unknownTool(toolName) {
      return `provider selected unknown tool "${toolName}"`
    },
    missingInputSchema: 'provider selected a tool without an input schema',
    invalidToolInput(toolName, detail) {
      return `provider returned invalid input for "${toolName}": ${detail}`
    }
  }
}
