/** Only a real web address goes into an <img> or a link. */
export function isWebUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}
