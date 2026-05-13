import { defineTool } from './define-tool'
import type { JsonSchema, RegisteredTool, WebMCPTool } from './interfaces/tool'
import { registerTool } from './registry'

export interface RegisterFormToolOptions<TOutput = FormData> {
  form: HTMLFormElement
  name: string
  description: string
  confirmation?: WebMCPTool<FormInput, TOutput>['confirmation']
  execute?: (input: FormInput, form: HTMLFormElement) => Promise<TOutput> | TOutput
}

export type FormInput = Record<string, string | boolean | string[]>

export function registerFormTool<TOutput = FormData>(
  options: RegisterFormToolOptions<TOutput>
): RegisteredTool<FormInput, TOutput> {
  options.form.setAttribute('toolname', options.name)
  options.form.setAttribute('tooldescription', options.description)

  return registerTool(defineTool<FormInput, TOutput>({
    name: options.name,
    description: options.description,
    inputSchema: inferFormInputSchema(options.form),
    confirmation: options.confirmation,
    execute(input) {
      fillForm(options.form, input)

      if (options.execute) {
        return options.execute(input, options.form)
      }

      return new FormData(options.form) as TOutput
    }
  }))
}

export function inferFormInputSchema(form: HTMLFormElement): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  const fields = Array.from(form.elements).filter(isNamedField)

  for (const field of fields) {
    const name = field.name
    properties[name] = inferFieldSchema(field)

    if ('required' in field && field.required) {
      required.push(name)
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
    'x-webmcp-source': 'form'
  }
}

function inferFieldSchema(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): JsonSchema {
  if (field instanceof HTMLInputElement && field.type === 'number') {
    return {
      type: 'number',
      description: getFieldDescription(field)
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    return {
      type: 'boolean',
      description: getFieldDescription(field)
    }
  }

  return {
    type: 'string',
    description: getFieldDescription(field)
  }
}

function fillForm(form: HTMLFormElement, input: FormInput): void {
  for (const [name, value] of Object.entries(input)) {
    const field = form.elements.namedItem(name)
    if (!field) continue

    if (field instanceof RadioNodeList) {
      field.value = Array.isArray(value) ? value[0] ?? '' : String(value)
      continue
    }

    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(value)
      continue
    }

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = Array.isArray(value) ? value[0] ?? '' : String(value)
    }
  }
}

function getFieldDescription(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const explicitDescription = field.getAttribute('data-tool-description')
  if (explicitDescription) return explicitDescription

  const label = field.labels?.[0]?.textContent?.trim()
  if (label) return label

  return field.name
}

function isNamedField(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    && Boolean(element.name)
    && element.type !== 'submit'
    && element.type !== 'button'
}
