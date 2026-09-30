import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './Dialog'
import { SearchInput } from './SearchInput'

describe('ConfirmDialog', () => {
  it('asks for a reason before confirming, and passes it on', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Suspend @troll?"
        confirmLabel="Suspend account"
        tone="danger"
        reason={{ label: 'Reason', required: true, minLength: 3 }}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Suspend account' }))
    expect(screen.getByText('Write at least 3 characters.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Reason/), '  Spam links  ')
    await user.click(screen.getByRole('button', { name: 'Suspend account' }))

    expect(onConfirm).toHaveBeenCalledWith('Spam links')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open and shows why when the action fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Lock this live?"
        confirmLabel="Lock live"
        onConfirm={() => Promise.reject(new Error('This live has already ended.'))}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Lock live' }))

    expect(await screen.findByText('This live has already ended.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('SearchInput', () => {
  afterEach(() => vi.useRealTimers())

  function Harness({ onSearch }: { onSearch: (value: string | undefined) => void }) {
    const [value, setValue] = useState<string | undefined>()
    return (
      <SearchInput
        value={value}
        placeholder="Search"
        onChange={(next) => {
          setValue(next)
          onSearch(next)
        }}
      />
    )
  }

  it('reports once typing pauses, trimmed, without losing a trailing space', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)
    const box = screen.getByRole('searchbox')

    fireEvent.change(box, { target: { value: 'hello ' } })
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(300))
    expect(onSearch).toHaveBeenLastCalledWith('hello')
    expect(box).toHaveValue('hello ')

    fireEvent.change(box, { target: { value: 'hello world' } })
    act(() => vi.advanceTimersByTime(300))
    expect(onSearch).toHaveBeenLastCalledWith('hello world')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onSearch).toHaveBeenLastCalledWith(undefined)
    expect(box).toHaveValue('')
  })
})
