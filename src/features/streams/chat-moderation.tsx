import { useState } from 'react'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useAuth } from '../../lib/auth-context'
import { formatNumber } from '../../lib/format'
import { actions, useAdminMutation } from '../../lib/queries'
import type { ChatLogEntry, Person } from '../../lib/types'
import { SuspendUserDialog } from '../users/UserActionDialogs'
import { ChatPickBar } from './ChatMessages'

// The most the API erases in one request.
const DELETE_BATCH = 500

const messagesCount = (count: number) => `${formatNumber(count)} ${count === 1 ? 'message' : 'messages'}`

/**
 * Deleting messages - one, or every one picked - and suspending whoever sent
 * one, each behind its own confirmation, for staff whose access allows it.
 * A delete here erases the message for good. Render [dialogs] once.
 */
export function useChatModeration() {
  const auth = useAuth()
  const canDelete = auth.can('MANAGE_LIVES')
  const canSuspend = auth.can('MANAGE_USERS')
  const [deleting, setDeleting] = useState<{ streamId: string; message: ChatLogEntry } | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [deletingPicked, setDeletingPicked] = useState<string[] | null>(null)
  const [suspending, setSuspending] = useState<Person | null>(null)
  const remove = useAdminMutation(
    ({ streamId, messageId }: { streamId: string; messageId: string }) => actions.deleteMessage(streamId, messageId),
    { toastErrors: false, success: 'Message deleted for good. It disappears from everyone’s chat.' },
  )
  const removePicked = useAdminMutation(
    async (messageIds: string[]) => {
      let deleted = 0
      for (let start = 0; start < messageIds.length; start += DELETE_BATCH) {
        deleted += (await actions.deleteMessages(messageIds.slice(start, start + DELETE_BATCH))).deleted
      }
      return deleted
    },
    { toastErrors: false, success: (deleted) => `Deleted ${messagesCount(deleted)} for good.` },
  )
  const pick = (ids: string[], on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  return {
    /** What a row may offer for [message], sent in [streamId] hosted by [hostId]. */
    actionsFor: (streamId: string, hostId: string, message: ChatLogEntry) => ({
      onDelete: canDelete ? () => setDeleting({ streamId, message }) : undefined,
      onSuspend: canSuspend && message.user.id !== hostId ? () => setSuspending(message.user) : undefined,
      picked: canDelete ? picked.has(message.id) : undefined,
      onPick: canDelete ? (on: boolean) => pick([message.id], on) : undefined,
    }),
    /** Picking every message shown and deleting the picked ones - the ones picked but no longer shown don't count. */
    pickBar: (shown: ChatLogEntry[]) =>
      canDelete && shown.length > 0 ? (
        <ChatPickBar
          shown={shown}
          picked={shown.filter((message) => picked.has(message.id)).map((message) => message.id)}
          onPickAll={(on) => pick(shown.map((message) => message.id), on)}
          onDelete={setDeletingPicked}
        />
      ) : null,
    dialogs: (
      <>
        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          title="Delete this message for good?"
          description="It's erased, and disappears from the chat for everyone in the live. This can't be undone - the audit log keeps who sent it and the start of what it said."
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
        <ConfirmDialog
          open={deletingPicked !== null}
          onClose={() => setDeletingPicked(null)}
          title={`Delete ${messagesCount(deletingPicked?.length ?? 0)} for good?`}
          description="They're erased, and disappear from the chat for everyone in those lives. This can't be undone - the audit log keeps who sent each one and the start of what it said."
          confirmLabel={`Delete ${messagesCount(deletingPicked?.length ?? 0)}`}
          tone="danger"
          onConfirm={async () => {
            const ids = deletingPicked!
            await removePicked.mutateAsync(ids)
            pick(ids, false)
          }}
        />
        <SuspendUserDialog user={suspending} onClose={() => setSuspending(null)} />
      </>
    ),
  }
}
