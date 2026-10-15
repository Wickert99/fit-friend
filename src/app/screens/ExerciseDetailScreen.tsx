import { useStore } from '../../store/useStore.ts'
import { Badge, Card } from '../../ui/index.ts'
import { FeatureStub } from './stub.tsx'

export default function ExerciseDetailScreen() {
  const { nav, state } = useStore()
  const exercise = state.exercises.find((item) => item.id === nav.exerciseId)
  return (
    <FeatureStub
      title={exercise?.name ?? 'Exercise'}
      subtitle={exercise?.theme}
      owner="WP2 · library"
      note="The image carousel, YouTube demo, and coaching cues are the exercise detail package. The record below is already in the seed."
    >
      {exercise ? (
        <Card>
          <div className="flex flex-wrap gap-2">
            <Badge tone="lime">{exercise.theme}</Badge>
            {exercise.equipment.slice(0, 3).map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{exercise.description}</p>
          {exercise.imageUrls[0] ? (
            <img src={exercise.imageUrls[0]} alt="" className="mt-3 aspect-video w-full rounded-xl bg-charcoal-3 object-cover" />
          ) : null}
        </Card>
      ) : (
        <Card className="border-dashed">
          <p className="font-semibold">Exercise not found.</p>
        </Card>
      )}
    </FeatureStub>
  )
}
