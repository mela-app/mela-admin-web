import { useState } from 'react'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useAuth } from '../../lib/auth-context'
import { actions, useAdminMutation } from '../../lib/queries'
import type { ChatLogEntry, Person } from '../../lib/types'
import { SuspendUserDialog } from '../users/UserActionDialogs'

/**
 * Deleting a message and suspending whoever sent it, each behind its own
 * confirmation - for staff whose access allows it. Render [dialogs] once.
 */
export function useChatModeration() {
  const auth = useAuth()
  const canDelete = auth.can('MANAGE_LIVES')
  const canSuspend = auth.can('MANAGE_USERS')
  const [deleting, setDeleting] = useState<{ streamId: string; message: ChatLogEntry } | null>(null)
  const [suspending, setSuspending] = useState<Person | null>(null)
  const remove = useAdminMutation(
    ({ streamId, messageId }: { streamId: string; messageId: string }) => actions.deleteMessage(streamId, messageId),
    { toastErrors: false, success: 'Message deleted. It disappears from everyone’s chat.' },
  )

  return {
    /** What a row may offer for [message], sent in [streamId] hosted by [hostId]. */
    actionsFor: (streamId: string, hostId: string, message: ChatLogEntry) => ({
      onDelete: canDelete && message.moderationStatus !== 'DELETED' ? () => setDeleting({ streamId, message }) : undefined,
      onSuspend: canSuspend && message.user.id !== hostId ? () => setSuspending(message.user) : undefined,
    }),
    dialogs: (
      <>
        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          title="Delete this message?"
          description="It's removed from the chat for everyone in the live. The deletion is recorded in the audit log."
          confirmLabel="Delete message"
          tone="danger"
          onConfirm={() => remove.mutateAsync({ streamId: deleting!.streamId, messageId: deleting!.message.id })}
        >
          {deleting && (
            <blockquote className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <span className="mb-0.5 block text-xs font-medium text-zinc-500">@{deleting.message.user.username}</span>
              {deleting.message.imageUrl ? `📷 ${deleting.message.text || 'Photo'}` : deleting.message.text}
            </blockquote>
          )}
        </ConfirmDialog>
        <SuspendUserDialog user={suspending} onClose={() => setSuspending(null)} />
      </>
    ),
  }
}
