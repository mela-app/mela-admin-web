import type { AppCrashKind } from '../../lib/types'

/** `GET /admin/crashes/export`: the most common crashes, each with its newest reports - nobody's account. */
export interface CrashExport {
  generatedAt: string
  filters: {
    days: number
    kind: AppCrashKind | null
    appVersion: string | null
    fatal: boolean
    signature: string | null
  }
  totals: { reports: number; fatal: number; users: number; crashes: number }
  groups: CrashExportGroup[]
}

export interface CrashExportGroup {
  signature: string
  kind: AppCrashKind
  fatal: boolean
  message: string
  count: number
  users: number
  firstSeen: string
  lastSeen: string
  versions: string[]
  devices: string[]
  reports: CrashExportReport[]
}

export interface CrashExportReport {
  id: string
  kind: AppCrashKind
  fatal: boolean
  message: string
  stack: string | null
  breadcrumbs: string[]
  platform: string | null
  appVersion: string | null
  appBuild: number | null
  deviceModel: string | null
  osVersion: string | null
  occurredAt: string
  signedIn: boolean
}

// A fence that a stack trace won't contain.
const FENCE = '~~~~'

/**
 * The export as one Markdown file - readable as it is, and ready to hand to
 * whoever fixes the crashes: what each crash is, how often, on which phones
 * and versions, and its newest reports' steps and stacks.
 */
export function crashExportMarkdown(data: CrashExport, kindLabels: Record<AppCrashKind, string>): string {
  const { filters, totals } = data
  const scope = [
    `last ${filters.days === 1 ? '24 hours' : `${filters.days} days`}`,
    filters.kind && kindLabels[filters.kind],
    filters.appVersion && `version ${filters.appVersion}`,
    filters.fatal && 'only when the app closed',
    filters.signature && `crash ${filters.signature}`,
  ].filter(Boolean)
  const lines = [
    '# Mela app crash reports',
    '',
    `Exported ${data.generatedAt} · ${scope.join(' · ')}`,
    '',
    `${totals.crashes} different problems · ${totals.reports} reports · ${totals.fatal} times the app closed by itself · ${totals.users} signed-in people affected.`,
    `Below: the ${data.groups.length} most common, each with up to its 5 newest reports. Accounts are left out.`,
  ]
  data.groups.forEach((group, index) => {
    lines.push(
      '',
      `## ${index + 1}. ${kindLabels[group.kind]}: ${oneLine(group.message)}`,
      '',
      `- Signature: \`${group.signature}\``,
      `- ${group.count} times, ${group.users} signed-in people · first ${group.firstSeen} · last ${group.lastSeen}`,
      `- App versions: ${group.versions.join(', ') || 'unknown'}`,
      `- Phones: ${group.devices.join(', ') || 'unknown'}`,
    )
    group.reports.forEach((report, reportIndex) => {
      const version = report.appVersion
        ? `${report.appVersion}${report.appBuild !== null ? ` (${report.appBuild})` : ''}`
        : 'unknown version'
      lines.push(
        '',
        `### Report ${reportIndex + 1} - ${report.occurredAt}`,
        '',
        `- App ${version} on ${report.platform ?? 'unknown platform'} · ${[report.deviceModel, report.osVersion].filter(Boolean).join(' · ') || 'unknown phone'}`,
        `- ${report.fatal ? 'The app closed' : 'The app kept running'} · ${report.signedIn ? 'signed in' : 'signed out'}`,
        `- Message: ${oneLine(report.message)}`,
      )
      if (report.breadcrumbs.length > 0) {
        lines.push('', 'Just before (oldest first):', '', FENCE, ...report.breadcrumbs, FENCE)
      }
      if (report.stack) lines.push('', 'Stack:', '', FENCE, report.stack, FENCE)
    })
  })
  return lines.join('\n') + '\n'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Hands [text] to the browser as a file download. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
