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

export function validateToolResolution(
  resolution: unknown,
  tools: ToolResolutionValidationTool[],
  options: ToolResolutionValidationOptions = {}
): void {
  const messages = getValidationMessages(options.messageStyle ?? 'provider')

  if (!resolution || typeof resolution !== 'object') throw new Error(messages.invalidResolution)
  const typedResolution = resolution as Partial<ToolResolution>
  if (
    (options.singleStep || options.purpose === 'summary') &&
    (typedResolution.steps !== undefined || typedResolution.toolName === 'tool_sequence')
  )
    throw new Error('provider returned a sequence for a single-step request')
  if (typeof typedResolution.toolName !== 'string') throw new Error(messages.invalidToolName)
  if (
    !typedResolution.input ||
    typeof typedResolution.input !== 'object' ||
    Array.isArray(typedResolution.input)
  ) {
    throw new Error(messages.invalidInput)
  }
  if (
    typeof typedResolution.confidence !== 'number' ||
    !Number.isFinite(typedResolution.confidence)
  ) {
    throw new Error(messages.invalidConfidence)
  }
  if (typeof typedResolution.reason !== 'string') throw new Error(messages.invalidReason)
  if (isResolverOutcomeToolName(typedResolution.toolName)) {
    if (options.purpose === 'summary')
      throw new Error(messages.unknownTool(typedResolution.toolName))
    if (typedResolution.steps !== undefined) throw new Error(messages.invalidOutcomeSteps)
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
  if (resolution.toolName !== 'tool_sequence') throw new Error(messages.invalidSequence)
  if (!Array.isArray(resolution.steps) || resolution.steps.length === 0) {
    throw new Error(messages.invalidSequenceSteps)
  }
  if (resolution.steps.length > 5) throw new Error(messages.sequenceTooLong)

  resolution.steps.forEach(function validateSequenceStep(step) {
    validateToolResolutionStep(step, tools, messages)
  })
}

function validateToolResolutionStep(
  step: ToolResolutionStep,
  tools: ToolResolutionValidationTool[],
  messages: ToolResolutionValidationMessages
): void {
  if (!step || typeof step !== 'object') throw new Error(messages.invalidStep)
  if (typeof step.toolName !== 'string') throw new Error(messages.invalidStepToolName)
  if (!step.input || typeof step.input !== 'object' || Array.isArray(step.input)) {
    throw new Error(messages.invalidStepInput)
  }
  if (typeof step.confidence !== 'number' || !Number.isFinite(step.confidence)) {
    throw new Error(messages.invalidStepConfidence)
  }
  if (typeof step.reason !== 'string') throw new Error(messages.invalidStepReason)

  const selectedTool = tools.find(function findSelectedTool(tool) {
    return tool.name === step.toolName
  })
  if (!selectedTool) throw new Error(messages.unknownTool(step.toolName))
  if (!selectedTool.inputSchema) throw new Error(messages.missingInputSchema)

  const inputValidationErrors = validateJsonValue(step.input, selectedTool.inputSchema)
  if (inputValidationErrors.length > 0) {
    throw new Error(
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
