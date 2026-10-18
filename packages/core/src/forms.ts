import { defineTool } from './define-tool'
import type { JsonSchema, RegisteredTool, WebMCPTool } from './interfaces/tool'
import { registerToolWithCleanup, unregisterTool } from './registry'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

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

export type FormInput = Record<string, string | number | boolean | string[]>

export function registerFormTool<TOutput = FormData>(
  options: RegisterFormToolOptions<TOutput>
): RegisteredTool<FormInput, TOutput> {
  const restoreDraftAttributes = createFormToolAttributeRestorer(options.form, options.fields)
  applyFormToolOptions(options)

  let inputSchema: JsonSchema
  try {
    inputSchema = inferFormInputSchema(options.form)
  } finally {
    restoreDraftAttributes()
  }

  const tool = defineTool<FormInput, TOutput>({
    name: options.name,
    description: options.description,
    inputSchema,
    confirmation: options.confirmation,
    execute(input) {
      const errors = validateJsonValue(input, inferFormInputSchema(options.form))
      if (errors.length) throw new Error(formatJsonValueValidationError(errors))
      fillForm(options.form, input)
      if (!options.form.checkValidity()) {
        throw new Error('Form input does not satisfy native validation constraints.')
      }

      if (options.execute) {
        return options.execute(input, options.form)
      }

      return new FormData(options.form) as TOutput
    }
  })

  unregisterTool(options.name)
  const restoreAttributes = createFormToolAttributeRestorer(options.form, options.fields)
  applyFormToolOptions(options)

  try {
    return registerToolWithCleanup(tool, restoreAttributes, 'declarative')
  } catch (error) {
    restoreAttributes()
    throw error
  }
}

function applyFormToolOptions<TOutput>(options: RegisterFormToolOptions<TOutput>): void {
  options.form.setAttribute('toolname', options.name)
  options.form.setAttribute('tooldescription', options.description)
  applyFormToolFieldOptions(options.form, options.fields)
}

function createFormToolAttributeRestorer(
  form: HTMLFormElement,
  fields: RegisterFormToolOptions['fields']
): () => void {
  const snapshots: Array<[Element, string, string | null]> = [
    [form, 'toolname', form.getAttribute('toolname')],
    [form, 'tooldescription', form.getAttribute('tooldescription')]
  ]

  for (const name of Object.keys(fields ?? {})) {
    const field = form.elements.namedItem(name)
    const elements = field instanceof RadioNodeList ? Array.from(field) : [field]

    for (const element of elements) {
      if (!(element instanceof Element)) continue
      snapshots.push([element, 'toolparamtitle', element.getAttribute('toolparamtitle')])
      snapshots.push([
        element,
        'toolparamdescription',
        element.getAttribute('toolparamdescription')
      ])
    }
  }

  return function restoreFormToolAttributes() {
    for (const [element, attribute, value] of snapshots) {
      if (value === null) {
        element.removeAttribute(attribute)
      } else {
        element.setAttribute(attribute, value)
      }
    }
  }
}

