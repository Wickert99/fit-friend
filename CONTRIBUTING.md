# Contributing

Fit Friend is built as six packages on one repo. Package 1 (this foundation) is merged first. After that, packages own their folders and meet only through the contracts below. Do not edit another package’s folders. A change to a shared type is a small edit to `src/types.ts` and nothing else.

## Folder ownership

| Package | Owns | Does not touch |
|---|---|---|
| 1 Foundation | `src/app`, `src/ui`, `src/store`, `src/types.ts`, `public/`, `data/` | Feature folders |
| 2 Library & coach | `src/features/library`, `src/features/coach` | Other `src/features/*` |
| 3 Workouts & logging | `src/features/workout`, `src/features/session`, `src/lib/setTypes`, `src/lib/cues` | Plan, progress, friends |
| 4 Plans & programs | `src/features/plan`, `src/features/programs`, `src/lib/personalize` | Session internals |
| 5 Progress & calendar | `src/features/calendar`, `src/features/progress`, `src/lib/cycles`, `src/lib/maxes` | Focus mode |
| 6 Social & sync | `src/features/friends`, `src/lib/supabase`, `src/lib/sync`, `supabase/` | Screen logic for training |

Package 1 seeded `src/lib/supabase/client.ts` (`loadSupabase()`, `isSupabaseConfigured`). From package 6 onward that folder belongs to package 6. When `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is empty, `loadSupabase()` resolves to `null` and the app stays local-only.

Suggested merge order: 1 → 3 → 4 and 2 (either order) → 5 → 6. Package 6’s SQL and auth can land early behind the missing-env flag. Its UI should land last.

## The only shell edit

Replace your screen in `src/app/routes.tsx`. Each entry is a `() => import(...)` loader. Point it at your feature module’s default export and delete the placeholder import. Do not edit `Shell`, the bottom nav, or another route’s loader.

```ts
workout: () => import('../features/workout/TrainScreen.tsx'),
```

Nav hashes already exist. `go(target, params)` from `useStore()` is the router. Useful targets: `today`, `workout` (`dateKey`, `workoutTab`: `day | library | programs | coach | maxes`), `plan` (`planView`: `board | muscles`), `calendar`, `log`, `friends` (`invite`), `session` (`sessionId`), `workout-mode`, `program-detail` (`programId`), `exercise-detail` (`exerciseId`), `program-builder` (no hash; call `backToTab()` to leave). Aliases `library`, `programs`, `coach`, and `maxes` map onto those screens.

The bottom nav is hidden on `session`, `program-detail`, and `program-builder`. Hovering a tab calls `preloadTab`.

Register a leave guard when a screen has unsaved edits:

```ts
useEffect(() => registerLeaveGuard(() => window.confirm('You have unsaved changes. Leave without saving?')), [registerLeaveGuard])
```

Return `false` to cancel navigation.

## Store

`useStore()` is the only way to read or write device state. Persist format is version 2 (`fit-friend-storage-format`) on key `fit-friend-v5`, with exercises and programs in `fit-friend-v5-catalog`. Seed version is `2026-10-12.2`. In-progress sessions and lift maxes are also journaled in IndexedDB (`fit-friend-hot`) so a crash can restore them.

Call the named actions for ordinary writes (`upsertExercise`, `setLiftMax`, `createProgram`, `scheduleDay`, `updateSession`, …). For a behavior that does not have an action yet, use `update(recipe)` from your feature folder. Do not add a write by editing `src/store`.

These workflows are intentionally not implemented here. Build them in the owning package, persisting through `update`:

- Template → board, prep / retest / deload, %1RM → kg (package 4, `src/lib/personalize`)
- Commit to calendar and the month grid (package 5)
- Start / log / complete a focus-mode session, PR detection, Epley + Brzycki (package 3)
- Friends, invites, chat, program shares, cloud sync (package 6)

`Foundation` does not export throwing stubs for those names, so a mistyped call is a type error rather than a runtime surprise. Add a named action to `StoreApi` in `src/types.ts` only when more than one package must call it.

## Prescription editor

Package 3 owns the editor. Package 4 (plan day cards, program builder, muscle-map sessions) imports it and must not reimplement set types or waves.

Implement the component at:

`src/features/workout/PrescriptionEditor.tsx`

Props are `PrescriptionEditorProps` in `src/types.ts`:

```ts
interface PrescriptionEditorProps {
  prescription: Prescription
  onChange: (next: Prescription) => void
  exercise: Exercise | null
  weightUnit: WeightUnit
  maxKg?: number | null
  variant?: 'compact' | 'full' // compact = plan row, full = My day
  disabled?: boolean
  onRemove?: () => void
  onMove?: (direction: -1 | 1) => void
  onSwapExercise?: () => void
}
```

`prescription` is the shared shape for program days, board days, and planned sessions. Persist `setType`, `sets`, `reps` (string), `restSec`, and optional `targetLoadKg`, `targetPercent1RM`, `targetRpe`, `targetRir`, `timeCapSec`, `distanceM`, `schemes` (waves: each scheme has its own sets, reps, and rest). The spec names `percent1RM`, `rir`, and `waves` are accepted aliases; seed JSON and the store use `targetPercent1RM`, `targetRir`, and `schemes`.

`variant="compact"` is one row (set type, sets, reps, load or percent, remove, reorder). `variant="full"` adds duration, metres, time cap, AMRAP, rounds, interval, notes, and the scheme list. Both variants call `onChange` with the next prescription. They do not write the store themselves.

Until that file exists, package 4 should type against `PrescriptionEditorProps` and not invent a second component.

## UI kit

Import from `src/ui`: `Button`, `IconButton`, `Card`, `EmptyState`, `Input`, `TextArea`, `Select`, `Sheet`, `Stepper`, `Badge`, `Chip`, `Segmented`, `Page`, `ScreenHeader`, `useToast`, `useConfirm`, `confirmText`. Sheets lock body scroll. Confirm copy may be a string with `\n\n` between the question and the detail, matching the original `confirm()` text.

Tokens are the warm paper theme in `src/index.css` (`charcoal` is the card, `charcoal-2` is the page, `lime` is terracotta). Inter is the UI font. Caveat (`font-hand`) is for whiteboard pads. Keep the column at `max-w-lg` and tap targets at 44px (`min-h-11`).

## Checks

`npm test` covers the hash router and migrations. `npm run build` must pass before you hand a package off. Add tests next to the module you changed; do not rewrite another package’s tests.
