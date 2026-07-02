import type { JsonSchema } from './tool'

/**
 * Derives the TypeScript input type from a JSON Schema literal, covering the
 * schema subset validated by validateJsonSchema(): object/properties/required,
 * string, number, integer, boolean, null, array/items, anyOf, and enum.
 *
 * Wide schemas (values not written as literals in source) fall back to
 * Record<string, unknown>, matching the historical defineTool() default.
 */
export type InferToolInput<TSchema extends JsonSchema> = UnknownToRecord<
  InferJsonSchemaType<TSchema>
>

type UnknownToRecord<T> = [unknown] extends [T] ? Record<string, unknown> : T

type InferJsonSchemaType<S> = S extends { enum: readonly (infer E)[] }
  ? E
  : S extends { anyOf: readonly (infer A)[] }
    ? InferJsonSchemaType<A>
    : S extends { type: infer T }
      ? T extends readonly string[]
        ? InferNamedType<T[number], S>
        : InferNamedType<T, S>
      : unknown

type InferNamedType<T, S> = T extends 'string'
  ? string
  : T extends 'number' | 'integer'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'null'
        ? null
        : T extends 'array'
          ? InferArrayType<S>
          : T extends 'object'
            ? InferObjectType<S>
            : unknown

type InferArrayType<S> = S extends { items: infer I } ? InferJsonSchemaType<I>[] : unknown[]

type InferObjectType<S> = S extends { properties: infer P }
  ? Simplify<
      { [K in RequiredPropertyKeys<S, P>]: InferJsonSchemaType<P[K]> } & {
        [K in OptionalPropertyKeys<S, P>]?: InferJsonSchemaType<P[K]>
      }
    >
  : Record<string, unknown>

type RequiredPropertyKeys<S, P> = S extends { required: readonly (infer R)[] }
  ? Extract<keyof P, R>
  : never

type OptionalPropertyKeys<S, P> = Exclude<keyof P, RequiredPropertyKeys<S, P>>

type Simplify<T> = { [K in keyof T]: T[K] } & {}
