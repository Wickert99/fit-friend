import bodyMap from './bodyMap.json'

interface MapSide {
  viewBox: string
  outline?: string
  parts: { slug: string; paths: string[] }[]
}

const maps = bodyMap as {
  male: { front: MapSide; back: MapSide }
  female: { front: MapSide; back: MapSide }
}

const FRONT: Record<string, string> = {
  chest: 'chest',
  deltoids: 'front_delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'forearms',
  trapezius: 'upper_traps',
  abs: 'abs',
  obliques: 'obliques',
  adductors: 'adductors',
  quadriceps: 'quads',
  calves: 'calves',
  tibialis: 'tibialis',
  neck: 'neck',
}

const BACK: Record<string, string> = {
  deltoids: 'rear_delts',
  triceps: 'triceps',
  forearm: 'forearms',
  trapezius: 'upper_traps',
  'upper-back-lats': 'lats',
  'upper-back-mid': 'mid_back',
  'lower-back': 'lower_back',
  gluteal: 'glutes',
  adductors: 'adductors',
  hamstring: 'hamstrings',
  calves: 'calves',
  neck: 'neck',
}

const FILL_OFF = '#d5bfa9'
const FILL_ON = '#a56b4e'
const FILL_OTHER = '#e6d8c8'
const STROKE = '#9c8573'
const STROKE_ON = '#8f5a40'

export function BodyMap({
  sex,
  side,
  selected,
  onToggle,
}: {
  sex: 'male' | 'female'
  side: 'front' | 'back'
  selected: string[]
  onToggle: (muscleId: string) => void
}) {
  const figure = maps[sex][side]
  const lookup = side === 'front' ? FRONT : BACK
  const chosen = new Set(selected)
  return (
    <svg role="img" aria-label={`${sex} ${side} body map`} viewBox={figure.viewBox} className="mx-auto h-auto w-full max-w-xs">
      {figure.outline ? <path d={figure.outline} fill="#f5efe6" stroke={STROKE} strokeWidth={2} /> : null}
      {figure.parts.map((part) => {
        const muscle = lookup[part.slug]
        const highlighted =
          !!muscle && (chosen.has(muscle) || (side === 'front' && part.slug === 'deltoids' && chosen.has('side_delts')))
        return (
          <g
            key={part.slug}
            data-muscle-slug={part.slug}
            onClick={muscle ? () => onToggle(muscle) : undefined}
            style={{ cursor: muscle ? 'pointer' : 'default' }}
          >
            {part.paths.map((path, index) => (
              <path
                key={`${part.slug}-${index}`}
                d={path}
                fill={muscle ? (highlighted ? FILL_ON : FILL_OFF) : FILL_OTHER}
                stroke={highlighted ? STROKE_ON : STROKE}
                strokeWidth={2}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
