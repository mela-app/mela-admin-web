import type { AdminPermission } from './types'

export interface AccessLevel {
  value: string
  label: string
  description: string
  // Everything the level gives, the area's weaker levels included (as the API expands them).
  grants: AdminPermission[]
}

export interface AccessArea {
  key: string
  label: string
  // Weakest first; "no access" is not a level.
  levels: AccessLevel[]
}

/** How a super admin sees a platform moderator's access: one level per area of the console. */
export const ACCESS_AREAS: AccessArea[] = [
  {
    key: 'lives',
    label: 'Lives and chat',
    levels: [
      { value: 'view', label: 'View', description: 'See every live and read its chat.', grants: ['VIEW_LIVES'] },
      {
        value: 'manage',
        label: 'Manage',
        description: 'Also lock and unlock lives, and delete chat messages.',
        grants: ['VIEW_LIVES', 'MANAGE_LIVES'],
      },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    levels: [
      { value: 'view', label: 'View', description: 'See accounts, their details and devices.', grants: ['VIEW_USERS'] },
      {
        value: 'manage',
        label: 'Manage',
        description: 'Also suspend, reinstate and sign out app users, and fix their profiles.',
        grants: ['VIEW_USERS', 'MANAGE_USERS'],
      },
    ],
  },
  {
    key: 'alerts',
    label: 'Alerts',
    levels: [
      { value: 'view', label: 'View', description: 'See the alerts that were sent.', grants: ['VIEW_ALERTS'] },
      {
        value: 'send',
        label: 'Send',
        description: 'Also alert everyone in one live.',
        grants: ['VIEW_ALERTS', 'SEND_ALERTS'],
      },
      {
        value: 'everyone',
        label: 'Everyone',
        description: 'Also alert everyone using the app at once.',
        grants: ['VIEW_ALERTS', 'SEND_ALERTS', 'SEND_GLOBAL_ALERTS'],
      },
    ],
  },
  {
    key: 'phrases',
    label: 'Banned phrases',
    levels: [
      { value: 'view', label: 'View', description: 'See the list and test messages against it.', grants: ['VIEW_PHRASES'] },
      {
        value: 'manage',
        label: 'Manage',
        description: 'Also add, change and remove phrases.',
        grants: ['VIEW_PHRASES', 'MANAGE_PHRASES'],
      },
    ],
  },
  {
    key: 'audit',
    label: 'Audit log',
    levels: [
      { value: 'view', label: 'View', description: 'Read and export everything that was recorded.', grants: ['VIEW_AUDIT_LOG'] },
    ],
  },
  {
    key: 'messages',
    label: 'Private messages',
    levels: [
      {
        value: 'read',
        label: 'Read',
        description: 'Read conversations between users, a day at a time. Every conversation opened is recorded in the audit log.',
        grants: ['VIEW_PRIVATE_MESSAGES'],
      },
    ],
  },
]

/** The strongest level of [area] that [permissions] fully covers, or null for no access. */
export function levelOf(area: AccessArea, permissions: readonly AdminPermission[]): AccessLevel | null {
  let strongest: AccessLevel | null = null
  for (const level of area.levels) {
    if (level.grants.every((permission) => permissions.includes(permission))) strongest = level
  }
  return strongest
}

/** [permissions] with [area] set to [level] (null for no access); other areas are left alone. */
export function withAccessLevel(
  permissions: readonly AdminPermission[],
  area: AccessArea,
  level: AccessLevel | null,
): AdminPermission[] {
  const inArea = new Set(area.levels.flatMap((each) => each.grants))
  return [...permissions.filter((permission) => !inArea.has(permission)), ...(level?.grants ?? [])]
}

/** Each area with some access, and how much. */
export function accessSummary(permissions: readonly AdminPermission[]): Array<{ area: AccessArea; level: AccessLevel }> {
  return ACCESS_AREAS.flatMap((area) => {
    const level = levelOf(area, permissions)
    return level ? [{ area, level }] : []
  })
}

/** Whether two permission lists give the same access, whatever their order. */
export function sameAccess(a: readonly AdminPermission[], b: readonly AdminPermission[]): boolean {
  return ACCESS_AREAS.every((area) => levelOf(area, a)?.value === levelOf(area, b)?.value)
}
