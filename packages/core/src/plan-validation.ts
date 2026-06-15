import type { JsonSchema, ToolPlan, ToolPlanStep } from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

export const plannerOutcomeToolNames = ['needs_clarification', 'no_tools_match'] as const
export type PlannerOutcomeToolName = (typeof plannerOutcomeToolNames)[number]

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
  plan: unknown,
  tools: ToolPlanValidationTool[],
  options: ToolPlanValidationOptions = {}
): void {
  const messages = getValidationMessages(options.messageStyle ?? 'provider')

  if (!plan || typeof plan !== 'object') throw new Error(messages.invalidPlan)
  const typedPlan = plan as Partial<ToolPlan>
  if (typeof typedPlan.toolName !== 'string') throw new Error(messages.invalidToolName)
  if (!typedPlan.input || typeof typedPlan.input !== 'object' || Array.isArray(typedPlan.input)) {
    throw new Error(messages.invalidInput)
  }
  if (typeof typedPlan.confidence !== 'number' || !Number.isFinite(typedPlan.confidence)) {
    throw new Error(messages.invalidConfidence)
  }
  if (typeof typedPlan.reason !== 'string') throw new Error(messages.invalidReason)
  if (isPlannerOutcomeToolName(typedPlan.toolName)) {
    if (typedPlan.steps !== undefined) throw new Error(messages.invalidOutcomeSteps)
    return
  }
  if (typedPlan.steps !== undefined) {
    validateToolPlanSequence(typedPlan as ToolPlan, tools, messages)
    return
  }

  validateToolPlanStep(typedPlan as ToolPlanStep, tools, messages)
}

export function isPlannerOutcomeToolName(toolName: string): toolName is PlannerOutcomeToolName {
  return plannerOutcomeToolNames.includes(toolName as PlannerOutcomeToolName)
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

interface ToolPlanValidationMessages {
  invalidPlan: string
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

function getValidationMessages(style: 'provider' | 'server'): ToolPlanValidationMessages {
  if (style === 'server') {
    return {
      invalidPlan: 'Invalid plan',
      invalidToolName: 'Invalid toolName',
      invalidInput: 'Invalid input',
      invalidConfidence: 'Invalid confidence',
      invalidReason: 'Invalid reason',
      invalidOutcomeSteps: 'Planner outcomes cannot include steps',
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
    invalidOutcomeSteps: 'provider returned a planner outcome with steps',
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
