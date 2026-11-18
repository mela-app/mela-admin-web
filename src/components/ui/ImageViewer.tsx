import { ExternalLink, ImageOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

interface ImageViewerProps {
  /** The picture to show; null closes the viewer. */
  url: string | null
  alt: string
  onClose: () => void
}

/**
 * A picture shown large over the page (a native <dialog>: Escape and a click
 * outside close it), with a link to the original.
 */
export function ImageViewer({ url, alt, onClose }: ImageViewerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (url && !dialog.open) dialog.showModal()
    if (!url && dialog.open) dialog.close()
    setFailed(false)
  }, [url])

  const action =
    'inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20'
  return (
    <dialog
      ref={ref}
      aria-label={alt}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/80 open:flex"
    >
      {url && (
        <div className="flex flex-col items-center gap-3 p-4">
          {failed ? (
            <div className="flex h-64 w-80 max-w-[calc(100vw-2rem)] flex-col items-center justify-center gap-2 rounded-lg bg-zinc-900 text-sm text-zinc-300">
              <ImageOff className="size-8" aria-hidden />
              <p>This picture couldn't be loaded.</p>
            </div>
          ) : (
            <img
              src={url}
              alt={alt}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
              className="max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl"
            />
          )}
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className={action}>
              <ExternalLink className="size-3.5" aria-hidden />
              Open original
            </a>
            <button type="button" onClick={onClose} className={action}>
              <X className="size-3.5" aria-hidden />
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

/**
 * A small picture that opens large when clicked. When it can't be loaded it
 * says so (with the link), instead of a broken-image icon or nothing.
 */
export function ImageThumb({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-2 text-center text-[11px] text-zinc-500 hover:text-brand-700',
          className,
        )}
      >
        <ImageOff className="size-5" aria-hidden />
        <span>Couldn't load picture - open link</span>
      </a>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-fit cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label={`View larger: ${alt}`}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn('rounded-md border border-zinc-200 bg-zinc-100 hover:opacity-90', className)}
        />
      </button>
      <ImageViewer url={open ? url : null} alt={alt} onClose={() => setOpen(false)} />
    </>
  )
}
