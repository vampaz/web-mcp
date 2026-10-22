import { registerFormTool, type FormInput } from '@vampaz/webmcp-kit'
import { defineZodTool } from '@vampaz/webmcp-kit/zod'
import { z } from 'zod'

export function createGreetingTool() {
  return defineZodTool({
    name: 'format_greeting',
    description:
      'Format a short greeting for a person by name. It does not change the application.',
    schema: z.strictObject({
      name: z.string().min(1).max(40),
      excited: z.boolean().optional()
    }),
    annotations: { readOnlyHint: true },
    execute(input) {
      return { greeting: `Hello, ${input.name}${input.excited ? '!' : '.'}` }
    }
  })
}

export function registerContactFormTool(
  form: HTMLFormElement,
  onFilled: (input: FormInput) => void
) {
  return registerFormTool({
    form,
    name: 'fill_contact_form',
    description:
      'Fill the visible contact form draft with a name, topic, and urgency. Submission stays with the user.',
    fields: {
      name: { description: 'Name of the person to contact.' },
      topic: { description: 'Subject area of the request.' },
      urgent: { description: 'Whether the request needs a reply today.' }
    },
    execute(input) {
      onFilled(input)
      return input
    }
  })
}