export function inferFormInputSchema(form: HTMLFormElement): JsonSchema {
  const properties: Record<string, JsonSchema> = Object.create(null)
  const required: string[] = []
  const fields = Array.from(form.elements).filter(isNamedField)
  const seenNames = new Set<string>()

  for (const field of fields) {
    const name = field.name
    if (seenNames.has(name)) continue
    seenNames.add(name)

    const namedField = form.elements.namedItem(name)
    properties[name] =
      namedField instanceof RadioNodeList
        ? inferFieldGroupSchema(namedField, field)
        : inferFieldSchema(field)

    if (isRequiredField(namedField, field)) {
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

function inferFieldSchema(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): JsonSchema {
  if (field instanceof HTMLInputElement && field.type === 'number') {
    return {
      type: 'number',
      ...getNumberConstraints(field),
      description: getFieldDescription(field)
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    return {
      type: 'boolean',
      ...(field.required ? { const: true } : {}),
      description: getFieldDescription(field)
    }
  }

  if (field instanceof HTMLInputElement && field.type === 'radio') {
    return { type: 'string', enum: [field.value], description: getFieldDescription(field) }
  }

  if (field instanceof HTMLSelectElement) {
    const options = Array.from(field.options)
      .filter(function isEnabledOption(option) {
        return (
          !option.disabled &&
          !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) &&
          (!field.required || field.multiple || option.value !== '')
        )
      })
      .map(function mapOption(option) {
        return option.value
      })

    if (field.multiple) {
      return {
        type: 'array',
        items: {
          type: 'string',
          ...(options.length > 0 ? { enum: options } : {})
        },
        ...(field.required ? { minItems: 1 } : {}),
        description: getFieldDescription(field)
      }
    }

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
      ...getStringConstraints(field),
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
    ...getStringConstraints(field),
    description: getFieldDescription(field)
  }
}

function inferFieldGroupSchema(
  field: RadioNodeList,
  firstField: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): JsonSchema {
  const fields = Array.from(field).filter(isNamedField)
  if (fields.length === 1) return inferFieldSchema(fields[0]!)
  const checkboxes = fields.filter(function checkbox(element) {
    return element instanceof HTMLInputElement && element.type === 'checkbox'
  })
  if (checkboxes.length === fields.length) {
    return {
      type: 'array',
      items: {
        type: 'string',
        enum: checkboxes.map(function value(element) {
          return element.value
        })
      },
      description: getFieldDescription(firstField)
    }
  }
  const radioOptions = Array.from(field)
    .filter(function isEnabledRadioOption(element): element is HTMLInputElement {
      return (
        element instanceof HTMLInputElement && element.type === 'radio' && isNamedField(element)
      )
    })
    .map(function mapRadioOption(element) {
      return element.value
    })

  if (radioOptions.length !== fields.length)
    throw new Error(
      `Form field "${firstField.name}" repeats a name outside a radio or checkbox group.`
    )

  return {
    type: 'string',
    description: getFieldDescription(firstField),
    enum: radioOptions
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
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        )
      ) {
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
    let field = form.elements.namedItem(name)
    if (!field) continue

    if (field instanceof RadioNodeList) {
      const fields = Array.from(field).filter(isNamedField)
      if (fields.length === 1) field = fields[0]!
      else {
        for (const item of fields) {
          if (!(item instanceof HTMLInputElement)) continue
          item.checked = Array.isArray(value)
            ? value.includes(item.value)
            : item.value === String(value)
          if (item.type === 'checkbox' || item.checked) dispatchFieldEvents(item)
        }
        continue
      }
    }

    if (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type)) {
      field.checked = field.type === 'checkbox' ? Boolean(value) : field.value === String(value)
      dispatchFieldEvents(field)
      continue
    }

    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      if (field instanceof HTMLSelectElement && field.multiple && Array.isArray(value)) {
        const values = new Set(value.map(String))
        Array.from(field.options).forEach(function syncSelectedOption(option) {
          option.selected = values.has(option.value)
        })
        dispatchFieldEvents(field)
        continue
      }

      field.value = Array.isArray(value) ? (value[0] ?? '') : String(value)
      dispatchFieldEvents(field)
    }
  }
}

function getNumberConstraints(field: HTMLInputElement): Pick<JsonSchema, 'minimum' | 'maximum'> {
  const minimum = getOptionalNumber(field.min)
  const maximum = getOptionalNumber(field.max)

  return {
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {})
  }
}

function getOptionalNumber(value: string): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function getStringConstraints(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): Pick<JsonSchema, 'minLength' | 'maxLength' | 'pattern'> {
  if (field instanceof HTMLSelectElement) return {}

  return {
    ...(field.minLength >= 0 ? { minLength: field.minLength } : {}),
    ...(field.maxLength >= 0 ? { maxLength: field.maxLength } : {}),
    ...(field instanceof HTMLInputElement && field.pattern
      ? { pattern: `^(?:${field.pattern})$` }
      : {})
  }
}

function isRequiredField(
  namedField: Element | RadioNodeList | null,
  fallbackField: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): boolean {
  if (namedField instanceof RadioNodeList) {
    return Array.from(namedField).some(function hasRequiredField(element) {
      return isFormControl(element) && isNamedField(element) && element.required
    })
  }

  return 'required' in fallbackField && fallbackField.required
}

function isFormControl(
  element: unknown
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

function dispatchFieldEvents(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): void {
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function getFieldDescription(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string {
  const toolParamDescription = field.getAttribute('toolparamdescription')
  if (toolParamDescription) return toolParamDescription

  const explicitDescription = field.getAttribute('data-tool-description')
  if (explicitDescription) return explicitDescription

  const label = getLabelDescription(field)
  if (label) return label

  return field.name
}

function getLabelDescription(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string {
  const label = field.labels?.[0]
  if (!label) return ''

  const clone = label.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return label.textContent?.trim() ?? ''

  clone
    .querySelectorAll('button, input, meter, output, progress, select, textarea')
    .forEach(function removeLabelableElement(element) {
      element.remove()
    })

  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function isNamedField(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
    Boolean(element.name) &&
    !element.matches(':disabled') &&
    !('readOnly' in element && element.readOnly) &&
    element.type !== 'hidden' &&
    element.type !== 'file' &&
    element.type !== 'reset' &&
    element.type !== 'image' &&
    element.type !== 'submit' &&
    element.type !== 'button'
  )
}
