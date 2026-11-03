/** Structured inputs shared by Agent Workshop tools, validation and saved revisions. */
import { validateArgs, type InferValue } from '@deepseek-ai/dsh-tools'

const text = { type: 'string', required: true } as const
const strings = { type: 'array', items: { type: 'string' }, required: true } as const

/** Citation-bearing requirement fact; open items remain visibly unconfirmed. */
export const factSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    key: { type: 'string', required: true, enum: ['goal', 'users', 'core_loop', 'deliverable', 'boundaries', 'constraints'] },
    value: text,
    status: { type: 'string', required: true, enum: ['confirmed', 'open'] },
    source: { ...text, description: 'Exact supporting quote from sourceText; empty only for open items.' },
  },
} as const

/** One model assessment used as input to deterministic component selection. */
export const featureSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: text,
    value: { type: 'string', required: true, enum: ['yes', 'no', 'later', 'unknown'] },
    evidence: text,
  },
} as const

/** One proposal; its engineering design is optional for PRD-only requests. */
export const proposalSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    sourceText: { ...text, description: 'User statements and supplied material, excluding assistant-generated conclusions.' },
    facts: { type: 'array', items: factSchema, required: true },
    requirements: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        id: text, title: text, description: text, acceptance: strings,
        status: { type: 'string', required: true, enum: ['confirmed', 'open'] }, source: text,
      } },
    },
    metrics: strings,
    unknowns: strings,
    features: { type: 'array', items: featureSchema },
    design: { type: 'object', additionalProperties: false, properties: {
      elements: { type: 'object', additionalProperties: false, properties: {
        tools: strings, knowledge: strings, observation: strings, action: strings, permissions: strings,
      }, required: true },
      tools: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        name: text, input: text, output: text, sideEffect: text,
        permission: { type: 'string', enum: ['allow', 'ask', 'deny'], required: true },
        layer: { type: 'string', enum: ['1', '2', '3', '4', '5', '6', '7'], required: true },
      } } },
      systemPrompt: text,
      contextMemory: text,
      failures: { type: 'object', additionalProperties: false, required: true, properties: {
        toolFailure: text, hallucination: text, timeout: text, unauthorized: text,
      } },
      observability: strings,
      deployment: text,
      testing: strings,
    } },
  },
} as const

/** Typed proposal reconstructed from the public tool schema. */
export type WorkshopProposal = InferValue<typeof proposalSchema>
/** Requested artifact kinds; a PRD request never implicitly adds a technical plan. */
export type WorkshopDeliverable = 'prd' | 'plan'
/** Feature assessments before deterministic selection. */
export type WorkshopFeature = InferValue<typeof featureSchema>

/**
 * Validate a proposal received from disk or another JSON source.
 * @param value - untrusted JSON value.
 * @returns the structurally validated proposal.
 */
export function parseWorkshopProposal(value: unknown): WorkshopProposal {
  const errors = validateArgs({ proposal: { ...proposalSchema, required: true } }, { proposal: value })
  if (errors.length > 0) throw new Error('Agent Workshop proposal is invalid: ' + errors.join('; '))
  return value as WorkshopProposal
}
