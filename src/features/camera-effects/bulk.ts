import type { CameraEffectKind } from '../../lib/types'

const PICTURE = /\.(png|jpe?g|webp)$/i
const EFFECT = /\.deepar$/i
// "viking_thumb.png", "viking-thumbnail.jpg", "viking icon.png" are viking's pictures.
const PICTURE_SUFFIX = /[\s._-]*(thumb(nail)?|icon|preview|cover)$/i

/** One effect to add: its file (or picture, for a background), its thumbnail, and its name. */
export interface BulkItem {
  // The shared part of the file names, lower case: how a file finds its thumbnail.
  base: string
  name: string
  file: File | null
  thumbnail: File | null
}

export interface BulkMatch {
  items: BulkItem[]
  // Pictures with no .deepar of the same name, and anything else that isn't used.
  unused: File[]
}

/** "viking_helmet-v2" -> "Viking Helmet V2". */
export function nameFromFile(base: string): string {
  const words = base
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  return name.slice(0, 40) || 'Untitled'
}

function baseOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

/**
 * Pairs the picked files up: each .deepar with the picture of the same name
 * (its thumbnail); for backgrounds, each picture is one. Sorted by name.
 */
export function matchUploads(files: File[], kind: CameraEffectKind): BulkMatch {
  if (kind === 'BACKGROUND') {
    const pictures = files.filter((file) => PICTURE.test(file.name))
    return {
      items: pictures
        .map((file) => ({ base: baseOf(file.name).toLowerCase(), name: nameFromFile(baseOf(file.name)), file, thumbnail: null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      unused: files.filter((file) => !PICTURE.test(file.name)),
    }
  }
  const effects = files.filter((file) => EFFECT.test(file.name))
  const pictures = files.filter((file) => PICTURE.test(file.name))
  const pictureOf = new Map<string, File>()
  for (const picture of pictures) {
    const base = baseOf(picture.name).replace(PICTURE_SUFFIX, '').toLowerCase()
    if (!pictureOf.has(base)) pictureOf.set(base, picture)
  }
  const used = new Set<File>()
  const items = effects
    .map((file) => {
      const base = baseOf(file.name).toLowerCase()
      const thumbnail = pictureOf.get(base) ?? null
      if (thumbnail) used.add(thumbnail)
      return { base, name: nameFromFile(baseOf(file.name)), file, thumbnail }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return { items, unused: files.filter((file) => !EFFECT.test(file.name) && !used.has(file)) }
}

const SWATCHES = [
  ['#ec4899', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#3b82f6'],
  ['#6366f1', '#06b6d4'],
  ['#f97316', '#db2777'],
  ['#14b8a6', '#84cc16'],
]

/**
 * A square picture for an effect that came without one: a color from its
 * name, and its name on it - so it can be published now and given a real
 * thumbnail later. Null where the browser can't draw.
 */
export async function makeThumbnail(name: string): Promise<File | null> {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext?.('2d')
  if (!context) return null
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const [from, to] = SWATCHES[hash % SWATCHES.length]
  const gradient = context.createLinearGradient(0, 0, 256, 256)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  context.fillStyle = 'rgba(255,255,255,0.95)'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 30px system-ui, sans-serif'
  const words = name.split(' ')
  const lines: string[] = []
  for (const word of words) {
    const last = lines.at(-1)
    if (last && context.measureText(`${last} ${word}`).width < 220) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  const shown = lines.slice(0, 3)
  shown.forEach((line, index) => context.fillText(line, 128, 128 + (index - (shown.length - 1) / 2) * 36, 230))
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], `${name}.png`, { type: 'image/png' }) : null
}
