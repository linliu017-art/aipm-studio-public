/** Agent-scoped native adapter for Agent Workshop; uses the active model and project. */
import type { Context } from '@deepseek-ai/cordis'
import { reviewPlan, type ReviewConfig } from './plan-review.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FEATURES, COMPONENTS } from './workshop-catalog.ts'
import { checkWorkshopProposal, selectWorkshopComponents } from './workshop-rules.ts'
import { readProjectDocuments } from './documents.ts'
import { featureSchema, proposalSchema } from './workshop-schema.ts'
import { markWorkshopStage, readWorkshopRevision, saveWorkshopRevision } from './workshop-store.ts'

/**
 * Register read, selection, validation and versioned-save operations in the current agent scope.
 * @param config - explicit independent-review bounds.
 * @param ctx - scoped tool registry.
 */
export function registerWorkshopTool(ctx: Context, config: ReviewConfig): void {
  ctx.tools.register(defineTool({
    name: 'aipm_workshop',
    description: 'Agent Workshop for AI/Agent product PRDs and technical plans. Read its agent-workshop skill first. '
      + 'get reads the latest revision and component catalog without creating a project; select applies deterministic rules; '
      + 'check validates a proposal without writes; save commits only requested artifacts into a new immutable version in the current project. '
      + 'Use the active conversation model to draft. Saving a plan automatically runs one separate advisory model review. It does not research competitors, generate code or run tests.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'select', 'check', 'save'] },
      features: { type: 'array', items: featureSchema, description: 'select: the fourteen feature assessments listed by get.' },
      proposal: proposalSchema,
      deliverables: { type: 'array', items: { type: 'string', enum: ['prd', 'plan'] }, description: 'check/save: only artifacts requested by the user.' },
      expectedVersion: { type: 'integer', description: 'save: current.version from get is the workflow version, not a document revision.' },
      targets: { type: 'array', description: 'save: exactly one target per deliverable. Use a documentId and its latest revision from get to update; omit documentId and use 0 to create a separate document.',
        items: { type: 'object', additionalProperties: false, properties: {
          kind: { type: 'string', required: true, enum: ['prd', 'plan'] },
          documentId: { type: 'string' }, expectedVersion: { type: 'integer', required: true },
        } } },
      change: { type: 'string', description: 'save: current user request or revision description.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      summary: { type: 'string', required: true },
      data: { type: 'string', required: true },
    } }, render: (_args, value) => [{ type: 'text', text: value.summary + '\n' + value.data }] },
    async execute(args, exec) {
      const session = exec.agent?.session
      const root = session?.header.cwd
      if (session === undefined || root === undefined) throw new Error('aipm_workshop requires the current Session working directory')
      if (args.action === 'get') {
        const revision = await readWorkshopRevision(root)
        const catalog = await readProjectDocuments(root)
        return { summary: revision === undefined ? '尚无工坊保存记录；已读取项目文档' : '已读取工坊记录和项目文档',
          data: JSON.stringify({ current: revision ?? null, documents: catalog.documents, features: FEATURES, components: COMPONENTS }) }
      }
      if (args.action === 'select') {
        if (args.features === undefined) throw new Error('select requires features')
        return { summary: '已按规则完成组件选型；待确认不表示必选', data: JSON.stringify(selectWorkshopComponents(args.features)) }
      }
      if (args.proposal === undefined || args.deliverables === undefined) throw new Error('check/save require proposal and deliverables')
      const check = checkWorkshopProposal(args.proposal, args.deliverables)
      if (args.action === 'check' || check.errors.length > 0) return {
        summary: check.errors.length > 0 ? '检查未通过，请修正列出的问题；尚未保存' : '机械检查通过；不表示独立审稿或实现验收通过', data: JSON.stringify(check),
      }
      if (args.expectedVersion === undefined || args.change === undefined || args.targets === undefined) {
        throw new Error('save requires expectedVersion, change and explicit document targets')
      }
      const saved = await saveWorkshopRevision(
        root, args.proposal, args.deliverables, args.expectedVersion, args.change, args.targets, session.id,
      )
      if (args.deliverables.includes('prd')) await markWorkshopStage(root, saved.revision.version, session.id)
      const plan = saved.documents[args.deliverables.indexOf('plan')]
      const review = plan === undefined ? undefined : await reviewPlan(ctx, config, session, plan.documentId, plan.version, exec.signal)
      return { summary: '已保存 ' + saved.documents.map(document => document.title + ' V' + String(document.version)).join('、') + (review === undefined ? '' : review.status === 'complete' ? '；审稿报告已单独保存' : '；' + review.message),
        data: JSON.stringify({ workflowVersion: saved.revision.version, documents: saved.documents,
          paths: [...saved.paths, ...review?.status === 'complete' ? [review.path] : []], ...review === undefined ? {} : { review }, warnings: check.warnings }) }
    },
  }))
}
