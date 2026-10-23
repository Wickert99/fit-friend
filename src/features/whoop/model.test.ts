import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_ZONE_RANGES,
  WHOOP_REDIRECT_URI,
  bristolBandMs,
  consumeWhoopNotice,
  describeHeartRate,
  formatZoneDuration,
  isBristolSession,
  matchWhoopWorkout,
  normalizeWhoopWorkout,
  overlapMs,
  readWhoopCallback,
  sessionWindow,
  timeInPercentBandFromSamples,
  timeInPercentBandFromZones,
  whoopCallbackMessage,
  whoopRedirectUri,
  writeWhoopNotice,
  type WhoopWorkout,
  type ZoneDurations,
} from './model.ts'

const official = {
  id: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
  start: '2022-04-24T02:25:44.774Z',
  end: '2022-04-24T10:25:44.774Z',
  sport_name: 'running',
  score_state: 'SCORED',
  score: {
    strain: 8.2463,
    average_heart_rate: 123,
    max_heart_rate: 146,
    kilojoule: 1569.34033203125,
    zone_durations: {
      zone_zero_milli: 300000,
      zone_one_milli: 600000,
      zone_two_milli: 900000,
      zone_three_milli: 900000,
      zone_four_milli: 600000,
      zone_five_milli: 300000,
    },
  },
}

