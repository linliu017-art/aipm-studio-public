/** Ordinary conversation document saves use the same immutable writer as Workshop. */
import type { Context } from '@deepseek-ai/cordis'
import { reviewPlan, type ReviewConfig } from './plan-review.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DOCUMENT_KINDS, readDocumentSource, readProjectDocuments, saveProjectDocuments } from './documents.ts'

/**
 * Register logical document discovery, organizing and independent revision saves.
 * @param config - explicit independent-review bounds.
 * @param ctx - current Agent tool scope.
 */
export function registerDocumentTool(ctx: Context, config: ReviewConfig): void {
  ctx.tools.register(defineTool({
    name: 'aipm_document',
    description: 'Read and save product documents in the current project. get lists document identities and revision paths without writes. '
      + 'Read the current file before updating it. save creates a document when documentId is absent (expectedVersion 0), or appends a revision '
      + 'to that exact document using the version returned by get. Titles alone never select an existing document. '
      + 'organize snapshots recognized legacy outputs without changing their original files. Only use organize when the user requests it. '
      + 'Saving a technical plan also runs one separate advisory model review and saves its report. '
      + 'Save only requested documents; do not write product outputs directly into stage or Workshop folders.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'save', 'organize'] },
      documentId: { type: 'string', description: 'Exact identity from get; omit only to create a separate document.' },
      title: { type: 'string', description: 'save: user-facing document title.' },
      kind: { type: 'string', enum: [...DOCUMENT_KINDS], description: 'save: document type, independent of workflow stage.' },
      fileName: { type: 'string', description: 'save: a single file name, for example PRD.md or 方案.md.' },
      content: { type: 'string', description: 'save: complete requested document text.' },
      sourcePath: { type: 'string', description: 'save: existing project-relative file to snapshot, including binary artifacts; use instead of content.' },
      expectedVersion: { type: 'integer', description: 'save: latest revision number from get, or zero for a new document.' },
      change: { type: 'string', description: 'save: the user request or a short description of this update.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      summary: { type: 'string', required: true }, data: { type: 'string', required: true },
    } }, render: (_args, value) => [{ type: 'text', text: value.summary + '\n' + value.data }] },
    async execute(args, exec) {
      const session = exec.agent?.session
      const root = session?.header.cwd
      if (session === undefined || root === undefined) throw new Error('aipm_document requires the current Session project')
      if (args.action === 'get') {
        const catalog = await readProjectDocuments(root)
        const documents = args.documentId === undefined ? catalog.documents : catalog.documents.filter(row => row.id === args.documentId)
        if (args.documentId !== undefined && documents.length === 0) throw new Error('Document not found')
        return { summary: '项目文档：' + String(documents.length) + ' 份', data: JSON.stringify({ documents }) }
      }
      if (args.action === 'organize') {
        const documents = await saveProjectDocuments(root, [])
        return { summary: '已整理项目文档，原文件保留', data: JSON.stringify({ documents }) }
      }
      if (args.title === undefined || args.kind === undefined || args.fileName === undefined
        || (args.content === undefined && args.sourcePath === undefined)
        || args.expectedVersion === undefined || args.change === undefined) {
        throw new Error('save requires document content, kind, title and expectedVersion')
      }
      if (args.content !== undefined && args.sourcePath !== undefined) throw new Error('Use either content or sourcePath')
      let content: string | Uint8Array | undefined = args.content
      if (content === undefined) {
        if (args.sourcePath === undefined) throw new Error('save requires content or sourcePath')
        content = await readDocumentSource(root, args.sourcePath)
      }
      const documents = await saveProjectDocuments(root, [{
        ...args.documentId === undefined ? {} : { id: args.documentId },
        title: args.title, kind: args.kind, fileName: args.fileName, content,
        expectedVersion: args.expectedVersion, change: args.change, source: 'conversation', sessionId: session.id,
        ...args.sourcePath === undefined ? {} : { originalPath: args.sourcePath },
      }])
      const document = documents[0]
      const revision = document?.revisions.at(-1)
      if (document === undefined || revision === undefined) throw new Error('Document save returned no revision')
      const review = document.kind === 'plan' ? await reviewPlan(ctx, config, session, document.id, revision.version, exec.signal) : undefined
      return { summary: '已保存 ' + document.title + ' V' + String(revision.version) + '，历史版本保留' + (review === undefined ? '' : review.status === 'complete' ? '；审稿报告已单独保存' : '；' + review.message),
        data: JSON.stringify({ documentId: document.id, version: revision.version, paths: [revision.path, ...review?.status === 'complete' ? [review.path] : []], ...review === undefined ? {} : { review } }) }
    },
  }))
}
