import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { actions, useVideoOverview } from '../../lib/queries'
import type { VideoOverview } from '../../lib/types'
import { timeUntil } from './video-format'
import { VideoPage } from './VideoPage'

vi.mock('../../lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/queries')>()),
  useVideoOverview: vi.fn(),
}))

const overview = (overrides: Partial<VideoOverview['agora']> = {}): VideoOverview => ({
  activeProvider: 'AGORA',
  providers: [
    { kind: 'AGORA', configured: true, liveNow: 3 },
    { kind: 'LIVEKIT', configured: true, liveNow: 0 },
  ],
  agora: {
    freeMinutes: 10_000,
    usedMinutes: 8_500,
    remainingMinutes: 1_500,
    percentUsed: 85,
    burnPerMinute: 24,
    runsOutAt: null,
    reportedMinutes: 8_200,
    pendingMinutes: 300,
    reportedThrough: '2026-10-21T00:00:00Z',
    report: { configured: true, fetchedAt: '2026-10-22T09:30:00Z', error: null },
    periodStart: '2026-10-01T00:00:00Z',
    resetsAt: '2026-11-01T00:00:00Z',
    ...overrides,
  },
  settings: {
    agoraFreeMinutes: 10_000,
    autoSwitch: false,
    autoSwitchBelowMinutes: 500,
    switchBackOnReset: true,
  },
  switches: [
    {
      id: 'sw1',
      from: 'LIVEKIT',
      to: 'AGORA',
      reason: "Agora's free minutes restarted",
      createdAt: '2026-10-01T00:01:00Z',
      actor: null,
    },
  ],
})

function showing(data: VideoOverview) {
  vi.mocked(useVideoOverview).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useVideoOverview>)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <VideoPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('VideoPage', () => {
  it("shows the active provider and what is left of Agora's free minutes", () => {
    showing(overview())

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()
    expect(screen.getByText('of 10,000 minutes')).toBeInTheDocument()
    expect(screen.getByText('24/min')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85')
    expect(screen.getByText(/^Automatic ·/)).toBeInTheDocument()
  })

  it('warns when the minutes run out before they restart, and when they are gone', () => {
    showing(overview({ runsOutAt: '2026-10-25T10:00:00Z' }))
    expect(screen.getByText(/At this pace they run out/)).toBeInTheDocument()
  })

  it('says when the free minutes are used up', () => {
    showing(overview({ remainingMinutes: 0, usedMinutes: 10_200, percentUsed: 100 }))
    expect(screen.getByText('The free minutes are used up')).toBeInTheDocument()
  })

  it('switches only after saying running lives stay where they are', async () => {
    const user = userEvent.setup()
    const switchProvider = vi.spyOn(actions, 'switchVideoProvider').mockResolvedValue(overview())
    showing(overview())

    await user.click(screen.getByRole('button', { name: 'Switch to LiveKit…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/3 lives running on Agora stay there until they end/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Why/), 'Saving minutes')
    await user.click(within(dialog).getByRole('button', { name: 'Switch to LiveKit' }))

    expect(switchProvider).toHaveBeenCalledWith('LIVEKIT', 'Saving minutes')
  })

  it("can't switch to a provider that isn't set up", () => {
    const data = overview()
    data.providers[1].configured = false
    showing(data)

    expect(screen.getByRole('button', { name: 'Switch to LiveKit…' })).toBeDisabled()
    expect(screen.getByText('Not set up')).toBeInTheDocument()
  })

  it('saves the automatic switch', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(actions, 'updateVideoSettings').mockResolvedValue(overview())
    showing(overview())

    const save = screen.getByRole('button', { name: 'Save settings' })
    expect(save).toBeDisabled()
    await user.click(screen.getByLabelText(/Switch new lives to LiveKit by itself/))
    await user.clear(screen.getByLabelText(/When fewer minutes are left than/))
    await user.type(screen.getByLabelText(/When fewer minutes are left than/), '800')
    await user.click(save)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ autoSwitch: true, autoSwitchBelowMinutes: 800, agoraFreeMinutes: 10_000 }),
    )
  })

  it("splits used minutes into Agora's report and today's count, and refreshes it", async () => {
    const user = userEvent.setup()
    const refresh = vi.spyOn(actions, 'refreshAgoraReport').mockResolvedValue(overview())
    showing(overview())

    expect(screen.getByText('8,200 minutes')).toBeInTheDocument()
    expect(screen.getByText('300 minutes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh from Agora' }))

    expect(refresh).toHaveBeenCalled()
  })

  it("says what's missing when Agora's report isn't set up, or failed", () => {
    showing(overview({ report: { configured: false, fetchedAt: null, error: null } }))
    expect(screen.getByText("Only Mela's own count")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh from Agora' })).not.toBeInTheDocument()
  })

  it("shows why Agora's report failed", () => {
    showing(overview({ report: { configured: true, fetchedAt: null, error: 'Agora refused the Customer ID.' } }))
    expect(screen.getByText(/Agora refused the Customer ID/)).toBeInTheDocument()
  })
})

describe('timeUntil', () => {
  const now = new Date('2026-10-22T10:00:00Z')
  it('rounds to minutes, hours or days', () => {
    expect(timeUntil('2026-10-22T10:12:00Z', now)).toBe('12 min')
    expect(timeUntil('2026-10-22T15:00:00Z', now)).toBe('5 h')
    expect(timeUntil('2026-11-01T00:00:00Z', now)).toBe('10 days')
    expect(timeUntil('2026-10-01T00:00:00Z', now)).toBe('0 min')
  })
})
