import type { JsonSchema, ToolPlan, ToolPlanStep } from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

export interface ToolPlanValidationTool {
  name?: string
  inputSchema?: JsonSchema
}

export interface ToolPlanValidationOptions {
  messageStyle?: 'provider' | 'server'
}

export const toolPlanSchema = {
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

export function validateToolPlan(
  plan: ToolPlan,
  tools: ToolPlanValidationTool[],
  options: ToolPlanValidationOptions = {}
): void {
  const messages = getValidationMessages(options.messageStyle ?? 'provider')

  if (!plan || typeof plan !== 'object') throw new Error(messages.invalidPlan)
  if (typeof plan.toolName !== 'string') throw new Error(messages.invalidToolName)
  if (!plan.input || typeof plan.input !== 'object' || Array.isArray(plan.input)) {
    throw new Error(messages.invalidInput)
  }
  if (typeof plan.confidence !== 'number') throw new Error(messages.invalidConfidence)
  if (typeof plan.reason !== 'string') throw new Error(messages.invalidReason)
  if (plan.steps !== undefined) {
    validateToolPlanSequence(plan, tools, messages)
    return
  }

  validateToolPlanStep(plan, tools, messages)
}

function validateToolPlanSequence(
  plan: ToolPlan,
  tools: ToolPlanValidationTool[],
  messages: ToolPlanValidationMessages
): void {
  if (plan.toolName !== 'tool_sequence') throw new Error(messages.invalidSequence)
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error(messages.invalidSequenceSteps)
  }
  if (plan.steps.length > 5) throw new Error(messages.sequenceTooLong)

  plan.steps.forEach(function validateSequenceStep(step) {
    validateToolPlanStep(step, tools, messages)
  })
}

function validateToolPlanStep(
  step: ToolPlanStep,
  tools: ToolPlanValidationTool[],
  messages: ToolPlanValidationMessages
): void {
  if (!step || typeof step !== 'object') throw new Error(messages.invalidStep)
  if (typeof step.toolName !== 'string') throw new Error(messages.invalidStepToolName)
  if (!step.input || typeof step.input !== 'object' || Array.isArray(step.input)) {
    throw new Error(messages.invalidStepInput)
  }
  if (typeof step.confidence !== 'number') throw new Error(messages.invalidStepConfidence)
  if (typeof step.reason !== 'string') throw new Error(messages.invalidStepReason)

  const selectedTool = tools.find(function findSelectedTool(tool) {
    return tool.name === step.toolName
  })
  if (!selectedTool) throw new Error(messages.unknownTool(step.toolName))
  if (!selectedTool.inputSchema) throw new Error(messages.missingInputSchema)

  const inputValidationErrors = validateJsonValue(step.input, selectedTool.inputSchema)
  if (inputValidationErrors.length > 0) {
    throw new Error(
      messages.invalidToolInput(step.toolName, formatJsonValueValidationError(inputValidationErrors))
    )
  }
}

interface ToolPlanValidationMessages {
  invalidPlan: string
  invalidToolName: string
  invalidInput: string
  invalidConfidence: string
  invalidReason: string
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

function getValidationMessages(style: 'provider' | 'server'): ToolPlanValidationMessages {
  if (style === 'server') {
    return {
      invalidPlan: 'Invalid plan',
      invalidToolName: 'Invalid toolName',
      invalidInput: 'Invalid input',
      invalidConfidence: 'Invalid confidence',
      invalidReason: 'Invalid reason',
      invalidSequence: 'Invalid tool sequence',
      invalidSequenceSteps: 'Invalid tool sequence steps',
      sequenceTooLong: 'Tool sequence is too long',
      invalidStep: 'Invalid plan step',
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
    invalidPlan: 'provider returned an invalid plan',
    invalidToolName: 'provider returned a plan without toolName',
    invalidInput: 'provider returned a plan with invalid input',
    invalidConfidence: 'provider returned a plan without numeric confidence',
    invalidReason: 'provider returned a plan without reason',
    invalidSequence: 'provider returned steps without tool_sequence',
    invalidSequenceSteps: 'provider returned an empty tool sequence',
    sequenceTooLong: 'provider returned too many tool sequence steps',
    invalidStep: 'provider returned an invalid plan step',
    invalidStepToolName: 'provider returned a plan step without toolName',
    invalidStepInput: 'provider returned a plan step with invalid input',
    invalidStepConfidence: 'provider returned a plan step without numeric confidence',
    invalidStepReason: 'provider returned a plan step without reason',
    unknownTool(toolName) {
      return `provider selected unknown tool "${toolName}"`
    },
    missingInputSchema: 'provider selected a tool without an input schema',
    invalidToolInput(toolName, detail) {
      return `provider returned invalid input for "${toolName}": ${detail}`
    }
  }
}
