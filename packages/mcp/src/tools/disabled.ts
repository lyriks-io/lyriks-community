// A disabled element of a feature's behaviour, read off the tree the platform
// serves. The engine keeps the marker on the element ({ by, at, reason }) and
// leaves the element out of every reading; the gateway shows it, counts it
// apart in the table of contents, and exports its scenarios skipped.

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : [])

/** Who disabled the element, when and why. */
export interface DisabledMarker { by: string; at: string; reason: string }

/** The marker an element carries itself, or null while it is in force. */
export function markerOf(element: unknown): DisabledMarker | null {
  if (!isRow(element) || !isRow(element.disabled)) return null
  const { by, at, reason } = element.disabled
  if (typeof reason !== 'string' || reason.trim() === '') return null
  return { by: typeof by === 'string' ? by : '', at: typeof at === 'string' ? at : '', reason }
}

export interface DisabledCounts {
  total: number
  feature: number
  actions: number
  rules: number
  invariants: number
  scenarios: number
  reachabilityGoals: number
}

/**
 * How many elements of the feature are disabled, each kind apart: the ones
 * disabled on their own and the ones a disabled action or feature holds, the
 * way the engine leaves them out of its readings.
 */
export function disabledCounts(feature: Row): DisabledCounts {
  const off = markerOf(feature) !== null
  const counts: DisabledCounts = { total: 0, feature: off ? 1 : 0, actions: 0, rules: 0, invariants: 0, scenarios: 0, reachabilityGoals: 0 }
  const tally = (list: unknown, key: Exclude<keyof DisabledCounts, 'total' | 'feature'>, held: boolean) => {
    for (const element of rows(list)) if (held || markerOf(element)) counts[key] += 1
  }
  tally(feature.featureInvariants, 'invariants', off)
  tally(feature.reachabilityGoals, 'reachabilityGoals', off)
  for (const surface of rows(feature.surfaces)) {
    tally(surface.rules, 'rules', off)
    tally(surface.invariants, 'invariants', off)
    for (const action of rows(surface.actions)) {
      const held = off || markerOf(action) !== null
      if (held) counts.actions += 1
      tally(action.rules, 'rules', held)
      tally(action.invariants, 'invariants', held)
      tally(action.scenarios, 'scenarios', held)
    }
  }
  counts.total = counts.feature + counts.actions + counts.rules + counts.invariants + counts.scenarios + counts.reachabilityGoals
  return counts
}

/**
 * Why no reading runs this scenario: its own marker, its action's, the
 * feature's, or the one of a disabled action it replays as a step. Null while
 * it runs.
 */
export function scenarioLeftOut(feature: Row, action: Row, scenario: Row): DisabledMarker | null {
  const own = markerOf(scenario) ?? markerOf(action) ?? markerOf(feature)
  if (own) return own
  const actions = rows(feature.surfaces).flatMap((s) => rows(s.actions))
  for (const step of rows(scenario.steps)) {
    const replayed = actions.find((a) => a.id === step.actionId)
    const marker = replayed ? markerOf(replayed) : null
    if (marker) return marker
  }
  return null
}
