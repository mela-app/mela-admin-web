import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { AuthContext, type Auth } from '../../lib/auth-context'
import * as queries from '../../lib/queries'
import { actions } from '../../lib/queries'
import type { CameraEffect, CameraEffectKind } from '../../lib/types'
import { EffectForm } from './EffectForm'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useCameraEffectCategories: vi.fn(() => ({ data: [{ id: 'sports', name: 'Sports', sortOrder: 0, effectCount: 0 }] })),
  uploadCameraEffectFile: vi.fn(),
}))

function showing(kind: CameraEffectKind, onClose = vi.fn()) {
  const auth = { can: () => true } as unknown as Auth
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <EffectForm kind={kind} effect={null} onClose={onClose} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return onClose
}

afterEach(() => vi.restoreAllMocks())

describe('adding a camera effect', () => {
  it('uploads the file, then saves it in its category, as a draft', async () => {
    const user = userEvent.setup()
    vi.mocked(queries.uploadCameraEffectFile).mockResolvedValue({ key: 'camera-effects/abc.deepar', size: 2048 })
    const create = vi.spyOn(actions, 'createCameraEffect').mockResolvedValue({} as CameraEffect)
    const onClose = showing('EFFECT')

    await user.type(screen.getByLabelText(/^Name/), 'Football')
    await user.selectOptions(screen.getByLabelText('Category'), 'sports')
    await user.upload(
      // The first is the .deepar file; the second the thumbnail.
      screen.getAllByLabelText(/Choose file/, { selector: 'input' })[0] as HTMLInputElement,
      new File(['x'], 'ball.deepar'),
    )
    await screen.findByText('ball.deepar')
    await user.click(screen.getByRole('button', { name: 'Add effect' }))

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'EFFECT',
        name: 'Football',
        categoryId: 'sports',
        fileKey: 'camera-effects/abc.deepar',
        fileSize: 2048,
        published: false,
      }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it("the beauty rig's sliders must be valid JSON", async () => {
    const user = userEvent.setup()
    const create = vi.spyOn(actions, 'createCameraEffect')
    showing('BEAUTY')

    await user.type(screen.getByLabelText(/^Name/), 'Beauty')
    await user.clear(screen.getByLabelText('Sliders'))
    await user.type(screen.getByLabelText('Sliders'), 'not json')
    await user.click(screen.getByRole('button', { name: 'Add beauty rig' }))

    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText(/must be valid JSON/)).toBeInTheDocument()
  })
})
