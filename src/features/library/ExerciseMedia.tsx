import { Dumbbell, ExternalLink, Play, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Exercise } from '../../types.ts'
import { useBodyScrollLock } from '../../ui/useBodyScrollLock.ts'
import { cn } from '../../ui/cn.ts'
import { exerciseImageAlt, exerciseImageUrls, exerciseVideoUrl, exerciseYoutubeId } from './media.ts'
import { useOnline } from './useOnline.ts'

function Placeholder({ name, size, className }: { name: string; size: number; className?: string }) {
  const large = size >= 120
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      role="img"
      aria-label={`${name} (no image)`}
      data-media-placeholder="true"
      className={cn('grid shrink-0 place-items-center border border-charcoal-4 bg-charcoal-2 text-muted', className)}
      style={large ? undefined : { width: size, height: size }}
    >
      {large ? <Dumbbell aria-hidden className="h-10 w-10" /> : <span aria-hidden className="text-base font-semibold">{initial}</span>}
    </div>
  )
}

export function ExerciseThumb({
  exercise,
  name,
  size = 48,
  className,
}: {
  exercise: Exercise | null | undefined
  name: string
  size?: number
  className?: string
}) {
  const src = exerciseImageUrls(exercise)[0]
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = Boolean(src) && failedSrc === src
  if (!src || failed) return <Placeholder name={name} size={size} className={cn('rounded-xl', className)} />
  return (
    <img
      src={src}
      alt={exerciseImageAlt(name, 0)}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      data-media-thumb="true"
      onError={() => setFailedSrc(src)}
      className={cn('shrink-0 rounded-xl border border-charcoal-4 bg-charcoal-2 object-cover', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function ExerciseCarousel({ exercise }: { exercise: Exercise }) {
  const urls = exerciseImageUrls(exercise)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [index, setIndex] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const slides = urls.map((url, slideIndex) => ({ url, slideIndex })).filter((slide) => !failed.has(slide.url))

  const onScroll = () => {
    const node = scroller.current
    if (!node) return
    setIndex(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)))
  }
  const goTo = (slide: number) => {
    const node = scroller.current
    node?.scrollTo({ left: slide * node.clientWidth, behavior: 'smooth' })
  }

  if (slides.length === 0) {
    return <Placeholder name={exercise.name} size={240} className="aspect-[4/3] w-full rounded-2xl" />
  }
  const credit = exercise.imageCredit
  return (
    <figure className="m-0">
      <section aria-roledescription="carousel" aria-label={`${exercise.name} images`} data-media-carousel="true">
        <div
          ref={scroller}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={`${exercise.name} images, swipe for more`}
          className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto rounded-2xl border border-charcoal-4 bg-charcoal-2 [scrollbar-width:none]"
        >
          {slides.map((slide) => (
            <img
              key={slide.url}
              src={slide.url}
              width={480}
              height={360}
              loading="lazy"
              decoding="async"
              alt={exerciseImageAlt(exercise.name, slide.slideIndex)}
              aria-roledescription="slide"
              onError={() => {
                setFailed((current) => new Set(current).add(slide.url))
                setIndex(0)
              }}
              className="h-full w-full shrink-0 snap-center object-contain"
            />
          ))}
        </div>
        {slides.length > 1 ? (
          <div className="mt-1 flex justify-center" role="group" aria-label="Choose image">
            {slides.map((slide, dotIndex) => (
              <button
                key={slide.url}
                type="button"
                onClick={() => goTo(dotIndex)}
                aria-label={`Image ${dotIndex + 1} of ${slides.length}`}
                aria-current={dotIndex === index ? 'true' : undefined}
                className="grid h-11 w-11 place-items-center"
                data-media-dot="true"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-2.5 w-2.5 rounded-full border border-taupe-strong',
                    dotIndex === index ? 'border-lime-dim bg-lime-dim' : 'bg-transparent',
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {typeof credit === 'string' && credit.trim() ? (
        <figcaption className="mt-1 text-center text-[11px] leading-snug text-muted" data-image-credit="true">
          {credit}
        </figcaption>
      ) : null}
    </figure>
  )
}

function DemoSheet({
  exercise,
  youtubeId,
  open,
  onClose,
}: {
  exercise: Exercise
  youtubeId: string
  open: boolean
  onClose: () => void
}) {
  const online = useOnline()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = `demo-title-${exercise.id}`
  useBodyScrollLock(open)

  const close = () => {
    const state = window.history.state as { ffDemoSheet?: boolean } | null
    if (state?.ffDemoSheet) window.history.back()
    else onCloseRef.current()
  }

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    window.history.pushState({ ...(window.history.state ?? {}), ffDemoSheet: true }, '')
    const onPop = () => onCloseRef.current()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        const state = window.history.state as { ffDemoSheet?: boolean } | null
        if (state?.ffDemoSheet) window.history.back()
        else onCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('[data-demo-close]')?.focus()
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="sheet-overlay fixed inset-0 z-[70] flex items-end justify-center bg-ink/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-demo-sheet="true"
        className="w-full max-w-lg rounded-t-3xl bg-charcoal p-4 shadow-raised"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink">
            {exercise.name} demo
          </h2>
          <button
            type="button"
            onClick={close}
            data-demo-close="true"
            aria-label="Close demo video"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-charcoal-4 px-4 text-sm font-semibold text-ink"
          >
            <X aria-hidden className="h-4 w-4" /> Close
          </button>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-charcoal-4 bg-charcoal-2">
          {online ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&playsinline=1`}
              title={`${exercise.name} demo video`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              className="h-full w-full"
              data-demo-embed="true"
            />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center" role="status" aria-live="polite" data-demo-offline="true">
              <div>
                <WifiOff aria-hidden className="mx-auto h-7 w-7 text-muted" />
                <p className="mt-2 text-sm font-semibold text-ink">Demo videos need a connection</p>
                <p className="mt-1 text-sm text-muted">It will start here as soon as you’re back online.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ExerciseWatch({ exercise }: { exercise: Exercise }) {
  const videoUrl = exerciseVideoUrl(exercise)
  const youtubeId = exerciseYoutubeId(exercise)
  const [open, setOpen] = useState(false)
  if (!videoUrl && !youtubeId) return null
  return (
    <div className="flex flex-wrap gap-2" data-watch-demo="true">
      {youtubeId ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-demo-play="true"
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lime-dim px-5 text-sm font-semibold text-white"
        >
          <Play aria-hidden className="h-5 w-5" /> Play demo
        </button>
      ) : null}
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-demo-link="true"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold',
            youtubeId ? 'border border-charcoal-4 text-ink' : 'bg-lime-dim text-white',
          )}
        >
          {youtubeId ? <ExternalLink aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-5 w-5" />}
          {youtubeId ? 'Watch on YouTube' : 'Find a demo on YouTube'}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
      {youtubeId ? <DemoSheet exercise={exercise} youtubeId={youtubeId} open={open} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
