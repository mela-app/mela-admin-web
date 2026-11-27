import { describe, expect, it } from 'vitest'
import type { AppCrashKind } from '../../lib/types'
import { crashExportMarkdown, type CrashExport } from './crash-export'

const labels: Record<AppCrashKind, string> = {
  NATIVE_CRASH: 'Native crash',
  JAVA_CRASH: 'Java crash',
  ANR: 'Froze (not responding)',
  LOW_MEMORY: 'Out of memory',
  KILLED: 'Killed by Android',
  OTHER: 'Closed (other)',
  DART_ERROR: 'App error',
}

const data: CrashExport = {
  generatedAt: '2026-11-27T08:00:00.000Z',
  filters: { days: 7, kind: null, appVersion: '1.0.19', fatal: true, signature: null },
  totals: { reports: 6, fatal: 6, users: 3, crashes: 1 },
  groups: [
    {
      signature: 'abcdef0123456789',
      kind: 'NATIVE_CRASH',
      fatal: true,
      message: "Native crash: SIGSEGV (SEGV_MAPERR) in thread 'VideoDecoder'\n at libfoo.so",
      count: 5,
      users: 3,
      firstSeen: '2026-11-25T06:46:40.000Z',
      lastSeen: '2026-11-26T10:00:00.000Z',
      versions: ['1.0.19'],
      devices: ['TECNO TECNO CL6'],
      reports: [
        {
          id: 'r1',
          kind: 'NATIVE_CRASH',
          fatal: true,
          message: 'Native crash: SIGSEGV',
          stack: '#00 pc 0000000000012345  libjingle_peerconnection_so.so (Decode+12)',
          breadcrumbs: ['2026-11-26T09:59:58.000Z live video: viewer joining (livekit)'],
          platform: 'ANDROID',
          appVersion: '1.0.19',
          appBuild: 29,
          deviceModel: 'TECNO TECNO CL6',
          osVersion: 'Android 16 (API 36)',
          occurredAt: '2026-11-26T10:00:00.000Z',
          signedIn: false,
        },
      ],
    },
  ],
}

describe('crashExportMarkdown', () => {
  const text = crashExportMarkdown(data, labels)

  it('says what was exported', () => {
    expect(text).toContain('# Mela app crash reports')
    expect(text).toContain('last 7 days · version 1.0.19 · only when the app closed')
    expect(text).toContain('1 different problems · 6 reports')
  })

  it('gives each crash, on one heading line, with how often and where', () => {
    expect(text).toContain("## 1. Native crash: Native crash: SIGSEGV (SEGV_MAPERR) in thread 'VideoDecoder' at libfoo.so")
    expect(text).toContain('- Signature: `abcdef0123456789`')
    expect(text).toContain('- Phones: TECNO TECNO CL6')
  })

  it("gives each report's phone, steps and stack", () => {
    expect(text).toContain('- App 1.0.19 (29) on ANDROID · TECNO TECNO CL6 · Android 16 (API 36)')
    expect(text).toContain('- The app closed · signed out')
    expect(text).toContain('~~~~\n2026-11-26T09:59:58.000Z live video: viewer joining (livekit)\n~~~~')
    expect(text).toContain('Stack:\n\n~~~~\n#00 pc 0000000000012345  libjingle_peerconnection_so.so (Decode+12)\n~~~~')
  })
})
