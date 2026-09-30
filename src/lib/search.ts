// Parsers for URL search params - every filter lives in the URL, so a view
// can be bookmarked, shared and reloaded. Anything unexpected is dropped.

export function text(value: unknown, max = 200): string | undefined {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

export function integer(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

export function day(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

export interface PageSearch {
  page?: number
  pageSize?: number
}

// The defaults (page 1, 25 rows) stay out of the URL.
export function pageSearch(search: Record<string, unknown>): PageSearch {
  const size = integer(search.pageSize, 1, 100)
  return {
    page: integer(search.page, 2, 100_000),
    pageSize:
      size !== undefined && size !== DEFAULT_PAGE_SIZE && (PAGE_SIZES as readonly number[]).includes(size)
        ? size
        : undefined,
  }
}
