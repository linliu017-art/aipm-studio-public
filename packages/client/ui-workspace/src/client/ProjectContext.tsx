/** Visible project ownership for a bound conversation. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contract/slots.ts'
import css from './WorkspacePicker.module.css'

type Props = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'workspace'> & {
  startNewIdea: () => void
}

/**
 * Show the selected Workspace and an independent new-idea action.
 * @param props - Session binding, standard Workspace source, localized copy and navigation.
 * @returns the project label and new-idea control.
 */
export function ProjectContext({ sessionId, useWorkspaces, t, startNewIdea }: Props) {
  const workspace = useWorkspaces(snapshot => snapshot.items.find(item => item.sessionIds.includes(sessionId)))
  return <>
    <span className={css.projectLabel} title={workspace?.path}>{workspace === undefined
      ? t('project.unassigned')
      : t('project.current', { name: workspace.title })}</span>
    <Button variant="ghost" onClick={startNewIdea}>{t('idea.new')}</Button>
  </>
}
