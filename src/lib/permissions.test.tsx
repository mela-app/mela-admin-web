import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { AccessPicker } from '../features/staff/AccessPicker'
import { ACCESS_AREAS, accessSummary, levelOf, sameAccess, withAccessLevel } from './permissions'
import type { AdminPermission } from './types'

const area = (key: string) => ACCESS_AREAS.find((each) => each.key === key)!

describe('access levels', () => {
  it('reads the strongest level an area fully has', () => {
    expect(levelOf(area('users'), [])).toBeNull()
    expect(levelOf(area('users'), ['VIEW_USERS'])?.value).toBe('view')
    expect(levelOf(area('users'), ['VIEW_USERS', 'MANAGE_USERS'])?.value).toBe('manage')
    expect(levelOf(area('alerts'), ['VIEW_ALERTS', 'SEND_ALERTS', 'SEND_GLOBAL_ALERTS'])?.value).toBe('everyone')
    expect(levelOf(area('messages'), ['VIEW_PRIVATE_MESSAGES'])?.value).toBe('read')
    expect(levelOf(area('appUpdates'), ['VIEW_APP_RELEASES'])?.value).toBe('view')
    expect(levelOf(area('appUpdates'), ['VIEW_APP_RELEASES', 'MANAGE_APP_RELEASES'])?.value).toBe('publish')
    expect(levelOf(area('appUpdates'), ['MANAGE_APP_RELEASES'])).toBeNull()
    expect(levelOf(area('reports'), ['VIEW_REPORTS'])?.value).toBe('view')
    expect(levelOf(area('reports'), ['VIEW_REPORTS', 'MANAGE_REPORTS'])?.value).toBe('decide')
  })

  it('changes one area and leaves the others alone', () => {
    const start: AdminPermission[] = ['VIEW_LIVES', 'MANAGE_LIVES', 'VIEW_AUDIT_LOG']
    const lives = area('lives')

    expect(withAccessLevel(start, lives, lives.levels[0])).toEqual(['VIEW_AUDIT_LOG', 'VIEW_LIVES'])
    expect(withAccessLevel(start, lives, null)).toEqual(['VIEW_AUDIT_LOG'])
  })

  it('summarises only the areas with access, and compares access regardless of order', () => {
    expect(accessSummary(['VIEW_AUDIT_LOG', 'VIEW_USERS']).map(({ area: each, level }) => `${each.key}:${level.value}`)).toEqual([
      'users:view',
      'audit:view',
    ])
    expect(sameAccess(['VIEW_LIVES', 'MANAGE_LIVES'], ['MANAGE_LIVES', 'VIEW_LIVES'])).toBe(true)
    expect(sameAccess(['VIEW_LIVES'], ['VIEW_LIVES', 'MANAGE_LIVES'])).toBe(false)
  })
})

describe('AccessPicker', () => {
  function Harness({ onValue }: { onValue: (value: AdminPermission[]) => void }) {
    const [value, setValue] = useState<AdminPermission[]>([])
    return (
      <AccessPicker
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue(next)
        }}
      />
    )
  }

  it('starts with no access anywhere, and gives exactly what is picked', async () => {
    const user = userEvent.setup()
    const seen: AdminPermission[][] = []
    render(<Harness onValue={(value) => seen.push(value)} />)

    for (const group of screen.getAllByRole('radiogroup')) {
      expect(within(group).getByRole('radio', { name: 'None' })).toBeChecked()
    }

    await user.click(within(screen.getByRole('radiogroup', { name: 'Lives and chat' })).getByRole('radio', { name: 'Manage' }))
    expect(seen.at(-1)).toEqual(['VIEW_LIVES', 'MANAGE_LIVES'])

    await user.click(within(screen.getByRole('radiogroup', { name: 'Users' })).getByRole('radio', { name: 'View' }))
    expect(seen.at(-1)).toEqual(['VIEW_LIVES', 'MANAGE_LIVES', 'VIEW_USERS'])
    expect(screen.getByText('See accounts, their details and devices.')).toBeInTheDocument()
  })
})