function workout(partial: Partial<WhoopWorkout> & Pick<WhoopWorkout, 'id' | 'start' | 'end'>): WhoopWorkout {
  return {
    sportName: null,
    scoreState: 'SCORED',
    strain: null,
    averageHeartRate: null,
    maxHeartRate: null,
    zoneDurations: null,
    heartRateSamples: null,
    userMaxHeartRate: null,
    ...partial,
  }
}

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('whoop redirect and callback', () => {
  it('builds the GitHub Pages callback and a local callback', () => {
    assert.equal(whoopRedirectUri('https://wickert99.github.io', '/fit-friend/'), WHOOP_REDIRECT_URI)
    assert.equal(whoopRedirectUri('http://127.0.0.1:41731', '/'), 'http://127.0.0.1:41731/whoop-callback.html')
  })

  it('reads the callback hash without treating it as a route query', () => {
    assert.deepEqual(readWhoopCallback('#/whoop-callback?code=abc&state=def'), {
      code: 'abc',
      state: 'def',
      error: undefined,
      errorDescription: undefined,
    })
    assert.equal(readWhoopCallback('#/friends?code=abc'), null)
    assert.equal(readWhoopCallback('#/whoop-callback?error=access_denied&state=def')?.error, 'access_denied')
  })

  it('explains connect results and keeps the notice for one read', () => {
    assert.match(whoopCallbackMessage({ connected: true }), /connected/)
    assert.match(whoopCallbackMessage({ error: 'access_denied' }), /cancelled/)
    assert.match(whoopCallbackMessage({ exchangeError: 'whoop_not_configured' }), /isn't set up/)
    const storage = memory()
    writeWhoopNotice(storage, 'Whoop is connected')
    assert.equal(consumeWhoopNotice(storage), 'Whoop is connected')
    assert.equal(consumeWhoopNotice(storage), null)
  })
})

describe('whoop workout matching', () => {
  const session = { startedAt: '2022-04-24T03:00:00.000Z', completedAt: '2022-04-24T04:00:00.000Z' }

  it('normalizes the official workout score and zone_durations', () => {
    const parsed = normalizeWhoopWorkout(official)
    assert.ok(parsed)
    assert.equal(parsed.sportName, 'running')
    assert.equal(parsed.averageHeartRate, 123)
    assert.equal(parsed.maxHeartRate, 146)
    assert.equal(parsed.strain, 8.2463)
    assert.equal(parsed.zoneDurations?.zoneFourMilli, 600000)
    assert.equal(parsed.userMaxHeartRate, null)
  })

  it('accepts the legacy zone_duration field name', () => {
    const parsed = normalizeWhoopWorkout({
      ...official,
      score: { ...official.score, zone_durations: undefined, zone_duration: official.score.zone_durations },
    })
    assert.equal(parsed?.zoneDurations?.zoneZeroMilli, 300000)
  })

  it('matches the workout with the greatest overlap and ignores a touch at the boundary', () => {
    const window = sessionWindow(session)
    assert.ok(window)
    const parsed = normalizeWhoopWorkout(official)
    assert.ok(parsed)
    const short = workout({
      id: 'short',
      start: '2022-04-24T03:50:00.000Z',
      end: '2022-04-24T04:10:00.000Z',
    })
    const touching = workout({
      id: 'touch',
      start: '2022-04-24T04:00:00.000Z',
      end: '2022-04-24T05:00:00.000Z',
    })
    const before = workout({
      id: 'before',
      start: '2022-04-24T01:00:00.000Z',
      end: '2022-04-24T02:00:00.000Z',
    })
    assert.equal(overlapMs(window.startMs, window.endMs, Date.parse(touching.start), Date.parse(touching.end)), 0)
    assert.equal(matchWhoopWorkout(window, [short, touching, before, parsed])?.id, parsed.id)
  })

  it('breaks an equal overlap by the closer start, then by id', () => {
    const window = sessionWindow(session)
    assert.ok(window)
    const left = workout({ id: 'b', start: '2022-04-24T03:00:00.000Z', end: '2022-04-24T03:30:00.000Z' })
    const right = workout({ id: 'a', start: '2022-04-24T03:30:00.000Z', end: '2022-04-24T04:00:00.000Z' })
    assert.equal(matchWhoopWorkout(window, [right, left])?.id, 'b')
    const tiedA = workout({ id: 'a', start: '2022-04-24T03:00:00.000Z', end: '2022-04-24T03:20:00.000Z' })
    const tiedB = workout({ id: 'b', start: '2022-04-24T03:00:00.000Z', end: '2022-04-24T03:20:00.000Z' })
    assert.equal(matchWhoopWorkout(window, [tiedB, tiedA])?.id, 'a')
  })

  it('returns no window when the session has no finish time', () => {
    assert.equal(sessionWindow({ startedAt: '2022-04-24T03:00:00.000Z' }), null)
    assert.equal(sessionWindow({ startedAt: '2022-04-24T04:00:00.000Z', completedAt: '2022-04-24T03:00:00.000Z' }), null)
  })
})

describe('whoop zone display', () => {
  const zones: ZoneDurations = {
    zoneZeroMilli: 300000,
    zoneOneMilli: 600000,
    zoneTwoMilli: 900000,
    zoneThreeMilli: 900000,
    zoneFourMilli: 600000,
    zoneFiveMilli: 300000,
  }

  it('formats zone durations and the scored workout', () => {
    assert.equal(formatZoneDuration(0), '0s')
    assert.equal(formatZoneDuration(5000), '5s')
    assert.equal(formatZoneDuration(65000), '1m 5s')
    assert.equal(formatZoneDuration(600000), '10m')
    assert.equal(formatZoneDuration(3665000), '1h 1m 5s')
    const workout = normalizeWhoopWorkout(official)
    assert.ok(workout)
    const view = describeHeartRate({
      phase: 'matched',
      session: { name: 'Easy run', startedAt: official.start, completedAt: official.end },
      workout,
    })
    assert.equal(view.kind, 'metrics')
    if (view.kind !== 'metrics') return
    assert.equal(view.metrics.sportName, 'Running')
    assert.equal(view.metrics.average, '123 bpm')
    assert.equal(view.metrics.max, '146 bpm')
    assert.equal(view.metrics.strain, '8.2')
    assert.equal(view.metrics.zones.find((zone) => zone.id === 'zoneFourMilli')?.duration, '10m')
    assert.equal(view.metrics.zones.find((zone) => zone.id === 'zoneTwoMilli')?.duration, '15m')
    assert.equal(view.metrics.bristol, null)
  })

  it('hides strain when Whoop did not send it and explains empty connections', () => {
    const workout = normalizeWhoopWorkout({ ...official, score: { ...official.score, strain: null } })
    assert.ok(workout)
    const view = describeHeartRate({ phase: 'matched', workout })
    assert.equal(view.kind, 'metrics')
    if (view.kind !== 'metrics') return
    assert.equal(view.metrics.strain, null)
    assert.match(describeHeartRate({ phase: 'disconnected' }).kind === 'empty' ? describeHeartRate({ phase: 'disconnected' }).body : '', /Connect Whoop/)
    const disconnected = describeHeartRate({ phase: 'disconnected' })
    assert.equal(disconnected.kind, 'empty')
    if (disconnected.kind === 'empty') assert.match(disconnected.body, /Connect Whoop/)
    const missing = describeHeartRate({ phase: 'no_match' })
    assert.equal(missing.kind, 'empty')
    if (missing.kind === 'empty') assert.match(missing.title, /No Whoop workout/)
    const pending = describeHeartRate({
      phase: 'matched',
      workout: { ...workout, scoreState: 'PENDING_SCORE' },
    })
    assert.equal(pending.kind, 'empty')
    if (pending.kind === 'empty') assert.match(pending.body, /still scoring/)
  })

  it('does not invent the 80–85% band from Whoop zone 4', () => {
    assert.equal(timeInPercentBandFromZones(zones, DEFAULT_ZONE_RANGES, 80, 85), null)
    const parsed = normalizeWhoopWorkout(official)
    assert.ok(parsed)
    assert.equal(bristolBandMs(parsed), null)
    const view = describeHeartRate({
      phase: 'matched',
      session: { programId: 'prog-bristol-method', name: 'Bristol Method' },
      workout: parsed,
    })
    assert.equal(view.kind, 'metrics')
    if (view.kind !== 'metrics') return
    assert.equal(view.metrics.bristol?.kind, 'unavailable')
    if (view.metrics.bristol?.kind === 'unavailable') {
      assert.match(view.metrics.bristol.text, /80–85%/)
      assert.match(view.metrics.bristol.text, /80–90%/)
      assert.doesNotMatch(view.metrics.bristol.text, /10m/)
    }
  })

  it('counts the band when zone 4 is empty or a zone is exactly 80–85%', () => {
    const emptyZoneFour: ZoneDurations = { ...zones, zoneFourMilli: 0 }
    assert.equal(timeInPercentBandFromZones(emptyZoneFour, DEFAULT_ZONE_RANGES, 80, 85), 0)
    const exact = {
      ...DEFAULT_ZONE_RANGES,
      zoneFourMilli: { low: 80, high: 85 },
    }
    assert.equal(timeInPercentBandFromZones(zones, exact, 80, 85), 600000)
    const parsed = normalizeWhoopWorkout(official)
    assert.ok(parsed)
    const view = describeHeartRate({
      phase: 'matched',
      session: { name: 'Saturday Bristol Method' },
      workout: {
        ...parsed,
        zoneDurations: emptyZoneFour,
      },
    })
    assert.equal(view.kind, 'metrics')
    if (view.kind !== 'metrics') return
    assert.deepEqual(view.metrics.bristol, { kind: 'band', label: '80–85% max HR', duration: '0s' })
    assert.equal(isBristolSession({ name: 'Morning Bristol' }), false)
  })

  it('derives 80–85% time from samples and a known max heart rate', () => {
    const samples = [
      { at: 0, bpm: 160 },
      { at: 10_000, bpm: 170 },
      { at: 20_000, bpm: 171 },
      { at: 30_000, bpm: 100 },
    ]
    assert.equal(timeInPercentBandFromSamples(samples, 200, 80, 85), 20_000)
    assert.equal(timeInPercentBandFromSamples([{ at: 0, bpm: 160 }], 200, 80, 85), null)
    const parsed = normalizeWhoopWorkout({
      ...official,
      user_max_heart_rate: 200,
      score: {
        ...official.score,
        heart_rate_samples: [
          { time: '2022-04-24T03:00:00.000Z', bpm: 164 },
          { time: '2022-04-24T03:00:10.000Z', bpm: 164 },
          { time: '2022-04-24T03:00:20.000Z', bpm: 100 },
        ],
      },
    })
    assert.ok(parsed)
    assert.equal(bristolBandMs(parsed), 20_000)
    const view = describeHeartRate({
      phase: 'matched',
      session: { programId: 'prog-bristol-method' },
      workout: parsed,
    })
    assert.equal(view.kind, 'metrics')
    if (view.kind !== 'metrics') return
    assert.deepEqual(view.metrics.bristol, { kind: 'band', label: '80–85% max HR', duration: '20s' })
  })
})
