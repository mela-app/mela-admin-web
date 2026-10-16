import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import * as queries from '../../lib/queries'
import { actions } from '../../lib/queries'
import type { CameraEffect } from '../../lib/types'
import { matchUploads, nameFromFile } from './bulk'
import { BulkUpload } from './BulkUpload'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useCameraEffectCategories: vi.fn(() => ({ data: [{ id: 'funny', name: 'Funny', sortOrder: 0, effectCount: 0 }] })),
  uploadCameraEffectFile: vi.fn(),
}))

// As a browser gives them: pictures with their type.
const file = (name: string) =>
  new File(['x'], name, { type: name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : '' })

afterEach(() => vi.restoreAllMocks())

describe('matching the picked files', () => {
  it('pairs each .deepar file with the picture of the same name, and names it from the file', () => {
    const match = matchUploads(
      [
        file('viking_helmet.deepar'),
        file('Viking_Helmet.png'),
        file('MakeupLook.deepar'),
        file('makeuplook_thumb.jpg'),
        file('fire.deepar'),
        file('stray.png'),
        file('notes.txt'),
      ],
      'EFFECT',
    )

    expect(match.items.map((item) => [item.name, item.thumbnail?.name ?? null])).toEqual([
      ['Fire', null],
      ['Makeup Look', 'makeuplook_thumb.jpg'],
      ['Viking Helmet', 'Viking_Helmet.png'],
    ])
    expect(match.unused.map((each) => each.name)).toEqual(['stray.png', 'notes.txt'])
  })

  it('takes each picture as a background', () => {
    const match = matchUploads([file('sunny-beach.jpg'), file('city.webp'), file('x.deepar')], 'BACKGROUND')
    expect(match.items.map((item) => item.name)).toEqual(['City', 'Sunny Beach'])
    expect(match.unused.map((each) => each.name)).toEqual(['x.deepar'])
  })

  it('makes readable names', () => {
    expect(nameFromFile('neon_devil-horns')).toBe('Neon Devil Horns')
    expect(nameFromFile('galaxyBackground')).toBe('Galaxy Background')
  })
})

describe('uploading many', () => {
  it('uploads each file and its thumbnail, then adds them - published, in the category picked', async () => {
    const user = userEvent.setup()
    let n = 0
    vi.mocked(queries.uploadCameraEffectFile).mockImplementation(async (picked) => ({
      key: `camera-effects/${++n}-${picked.name}`,
      size: 10,
    }))
    const create = vi.spyOn(actions, 'createCameraEffect').mockResolvedValue({} as CameraEffect)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <BulkUpload kind="EFFECT" onClose={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    await user.upload(screen.getByLabelText('Choose files'), [file('viking.deepar'), file('viking.png')])
    expect(screen.getByDisplayValue('Viking')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add 1 effects' }))
    expect(screen.getByText('Pick a category for all of them, or for each one.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Category for all'), 'funny')
    await user.click(screen.getByRole('button', { name: 'Add 1 effects' }))

    expect(await screen.findByText('Added')).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith({
      kind: 'EFFECT',
      name: 'Viking',
      fileKey: expect.stringContaining('viking.deepar'),
      fileSize: 10,
      thumbnailKey: expect.stringContaining('viking.png'),
      categoryId: 'funny',
      published: true,
    })
  })
})
