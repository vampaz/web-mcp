import { defineTool } from './define-tool'
import type { JsonSchema, RegisteredTool, WebMCPTool } from './interfaces/tool'
import { registerTool } from './registry'

export interface RegisterFormToolOptions<TOutput = FormData> {
  form: HTMLFormElement
  name: string
  description: string
  confirmation?: WebMCPTool<FormInput, TOutput>['confirmation']
  fields?: Record<string, RegisterFormToolFieldOptions>
  execute?: (input: FormInput, form: HTMLFormElement) => Promise<TOutput> | TOutput
}

export interface RegisterFormToolFieldOptions {
  title?: string
  description?: string
}

export type FormInput = Record<string, string | boolean | string[]>

export function registerFormTool<TOutput = FormData>(
  options: RegisterFormToolOptions<TOutput>
): RegisteredTool<FormInput, TOutput> {
  options.form.setAttribute('toolname', options.name)
  options.form.setAttribute('tooldescription', options.description)
  applyFormToolFieldOptions(options.form, options.fields)

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

  if (field instanceof HTMLSelectElement) {
    const options = Array.from(field.options)
      .filter(function isEnabledOption(option) {
        return !option.disabled && option.value !== ''
      })
      .map(function mapOption(option) {
        return option.value
      })

    return {
      type: 'string',
      description: getFieldDescription(field),
      ...(options.length > 0 ? { enum: options } : {})
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'email') {
    return {
      type: 'string',
      format: 'email',
      description: getFieldDescription(field)
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'date') {
    return {
      type: 'string',
      format: 'date',
      description: getFieldDescription(field)
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'time') {
    return {
      type: 'string',
      pattern: '^\\d{2}:\\d{2}$',
      description: getFieldDescription(field)
    }
  }

  return {
    type: 'string',
    description: getFieldDescription(field)
  }
}

function applyFormToolFieldOptions(
  form: HTMLFormElement,
  fields: RegisterFormToolOptions['fields']
): void {
  if (!fields) return

  for (const [name, options] of Object.entries(fields)) {
    const field = form.elements.namedItem(name)
    const elements = field instanceof RadioNodeList ? Array.from(field) : [field]

    for (const element of elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
        continue
      }

      if (options.title) {
        element.setAttribute('toolparamtitle', options.title)
      }

      if (options.description) {
        element.setAttribute('toolparamdescription', options.description)
      }
    }
  }
}

function fillForm(form: HTMLFormElement, input: FormInput): void {
  for (const [name, value] of Object.entries(input)) {
    const field = form.elements.namedItem(name)
    if (!field) continue

    if (field instanceof RadioNodeList) {
      field.value = Array.isArray(value) ? value[0] ?? '' : String(value)
      dispatchRadioGroupEvents(field)
      continue
    }

    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(value)
      dispatchFieldEvents(field)
      continue
    }

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = Array.isArray(value) ? value[0] ?? '' : String(value)
      dispatchFieldEvents(field)
    }
  }
}

function dispatchRadioGroupEvents(field: RadioNodeList): void {
  for (let index = 0; index < field.length; index += 1) {
    const item = field.item(index)
    if (item instanceof HTMLInputElement && item.checked) {
      dispatchFieldEvents(item)
      return
    }
  }
}

function dispatchFieldEvents(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function getFieldDescription(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const toolParamDescription = field.getAttribute('toolparamdescription')
  if (toolParamDescription) return toolParamDescription

  const explicitDescription = field.getAttribute('data-tool-description')
  if (explicitDescription) return explicitDescription

  const label = getLabelDescription(field)
  if (label) return label

  return field.name
}

function getLabelDescription(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const label = field.labels?.[0]
  if (!label) return ''

  const clone = label.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return label.textContent?.trim() ?? ''

  clone.querySelectorAll('button, input, meter, output, progress, select, textarea').forEach(function removeLabelableElement(element) {
    element.remove()
  })

  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function isNamedField(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    && Boolean(element.name)
    && element.type !== 'submit'
    && element.type !== 'button'
}
